import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Pressable, ScrollView
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { usePostHog } from 'posthog-react-native';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen({ navigation, route }) {
  const posthog = usePostHog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [lastUsed, setLastUsed] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('lastLoginMethod').then(method => {
      if (method) setLastUsed(method);
    });
  }, []);

  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }]
  }));

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    buttonScale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  // With implicit flow, Supabase returns tokens directly in the URL hash.
  // e.g. jinni://google-auth#access_token=...&refresh_token=...
  const parseAndSetSession = async (url) => {
    try {
      const errorMatch = url.match(/[#?&]error=([^&]+)/);
      if (errorMatch) {
        const errorDesc = url.match(/[#?&]error_description=([^&]+)/);
        const msg = errorDesc ? decodeURIComponent(errorDesc[1]).replace(/\+/g, ' ') : decodeURIComponent(errorMatch[1]);
        throw new Error(msg);
      }

      // Extract tokens regardless of # or ? and regardless of order
      const accessTokenMatch = url.match(/[#?&]access_token=([^&]+)/);
      const refreshTokenMatch = url.match(/[#?&]refresh_token=([^&]+)/);

      if (accessTokenMatch && refreshTokenMatch) {
        const access_token = decodeURIComponent(accessTokenMatch[1]);
        const refresh_token = decodeURIComponent(refreshTokenMatch[1]);
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
        if (data?.session) await handleAuthSuccess(data.session.user, data.session.access_token);
        return;
      }

      // Query param fallback (PKCE)
      const codeMatch = url.match(/[?&]code=([^&]+)/);
      if (codeMatch) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(
          decodeURIComponent(codeMatch[1])
        );
        if (error) throw error;
        if (data?.session) await handleAuthSuccess(data.session.user, data.session.access_token);
        return;
      }

      Alert.alert('Sign-In Error', 'No authorization tokens or code were found in the response URL.');
      setGoogleLoading(false);
    } catch (err) {
      console.error('[Auth] Failed to parse redirect:', err.message);
      Alert.alert('Google Sign-In Error', err.message || 'Could not complete Google sign-in. Please try again.');
      setGoogleLoading(false);
    }
  };

  const isNavigating = React.useRef(false);

  const fetchProfileDirect = async (table, userId, accessToken) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('[Jinni] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
    }

    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`;
    
    // Add an AbortController so it physically cannot hang forever
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.text().catch(() => '(unreadable body)');
        throw new Error(`[Jinni] REST ${table} query failed — HTTP ${res.status}: ${body}`);
      }

      const rows = await res.json();
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  const handleAuthSuccess = async (user, accessToken, forceNavigate = false) => {
    if (isNavigating.current && !forceNavigate) return;
    isNavigating.current = true;
    
    if (!accessToken) {
      isNavigating.current = false;
      return;
    }

    try {
      const empData = await fetchProfileDirect('employer_profiles', user.id, accessToken);

      if (empData && empData.user_name) {
        Sentry.setUser({ id: user.id, email: user.email, role: 'employer' });
        // Identify the user in PostHog with stable user ID as distinct_id
        posthog.identify(user.id, {
          $set: { user_type: 'employer', company_name: empData.company_name },
          $set_once: { first_login_date: new Date().toISOString() },
        });
        posthog.capture('user_logged_in', { user_type: 'employer', login_method: await AsyncStorage.getItem('lastLoginMethod') || 'unknown' });
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Main',
            params: {
              userName:    empData.user_name,
              userRole:    empData.user_role || empData.job_type,
              jobType:     empData.job_type,
              aboutMe:     empData.about_me,
              searchTarget: empData.search_target,
              userType:    'employer',
              skills:      empData.skills || [],
              cvUrl:       empData.cv_url,
              category:    empData.category,
              companyName: empData.company_name,
            }
          }],
        });
        return;
      }

      const seekerData = await fetchProfileDirect('seeker_profiles', user.id, accessToken);

      if (seekerData && seekerData.user_name) {
        Sentry.setUser({ id: user.id, email: user.email, role: 'seeker' });
        // Identify the user in PostHog with stable user ID as distinct_id
        posthog.identify(user.id, {
          $set: { user_type: 'seeker', job_type: seekerData.job_type, category: seekerData.category },
          $set_once: { first_login_date: new Date().toISOString() },
        });
        posthog.capture('user_logged_in', { user_type: 'seeker', login_method: await AsyncStorage.getItem('lastLoginMethod') || 'unknown' });
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Main',
            params: {
              userName:    seekerData.user_name,
              userRole:    seekerData.user_role || seekerData.job_type,
              jobType:     seekerData.job_type,
              aboutMe:     seekerData.about_me,
              searchTarget: seekerData.search_target,
              userType:    'seeker',
              skills:      seekerData.skills || [],
              cvUrl:       seekerData.cv_url,
              category:    seekerData.category,
            }
          }],
        });
        return;
      }

      const currentRole = route?.params?.role || 'seeker';
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login', params: { role: currentRole } }],
      });
    } catch (err) {
      console.error('[Auth] handleAuthSuccess error:', err.message);
      isNavigating.current = false;
      const currentRole = route?.params?.role || 'seeker';
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login', params: { role: currentRole } }],
      });
    }
  };

  // For handling the deep link redirect in expo-web-browser manually
  useEffect(() => {
    const handleDeepLink = (event) => {
      const url = typeof event === 'string' ? event : event?.url;
      console.log('Intercepted deep link event URL:', url);
      if (url && (url.includes('jinni://') || url.includes('google-auth') || url.includes('--/google-auth') || url.includes('linkedin-auth') || url.includes('--/linkedin-auth'))) {
        parseAndSetSession(url);
      }
    };
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Got initial URL on mount:', url);
        handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Listen for auth state changes to route user.
  // We pass forceNavigate=true so that even if the deep-link handler already set
  // isNavigating=true (but may have failed), we still navigate successfully.
  // We guard against duplicate calls by only acting on SIGNED_IN events.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('[Auth] onAuthStateChange SIGNED_IN — routing user...');
        await handleAuthSuccess(session.user, session.access_token);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleForgotPassword = async () => {
    const emailRegex = /.+@.+\..+/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        Alert.alert('Reset Password Error', error.message);
      } else {
        Alert.alert('Password Reset', 'If this email is registered, you will receive a reset link shortly.');
      }
    } catch (err) {
      Alert.alert('Reset Password Error', err.message);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    const emailRegex = /.+@.+\..+/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }

    if (password.trim().length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) {
        Alert.alert('Sign Up Error', error.message);
      } else {
        if (data?.session) {
          AsyncStorage.setItem('lastLoginMethod', 'email');
          // Signed in immediately! Auth listener handles routing.
          posthog.capture('user_signed_up', { login_method: 'email', role: route?.params?.role || 'seeker' });
        } else if (data?.user) {
          // Email confirmation required — user is registered but not yet signed in.
          posthog.capture('user_signed_up', { login_method: 'email', role: route?.params?.role || 'seeker', email_confirmation_required: true });
          Alert.alert('Sign Up Successful!', 'Check your email inbox to verify your account if email confirmation is enabled.');
        } else {
          Alert.alert('Sign Up Successful!', 'Check your email inbox to verify your account if email confirmation is enabled.');
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) {
        Alert.alert('Login Error', error.message);
      } else {
        AsyncStorage.setItem('lastLoginMethod', 'email');
      }
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await AsyncStorage.setItem('lastLoginMethod', 'google');
    
    // Generate the most reliable redirect URI for this exact environment (Expo Go vs Dev Build vs Prod)
    // Omit explicit scheme so Expo handles it appropriately for the environment.
    const redirectUrl = makeRedirectUri({
      path: 'google-auth'
    });

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

      // WebBrowser will automatically close and return type: 'success' when it intercepts a URL starting with redirectUrl.
      // If the URL isn't configured in Supabase, Supabase will not redirect here, and the browser will stay open.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        await parseAndSetSession(result.url);
      } else {
        // If it was cancelled or dismissed, check if we somehow got a session anyway
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await handleAuthSuccess(session.user, session.access_token);
        } else if (result.type !== 'cancel') {
          // If we got dismissed and there's no session, it's almost certainly a Redirect URI issue in Supabase!
          Alert.alert(
            'Configuration Required',
            `Google Auth could not complete. This usually happens if the exact redirect URL is missing from your Supabase Dashboard.\n\nPlease add EXACTLY this URL to Supabase -> Auth -> URL Configuration -> Redirect URLs:\n\n${redirectUrl}\n\n(It can take ~5 minutes to propagate after adding).`,
            [{ text: 'OK' }]
          );
        }
      }
    } catch (err) {
      console.error('[GoogleAuth] Error:', err.message);
      Alert.alert('Google Sign-In Failed', err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLinkedInSignIn = async () => {
    setLinkedinLoading(true);
    await AsyncStorage.setItem('lastLoginMethod', 'linkedin');
    
    const redirectUrl = makeRedirectUri({
      path: 'linkedin-auth'
    });

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        await parseAndSetSession(result.url);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await handleAuthSuccess(session.user, session.access_token);
        } else if (result.type !== 'cancel') {
          Alert.alert(
            'Configuration Required',
            `LinkedIn Auth could not complete. Please add exactly this URL to Supabase -> Auth -> Redirect URLs:\n\n${redirectUrl}`,
            [{ text: 'OK' }]
          );
        }
      }
    } catch (err) {
      console.error('[LinkedInAuth] Error:', err.message);
      Alert.alert('LinkedIn Sign-In Failed', err.message);
    } finally {
      setLinkedinLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Logo / Branding */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[C.orange, C.mango]}
              style={styles.logoBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.logoEmoji}>🧞‍♂️</Text>
            </LinearGradient>
            <Text style={styles.logoText}>Jinni</Text>
            <Text style={styles.logoTagline}>Where job wishes come true</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {isSignUp 
                ? `Create ${route?.params?.role === 'employer' ? 'Employer ' : ''}account` 
                : 'Welcome back'}
            </Text>

            <View style={styles.group}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. you@example.com"
                placeholderTextColor={C.hint}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            <View style={styles.group}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor={C.hint}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeIconContainer}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={C.hint} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordContainer}>
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Email Button */}
            <Pressable 
              onPress={handleEmailAuth} 
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={loading}
            >
              <Animated.View style={buttonAnimatedStyle}>
                <LinearGradient colors={[C.orange, C.mango]} style={styles.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.ctaText}>{isSignUp ? 'Sign Up' : 'Log In'}</Text>
                  )}
                  {lastUsed === 'email' && (
                    <View style={styles.lastUsedBadgeAbs}>
                      <Text style={styles.lastUsedTextAbs}>Last used</Text>
                    </View>
                  )}
                </LinearGradient>
              </Animated.View>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable 
              onPress={handleGoogleSignIn} 
              disabled={googleLoading || linkedinLoading}
              style={({ pressed }) => [
                styles.socialBtn,
                pressed && styles.socialBtnPressed
              ]}
            >
              {googleLoading ? (
                <ActivityIndicator color={C.night} size="small" />
              ) : (
                <>
                  <Text style={styles.socialIcon}>G</Text>
                  <Text style={styles.socialText}>Google</Text>
                  {lastUsed === 'google' && (
                    <View style={styles.lastUsedBadgeAbsSocial}>
                      <Text style={styles.lastUsedTextAbsSocial}>Last used</Text>
                    </View>
                  )}
                </>
              )}
            </Pressable>

            <Pressable 
              onPress={handleLinkedInSignIn} 
              disabled={googleLoading || linkedinLoading}
              style={({ pressed }) => [
                styles.socialBtn,
                pressed && styles.socialBtnPressed
              ]}
            >
              {linkedinLoading ? (
                <ActivityIndicator color="#0A66C2" size="small" />
              ) : (
                <>
                  <Text style={[styles.socialIcon, { color: '#0A66C2' }]}>in</Text>
                  <Text style={styles.socialText}>LinkedIn</Text>
                  {lastUsed === 'linkedin' && (
                    <View style={styles.lastUsedBadgeAbsSocial}>
                      <Text style={styles.lastUsedTextAbsSocial}>Last used</Text>
                    </View>
                  )}
                </>
              )}
            </Pressable>
          </View>

          {/* Toggle */}
          <Pressable 
            onPress={() => setIsSignUp(!isSignUp)} 
            style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 40, justifyContent: 'center', gap: 40 },
  logoContainer: { alignItems: 'center', gap: 8 },
  logoBadge: {
    width: 72, height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  logoEmoji: { fontSize: 36 },
  logoText: { fontSize: 32, fontWeight: '900', color: C.night },
  logoTagline: { fontSize: 14, color: C.muted, fontWeight: '500' },

  form: { gap: 20 },
  formTitle: { fontSize: 20, fontWeight: '800', color: C.night, textAlign: 'center', marginBottom: 10 },
  group: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1A1A1A',
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1A1A1A',
  },
  eyeIconContainer: {
    padding: 14,
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotPasswordText: {
    color: C.orange,
    fontSize: 13,
    fontWeight: '600',
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.06)' },
  dividerText: { fontSize: 12, color: C.hint, fontWeight: '600' },

  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
    paddingVertical: 14,
    gap: 12,
    position: 'relative',
  },
  socialBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderColor: 'rgba(0,0,0,0.1)',
  },
  socialIcon: { fontSize: 18, fontWeight: '900', color: C.night },
  socialText: { fontSize: 15, fontWeight: '700', color: C.night },

  toggleBtn: { paddingVertical: 10 },
  toggleText: { fontSize: 14, color: C.orange, fontWeight: '600', textAlign: 'center' },

  lastUsedBadgeAbs: {
    position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -10 }],
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4
  },
  lastUsedTextAbs: { color: '#fff', fontSize: 10, fontWeight: '700' },

  lastUsedBadgeAbsSocial: {
    position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -10 }],
    backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4
  },
  lastUsedTextAbsSocial: { color: C.hint, fontSize: 10, fontWeight: '700' },
});

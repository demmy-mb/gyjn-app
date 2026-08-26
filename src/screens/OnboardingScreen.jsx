import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Platform, KeyboardAvoidingView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat,
  withSequence, withSpring, SlideInRight, SlideOutLeft, SlideInLeft, SlideOutRight, FadeIn, FadeOut
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import { makeRedirectUri } from 'expo-auth-session';
import * as Sentry from '@sentry/react-native';
import { usePostHog } from 'posthog-react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeProvider';
import { springs, timings } from '../lib/animations';
import StaggeredList from '../components/StaggeredList';
import BounceButton from '../components/BounceButton';
import AnimatedInput from '../components/AnimatedInput';

WebBrowser.maybeCompleteAuthSession();

// --- Reusable Components ---
function SelectionCard({ emoji, label, desc, onPress, colorTheme }) {
  const { colors, typography, radii, shadows } = useTheme();
  const isHovered = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: isHovered.value ? colors.brand.orange : colors.border.light,
    backgroundColor: colors.bg.card,
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(isHovered.value ? 5 : 0, springs.snappy) }]
  }));

  return (
    <BounceButton
      onPress={onPress}
      onPressIn={() => (isHovered.value = true)}
      onPressOut={() => (isHovered.value = false)}
      activeScale={0.97}
      style={{ marginBottom: 16 }}
    >
      <Animated.View style={[styles.card, { borderRadius: radii['2xl'] }, shadows.sm, animatedStyle]}>
        <View style={styles.cardLeft}>
          <View style={[styles.emojiBox, { backgroundColor: colorTheme, borderRadius: radii.lg }]}>
            <Text style={styles.cardEmoji}>{emoji}</Text>
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={[typography.title, { color: colors.text.primary }]}>{label}</Text>
            <Text style={[typography.label, { color: colors.text.secondary }]}>{desc}</Text>
          </View>
        </View>
        <Animated.View style={[styles.arrowContainer, arrowStyle]}>
          <LinearGradient
            colors={[colors.brand.orange, colors.brand.mango]}
            style={[styles.arrowGradient, { borderRadius: radii.circle }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.cardArrow}>➔</Text>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </BounceButton>
  );
}

// --- Main Wizard Screen ---
export default function OnboardingScreen({ navigation, route }) {
  const posthog = usePostHog();
  const { colors, typography, radii, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  // Navigation / Wizard State
  const isLogin = route?.params?.isLogin || false;
  const [step, setStep] = useState(route?.params?.initialStep || 1);
  const [animDirection, setAnimDirection] = useState(1);
  const [role, setRole] = useState(null);

  const changeStep = (newStep) => {
    if (newStep === step) return;
    setAnimDirection(newStep > step ? 1 : -1);
    setTimeout(() => {
      setStep(newStep);
    }, 10);
  };

  // Auth State
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Profile Generation State
  const [cvLoading, setCvLoading] = useState(false);
  const [profileData, setProfileData] = useState({
    user_name: '',
    job_type: '',
    industry: '',
    skills: [],
    experience_level: '',
    about_me: '',
    location: '',
    phone: '',
    email: '',
    company: '',
    role_title: '',
    work_wins: '',
    gaps: '',
    tone_format: 'Professional & Direct',
  });
  const isNavigating = useRef(false);
  const scrollViewRef3 = useRef(null);

  console.log('--- RENDERING NEW ONBOARDING SCREEN ---', step);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 4.6) changeStep(4.5);
    else if (step === 4.5) changeStep(4.4);
    else if (step === 4.4) changeStep(4.3);
    else if (step === 4.3) changeStep(4.2);
    else if (step === 4.2) changeStep(4.1);
    else if (step === 4.1) changeStep(4);
    else if (step === 5) changeStep(4);
    else if (step > 1) changeStep(step - 1);
    else if (step === 1 && navigation.canGoBack()) navigation.goBack();
  };

  const enteringAnim = animDirection === 1 ? SlideInRight.springify() : SlideInLeft.springify();
  const exitingAnim = animDirection === 1 ? SlideOutLeft : SlideOutRight;

  // Visuals
  const rocketOffset = useSharedValue(0);
  useEffect(() => {
    rocketOffset.value = withRepeat(
      withSequence(withTiming(-5, timings.slow), withTiming(0, timings.slow)),
      -1, true
    );
  }, []);
  const rocketStyle = useAnimatedStyle(() => ({ transform: [{ translateY: rocketOffset.value }] }));

  // Progress Bar
  const progressWidth = useSharedValue(0);
  useEffect(() => {
    progressWidth.value = withSpring((step / 6) * 100, springs.snappy);
  }, [step]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressWidth.value}%` }));

  // ==========================================
  // Auth Helpers
  // ==========================================
  useEffect(() => {
    const handleDeepLink = (event) => {
      const url = typeof event === 'string' ? event : event?.url;
      if (url && (url.includes('google-auth') || url.includes('linkedin-auth') || url.includes('jinni://'))) {
        parseAndSetSession(url);
      }
    };
    const subscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url); });
    return () => subscription.remove();
  }, []);

  const parseAndSetSession = async (url) => {
    try {
      const accessTokenMatch = url.match(/[#?&]access_token=([^&]+)/);
      const refreshTokenMatch = url.match(/[#?&]refresh_token=([^&]+)/);
      if (accessTokenMatch && refreshTokenMatch) {
        const { data, error } = await supabase.auth.setSession({
          access_token: decodeURIComponent(accessTokenMatch[1]),
          refresh_token: decodeURIComponent(refreshTokenMatch[1])
        });
        if (error) throw error;
        if (data?.session) await handleAuthSuccess(data.session.user, data.session.access_token);
        return;
      }
      const codeMatch = url.match(/[?&]code=([^&]+)/);
      if (codeMatch) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(codeMatch[1]));
        if (error) throw error;
        if (data?.session) await handleAuthSuccess(data.session.user, data.session.access_token);
      }
    } catch (err) {
      Alert.alert('Sign-In Error', err.message);
      setGoogleLoading(false);
    }
  };

  const fetchProfileDirect = async (table, userId, accessToken) => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return null;
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows.length > 0 ? rows[0] : null;
    } catch (e) {
      return null;
    }
  };

  const handleAuthSuccess = async (user, accessToken) => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    setGoogleLoading(false);
    setAuthLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    try {
      const empData = await fetchProfileDirect('employer_profiles', user.id, accessToken);
      if (empData && empData.user_name) {
        Sentry.setUser({ id: user.id, email: user.email, role: 'employer' });
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Main',
            params: {
              userName: empData.user_name,
              userRole: empData.user_role || empData.job_type,
              jobType: empData.job_type,
              aboutMe: empData.about_me,
              searchTarget: empData.search_target,
              userType: 'employer',
              skills: empData.skills || [],
              cvUrl: empData.cv_url,
              category: empData.category,
              companyName: empData.company_name,
            }
          }],
        });
        return;
      }

      const seekerData = await fetchProfileDirect('seeker_profiles', user.id, accessToken);
      if (seekerData && seekerData.user_name) {
        Sentry.setUser({ id: user.id, email: user.email, role: 'seeker' });
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Main',
            params: {
              userName: seekerData.user_name,
              userRole: seekerData.user_role || seekerData.job_type,
              jobType: seekerData.job_type,
              aboutMe: seekerData.about_me,
              searchTarget: seekerData.search_target,
              userType: 'seeker',
              skills: seekerData.skills || [],
              cvUrl: seekerData.cv_url,
              category: seekerData.category,
            }
          }],
        });
        return;
      }
    } catch (err) {
      console.warn("Profile check failed in onboarding:", err);
    }
    
    isNavigating.current = false;
    // Proceed to CV branch for new users
    changeStep(4);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    await AsyncStorage.setItem('lastLoginMethod', 'google');
    const redirectUrl = makeRedirectUri({ path: 'google-auth' });
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error) throw error;
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        await parseAndSetSession(result.url);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) await handleAuthSuccess(session.user, session.access_token);
      }
    } catch (err) {
      Alert.alert('Google Sign-In Failed', err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) return Alert.alert('Validation', 'Enter email and password');
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: password.trim() });
    if (error && error.message.includes('already registered')) {
      const { error: signInError, data: signInData } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
      if (signInError) Alert.alert('Login Error', signInError.message);
      else if (signInData?.session) await handleAuthSuccess(signInData.session.user, signInData.session.access_token);
    } else if (data?.session) {
      posthog.capture('user_signed_up', { login_method: 'email', role: 'seeker' });
      await handleAuthSuccess(data.session.user, data.session.access_token);
    } else if (error) {
      Alert.alert('Sign Up Error', error.message);
    }
    setAuthLoading(false);
  };

  // ==========================================
  // CV & Profile Handlers
  // ==========================================
  const handleFileUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!res.canceled) {
        setCvLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        
        try {
          const base64Data = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
          
          const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

          const requestBody = {
            contents: [{
              parts: [
                { text: "Please parse this CV and extract the requested fields. Ensure skills is an array of strings." },
                { inline_data: { mime_type: "application/pdf", data: base64Data } }
              ]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  user_name: { type: "STRING", description: "The candidate full name." },
                  job_type: { type: "STRING", description: "A suitable professional role." },
                  about_me: { type: "STRING", description: "A short 2 sentence bio." },
                  experience_level: { type: "STRING", description: "Experience level (e.g. Junior, Mid-Level (3-5 yrs))." },
                  skills: { type: "ARRAY", items: { type: "STRING" }, description: "Top 3-5 technical or professional skills." }
                },
                required: ["user_name", "job_type", "about_me", "experience_level", "skills"]
              }
            }
          };

          const apiRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!apiRes.ok) throw new Error(`Gemini API Error: ${apiRes.statusText}`);
          const data = await apiRes.json();
          
          const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!textResponse) throw new Error("Invalid response structure from Gemini API");

          const parsed = JSON.parse(textResponse);

          setProfileData({
            user_name: parsed.user_name || '',
            job_type: parsed.job_type || '',
            skills: parsed.skills || [],
            experience_level: parsed.experience_level || '',
            about_me: parsed.about_me || '',
            location: 'Remote',
          });

          setCvLoading(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          changeStep(5); // Go to Validation
        } catch (apiError) {
          console.error("Gemini Parse Error:", apiError);
          Sentry.captureException(apiError);
          setCvLoading(false);
          Alert.alert('AI Parsing Failed', `Error: ${apiError.message || JSON.stringify(apiError)}`);
          changeStep(4.5); // Fallback to guided form
        }
      }
    } catch (e) {
      console.error("Upload Error:", e);
      Sentry.captureException(e);
      setCvLoading(false);
      Alert.alert('Upload Error', 'Could not process PDF.');
    }
  };

  const generateProfileWithAI = async () => {
    setCvLoading(true);
    changeStep(4.6);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const prompt = `You are an expert CV writer. The user provided the following details to build their CV:
Name: ${profileData.user_name}
Location: ${profileData.location}
Target Role: ${profileData.job_type}
Industry: ${profileData.industry}
Experience Level: ${profileData.experience_level}
Work History: ${profileData.role_title} at ${profileData.company}. Key wins: ${profileData.work_wins}
Skills: ${profileData.skills.join(', ')}
Career Gaps: ${profileData.gaps}
Tone/Format: ${profileData.tone_format}

Please synthesize this into a professional profile. Extract and format the requested fields. Ensure skills is an array of strings. Generate a compelling 2 sentence 'about_me' bio that reflects the requested tone.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              user_name: { type: "STRING" },
              job_type: { type: "STRING" },
              about_me: { type: "STRING" },
              experience_level: { type: "STRING" },
              skills: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["user_name", "job_type", "about_me", "experience_level", "skills"]
          }
        }
      };

      const apiRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
      if (!apiRes.ok) throw new Error(`Gemini API Error: ${apiRes.statusText}`);
      const data = await apiRes.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("Invalid response structure from Gemini API");
      
      const parsed = JSON.parse(textResponse);
      
      setProfileData(prev => ({
        ...prev,
        user_name: parsed.user_name || prev.user_name,
        job_type: parsed.job_type || prev.job_type,
        skills: parsed.skills || prev.skills,
        experience_level: parsed.experience_level || prev.experience_level,
        about_me: parsed.about_me || prev.about_me,
      }));
      
      setCvLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      changeStep(5);
    } catch (err) {
      console.error(err);
      Sentry.captureException(err);
      setCvLoading(false);
      Alert.alert('AI Generation Failed', err.message);
      changeStep(4.5);
    }
  };

  const saveProfileAndLaunch = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    isNavigating.current = true;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('seeker_profiles').upsert({ 
          id: session.user.id, 
          user_name: profileData.user_name,
          user_role: profileData.job_type,
          about_me: profileData.about_me,
          skills: profileData.skills,
          experience_level: profileData.experience_level
        });
        // Identify user and track onboarding completion
        posthog.identify(session.user.id, {
          $set: { user_type: 'seeker', experience_level: profileData.experience_level },
          $set_once: { onboarding_completed_date: new Date().toISOString() },
        });
      }
    } catch (e) {
      console.warn("Could not save to supabase:", e);
    }

    posthog.capture('onboarding_completed', {
      skills_count: profileData.skills.length,
      experience_level: profileData.experience_level,
      has_cv: Boolean(profileData.cv_url),
    });

    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { 
        userType: 'seeker', 
        userName: profileData.user_name,
        userRole: profileData.job_type,
        aboutMe: profileData.about_me,
        skills: profileData.skills
      } }],
    });
  };

  // ==========================================
  // Render Steps
  // ==========================================

  // Step 1: Role Select
  const renderStep1 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[typography.display, { color: colors.text.primary }]}>You're almost{'\n'}in. </Text>
          <Animated.Text style={[styles.rocket, rocketStyle]}>🚀</Animated.Text>
        </View>
        <Text style={[typography.body, { color: colors.text.secondary, marginTop: 8 }]}>Tell us who you are so we can{'\n'}personalise your experience.</Text>
      </View>
      <StaggeredList baseDelay={100} style={styles.cards}>
        <SelectionCard
          emoji="🧑‍💻" label="Job Seeker" desc="Swipe on jobs, get matched, land interviews" colorTheme="rgba(255, 107, 44, 0.08)"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRole('seeker'); changeStep(2); }}
        />
        <SelectionCard
          emoji="🏢" label="Employer" desc="Post roles, discover talent, hire fast" colorTheme="rgba(123, 79, 233, 0.08)"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Auth', { role: 'employer' }); }}
        />
      </StaggeredList>
    </Animated.View>
  );

  // Step 2: Hype Screen
  const renderStep2 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
        <Text style={[typography.display, { color: colors.text.primary }]}>Nice! Let's get you matched with real jobs.</Text>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.iconPill, { backgroundColor: 'rgba(255,107,44,0.1)' }]}><Text>⚡</Text></View>
            <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>Instant AI Matching based on your top skills.</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.iconPill, { backgroundColor: 'rgba(255,107,44,0.1)' }]}><Text>📄</Text></View>
            <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>Zero-effort profile generation.</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.iconPill, { backgroundColor: 'rgba(255,107,44,0.1)' }]}><Text>💬</Text></View>
            <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>Direct chat with hiring managers.</Text>
          </View>
        </View>
      </View>
      <BounceButton onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); changeStep(3); }}>
        <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
          <Text style={[typography.button, { color: '#fff' }]}>Let's Go 🚀</Text>
        </LinearGradient>
      </BounceButton>
    </Animated.View>
  );

  // Step 3: Social-First Auth
  const renderStep3 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20}>
        <ScrollView ref={scrollViewRef3} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[typography.hero, { color: colors.text.primary, textAlign: 'center', marginBottom: 20 }]}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </Text>
        
        {/* Google Primary */}
        <BounceButton onPress={handleGoogleSignIn} disabled={googleLoading}>
          <View style={[styles.socialBtn, { backgroundColor: '#fff', borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1.5 }, shadows.sm]}>
            {googleLoading ? <ActivityIndicator color="#000" /> : (
              <>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#1A1A1A' }}>G</Text>
                <Text style={[typography.button, { color: '#1A1A1A' }]}>
                  {isLogin ? 'Log in with Google' : 'Continue with Google'}
                </Text>
              </>
            )}
          </View>
        </BounceButton>

        {/* Apple Secondary */}
        <BounceButton onPress={() => Alert.alert('Coming Soon', 'Apple Sign In in development')} disabled={appleLoading}>
          <View style={[styles.socialBtn, { backgroundColor: '#000' }]}>
            <Ionicons name="logo-apple" size={20} color="#fff" />
            <Text style={[typography.button, { color: '#fff' }]}>Continue with Apple</Text>
          </View>
        </BounceButton>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email Secondary */}
        {showEmailForm ? (
          <Animated.View entering={FadeIn} style={{ gap: 12 }}>
            <TextInput 
              style={styles.input} 
              placeholder="Email" 
              value={email} 
              onChangeText={setEmail} 
              autoCapitalize="none" 
              keyboardType="email-address" 
              onFocus={() => setTimeout(() => scrollViewRef3.current?.scrollToEnd({ animated: true }), 100)}
            />
            <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingHorizontal: 0 }]}>
              <TextInput 
                style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 }} 
                placeholder="Password" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry={!showPassword} 
                onFocus={() => setTimeout(() => scrollViewRef3.current?.scrollToEnd({ animated: true }), 100)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <Feather name={showPassword ? "eye" : "eye-off"} size={20} color={colors.text.hint} />
              </TouchableOpacity>
            </View>
            <BounceButton onPress={handleEmailAuth} disabled={authLoading}>
              <View style={[styles.socialBtn, { backgroundColor: colors.bg.secondary }]}>
                {authLoading ? <ActivityIndicator color={colors.text.primary} /> : <Text style={[typography.button, { color: colors.text.primary }]}>{isLogin ? 'Log In' : 'Sign Up'}</Text>}
              </View>
            </BounceButton>
          </Animated.View>
        ) : (
          <TouchableOpacity onPress={() => {
            setShowEmailForm(true);
            setTimeout(() => scrollViewRef3.current?.scrollToEnd({ animated: true }), 100);
          }} style={{ paddingVertical: 10 }}>
            <Text style={[typography.label, { color: colors.text.hint, textAlign: 'center' }]}>Prefer email and password?</Text>
          </TouchableOpacity>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // Step 4: CV Branch
  const renderStep4 = () => {
    if (cvLoading) {
      return (
        <Animated.View entering={FadeIn} style={[styles.stepContainer, { justifyContent: 'center', alignItems: 'center', gap: 20 }]}>
          <ActivityIndicator size="large" color={colors.brand.orange} />
          <Text style={[typography.title, { color: colors.text.primary }]}>Gemini AI is parsing your CV...</Text>
          <Text style={[typography.label, { color: colors.text.secondary, textAlign: 'center' }]}>Extracting your top skills, experience,{'\n'}and ideal target roles.</Text>
        </Animated.View>
      );
    }
    return (
      <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
          <Text style={[typography.display, { color: colors.text.primary }]}>Do you have a CV ready?</Text>
          <Text style={[typography.body, { color: colors.text.secondary }]}>Upload it to let our AI build your profile instantly. Otherwise, we can guide you through it.</Text>
          
          <StaggeredList baseDelay={100} style={{ gap: 16 }}>
            <SelectionCard emoji="📄" label="Yes, upload CV" desc="PDF or Word. Auto-extracts profile." colorTheme="rgba(255, 107, 44, 0.08)" onPress={handleFileUpload} />
            <SelectionCard emoji="✏️" label="No, build it now" desc="Quick guided wizard." colorTheme="rgba(123, 79, 233, 0.08)" onPress={() => changeStep(4.1)} />
          </StaggeredList>
        </View>
      </Animated.View>
    );
  };

  // Step 4.1: Basic Identity
  const renderStep4_1 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20 }} showsVerticalScrollIndicator={false}>
          <Text style={[typography.display, { color: colors.text.primary }]}>Let's start with the basics.</Text>
          <Text style={[typography.body, { color: colors.text.secondary }]}>Takes 2 minutes, promise.</Text>
          
          <AnimatedInput label="Full Name" placeholder="e.g. Alex Smith" value={profileData.user_name} onChangeText={(text) => setProfileData(prev => ({...prev, user_name: text}))} />
          <AnimatedInput label="Phone Number" placeholder="e.g. +1 555 123 4567" value={profileData.phone} onChangeText={(text) => setProfileData(prev => ({...prev, phone: text}))} keyboardType="phone-pad" />
          <AnimatedInput label="Email" placeholder="e.g. alex@example.com" value={profileData.email} onChangeText={(text) => setProfileData(prev => ({...prev, email: text}))} keyboardType="email-address" autoCapitalize="none" />
          <AnimatedInput label="Location" placeholder="e.g. San Francisco, CA" value={profileData.location} onChangeText={(text) => setProfileData(prev => ({...prev, location: text}))} />
          
          <BounceButton onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); changeStep(4.2); }}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>Continue</Text>
            </LinearGradient>
          </BounceButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // Step 4.2: Career Snapshot
  const renderStep4_2 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20 }} showsVerticalScrollIndicator={false}>
          <Text style={[typography.display, { color: colors.text.primary }]}>What are you aiming for?</Text>
          
          <AnimatedInput label="Target Role" placeholder="e.g. Software Engineer" value={profileData.job_type} onChangeText={(text) => setProfileData(prev => ({...prev, job_type: text}))} />
          <AnimatedInput label="Industry" placeholder="e.g. Tech, Finance" value={profileData.industry} onChangeText={(text) => setProfileData(prev => ({...prev, industry: text}))} />
          
          <Text style={[typography.label, { color: colors.text.secondary }]}>Experience Level</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['Entry (0-2)', 'Mid (3-6)', 'Senior (7+)'].map(level => (
              <BounceButton key={level} onPress={() => setProfileData(prev => ({...prev, experience_level: level}))} style={{ flex: 1 }}>
                <View style={[styles.skillChip, { backgroundColor: profileData.experience_level === level ? colors.brand.orange : colors.bg.secondary, borderRadius: radii.full, alignItems: 'center' }]}>
                  <Text style={[typography.label, { color: profileData.experience_level === level ? '#fff' : colors.text.primary }]}>{level}</Text>
                </View>
              </BounceButton>
            ))}
          </View>
          
          <BounceButton onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); changeStep(4.3); }}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>Continue</Text>
            </LinearGradient>
          </BounceButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // Step 4.3: Work History
  const renderStep4_3 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20 }} showsVerticalScrollIndicator={false}>
          <Text style={[typography.display, { color: colors.text.primary }]}>Tell us about your latest role.</Text>
          
          <AnimatedInput label="Company Name" placeholder="e.g. Acme Corp" value={profileData.company} onChangeText={(text) => setProfileData(prev => ({...prev, company: text}))} />
          <AnimatedInput label="Role Title" placeholder="e.g. Product Manager" value={profileData.role_title} onChangeText={(text) => setProfileData(prev => ({...prev, role_title: text}))} />
          
          <Text style={[typography.label, { color: colors.text.secondary }]}>Your biggest wins</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="I built [X] which resulted in [Y]..."
            value={profileData.work_wins}
            onChangeText={(text) => setProfileData(prev => ({...prev, work_wins: text}))}
            multiline
          />
          
          <BounceButton onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); changeStep(4.4); }}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>Continue</Text>
            </LinearGradient>
          </BounceButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // Step 4.4: Skills
  const renderStep4_4 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20 }} showsVerticalScrollIndicator={false}>
          <Text style={[typography.display, { color: colors.text.primary }]}>What are your superpowers?</Text>
          <Text style={[typography.body, { color: colors.text.secondary }]}>Enter your top skills (comma separated).</Text>
          
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="e.g. React Native, UI/UX Design, Agile"
            value={profileData.skills.join(', ')}
            onChangeText={(text) => setProfileData(prev => ({...prev, skills: text.split(',').map(s => s.trim()).filter(Boolean)}))}
            multiline
          />
          
          <BounceButton onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); changeStep(4.5); }}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>Continue</Text>
            </LinearGradient>
          </BounceButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // Step 4.5: Tone & Finalize
  const renderStep4_5 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 20}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 20 }} showsVerticalScrollIndicator={false}>
          <Text style={[typography.display, { color: colors.text.primary }]}>How should we sound?</Text>
          
          <View style={{ gap: 12 }}>
            {['Professional & Direct', 'Creative & Bold', 'Friendly & Approachable'].map(tone => (
              <BounceButton key={tone} onPress={() => setProfileData(prev => ({...prev, tone_format: tone}))}>
                <View style={[styles.card, { borderRadius: radii.xl, backgroundColor: profileData.tone_format === tone ? 'rgba(255, 107, 44, 0.1)' : colors.bg.card, borderColor: profileData.tone_format === tone ? colors.brand.orange : colors.border.light }]}>
                  <Text style={[typography.title, { color: profileData.tone_format === tone ? colors.brand.orange : colors.text.primary }]}>{tone}</Text>
                </View>
              </BounceButton>
            ))}
          </View>
          
          <AnimatedInput label="Any Career Gaps? (Optional)" placeholder="e.g. Took a year off to travel" value={profileData.gaps} onChangeText={(text) => setProfileData(prev => ({...prev, gaps: text}))} />
          
          <BounceButton onPress={generateProfileWithAI}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>Generate Profile ✨</Text>
            </LinearGradient>
          </BounceButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // Step 4.6: Loading AI
  const renderStep4_6 = () => (
    <Animated.View entering={FadeIn} style={[styles.stepContainer, { justifyContent: 'center', alignItems: 'center', gap: 20 }]}>
      <ActivityIndicator size="large" color={colors.brand.orange} />
      <Text style={[typography.title, { color: colors.text.primary }]}>Gemini AI is crafting your CV...</Text>
      <Text style={[typography.label, { color: colors.text.secondary, textAlign: 'center' }]}>Synthesizing your experience into a{'\n'}professional profile.</Text>
    </Animated.View>
  );

  // Step 5: Profile Validation
  const renderStep6 = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={styles.stepContainer}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingVertical: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={[typography.display, { color: colors.text.primary }]}>Here's what we got.</Text>
        <Text style={[typography.body, { color: colors.text.secondary }]}>Review your profile before launching.</Text>
        
        <View style={[styles.profileCard, shadows.sm, { backgroundColor: colors.bg.card, borderRadius: radii['2xl'], borderColor: colors.border.light }]}>
          <TextInput style={[typography.title, { color: colors.text.primary, marginBottom: 8 }]} value={profileData.user_name} onChangeText={(text) => setProfileData(prev => ({...prev, user_name: text}))} placeholder="Your Name" />
          <TextInput style={[typography.body, { color: colors.brand.orange, fontWeight: '600', marginBottom: 16 }]} value={profileData.job_type} onChangeText={(text) => setProfileData(prev => ({...prev, job_type: text}))} placeholder="Target Role" />
          
          <Text style={[typography.label, { color: colors.text.secondary, marginBottom: 8 }]}>EXPERIENCE</Text>
          <TextInput style={[typography.body, { color: colors.text.primary, marginBottom: 16 }]} value={profileData.experience_level} onChangeText={(text) => setProfileData(prev => ({...prev, experience_level: text}))} placeholder="Experience Level" />
          
          <Text style={[typography.label, { color: colors.text.secondary, marginBottom: 8 }]}>BIO</Text>
          <TextInput style={[typography.body, { color: colors.text.primary, marginBottom: 16, minHeight: 60 }]} value={profileData.about_me} onChangeText={(text) => setProfileData(prev => ({...prev, about_me: text}))} placeholder="Short bio about yourself..." multiline />
          
          <Text style={[typography.label, { color: colors.text.secondary, marginBottom: 8 }]}>TOP SKILLS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {profileData.skills.length > 0 ? profileData.skills.map((skill, idx) => (
              <View key={idx} style={[styles.skillChip, { backgroundColor: colors.bg.secondary, borderRadius: radii.full }]}>
                <Text style={[typography.label, { color: colors.text.primary }]}>{skill}</Text>
              </View>
            )) : <Text style={[typography.label, { color: colors.text.hint }]}>Add skills above</Text>}
          </View>
        </View>

        <BounceButton onPress={saveProfileAndLaunch}>
          <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={[styles.primaryBtn, shadows.md]} start={{x:0, y:0}} end={{x:1, y:1}}>
            <Text style={[typography.button, { color: '#fff' }]}>Confirm & Launch Profile 🚀</Text>
          </LinearGradient>
        </BounceButton>
      </ScrollView>
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header & Progress Indicator */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          {step > 1 ? (
            <TouchableOpacity onPress={handleBack} style={{ padding: 8, marginLeft: -8 }}>
              <Feather name="arrow-left" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ height: 40 }} />
          )}
        </View>
        <View style={{ height: 4, backgroundColor: colors.border.light, borderRadius: radii.full, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: colors.brand.orange, borderRadius: radii.full }, progressStyle]} />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 4.1 && renderStep4_1()}
        {step === 4.2 && renderStep4_2()}
        {step === 4.3 && renderStep4_3()}
        {step === 4.4 && renderStep4_4()}
        {step === 4.5 && renderStep4_5()}
        {step === 4.6 && renderStep4_6()}
        {step === 5 && renderStep6()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: { flex: 1, paddingHorizontal: 20 },
  header: { gap: 10, marginTop: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  rocket: { fontSize: 34, lineHeight: 42, marginLeft: 4 },
  cards: { marginTop: 32 },
  card: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  emojiBox: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  cardEmoji: { fontSize: 30 },
  cardTextContainer: { flex: 1, gap: 2 },
  arrowContainer: { paddingLeft: 8 },
  arrowGradient: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  cardArrow: { fontSize: 16, color: '#fff', fontWeight: '800' },
  iconPill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  socialBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.06)' },
  dividerText: { fontSize: 12, color: 'gray', fontWeight: '600' },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  profileCard: { padding: 24, borderWidth: 1 },
  skillChip: { paddingHorizontal: 12, paddingVertical: 6 },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming, 
  withDelay,
  Easing,
  runOnJS
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sentry from '@sentry/react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeProvider';
import { springs, timings } from '../lib/animations';
import BounceButton from '../components/BounceButton';

const { width, height } = Dimensions.get('window');

const PHRASES = [
  "Your new way to find jobs",
  "Your new career copilot",
  "Your new AI recruiter",
  "Your new path to success"
];

const TextCycler = () => {
  const { colors, typography } = useTheme();
  const [index, setIndex] = useState(0);
  
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useEffect(() => {
    let mounted = true;
    
    // Wait until gateway slide is done before initial fade in (Delay by 2200ms)
    opacity.value = withDelay(2200, withTiming(1, { duration: 1000 }));
    translateY.value = withDelay(2200, withTiming(0, { duration: 1000, easing: Easing.out(Easing.quad) }));

    const interval = setInterval(() => {
      if (!mounted) return;
      // Fade out
      opacity.value = withTiming(0, { duration: 400 });
      
      // Delay state update slightly so fade out completes
      setTimeout(() => {
        if (!mounted) return;
        setIndex((prev) => (prev + 1) % PHRASES.length);
        translateY.value = 10;
        opacity.value = withTiming(1, { duration: 600 });
        translateY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) });
      }, 500);

    }, 3500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', top: '55%', width: '100%', alignItems: 'center', justifyContent: 'center', height: 40 }, style]}>
      <Text style={[typography.h3, { color: colors.text.secondary, textAlign: 'center', fontSize: 18, fontWeight: '600', letterSpacing: 0.2 }]}>
        {PHRASES[index]}
      </Text>
    </Animated.View>
  );
};

export default function SplashScreen({ navigation }) {
  const { colors, typography, radii } = useTheme();
  
  const [showGateway, setShowGateway] = useState(false);

  // Icon animation
  const iconScale = useSharedValue(0);
  const iconOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(0);
  
  // Welcome Text animation
  const welcomeOpacity = useSharedValue(0);

  // Tagline and footer animation
  const fadeUpTranslate = useSharedValue(15);
  const fadeUpOpacity = useSharedValue(0);
  const textContainerOpacity = useSharedValue(1);

  // Gateway buttons animation
  const gatewayOpacity = useSharedValue(0);
  const gatewayTranslateY = useSharedValue(20);

  // Progress bar animation
  const progressWidth = useSharedValue(0);

  const triggerGateway = () => {
    setShowGateway(true);
    // 1. Fade out tagline and loader FIRST
    textContainerOpacity.value = withTiming(0, { duration: 400 });
    
    // 2. Wait 400ms, then slide logo and welcome text up smoothly
    logoTranslateY.value = withDelay(800, withTiming(-(height / 2 - 140), { duration: 1200, easing: Easing.inOut(Easing.quad) }));
    
    // 3. Fade in gateway buttons ONLY after slide finishes
    gatewayOpacity.value = withDelay(2400, withTiming(1, { duration: 1000 }));
    gatewayTranslateY.value = withDelay(2400, withTiming(0, { duration: 1000, easing: Easing.out(Easing.quad) }));
  };

  useEffect(() => {
    // Initial entrance animations
    iconScale.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) });
    iconOpacity.value = withTiming(1, { duration: 1000 });
    
    // Fade in Welcome to Jinni text after logo has completely settled
    welcomeOpacity.value = withDelay(1800, withTiming(1, { duration: 1000 }));
    
    fadeUpTranslate.value = withDelay(1800, withTiming(0, { duration: 1000, easing: Easing.out(Easing.quad) }));
    fadeUpOpacity.value = withDelay(1800, withTiming(1, { duration: 1000 }));

    progressWidth.value = withDelay(1800, withTiming(60, { duration: 2500, easing: Easing.inOut(Easing.ease) }));

    // Helper: wraps a promise with a timeout so we never hang indefinitely
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), ms)
        ),
      ]);

    // Hard failsafe: if anything takes longer than 6 seconds total, trigger gateway
    const hardTimeout = setTimeout(() => {
      Sentry.captureMessage('[Splash] Hard timeout hit — showing gateway', 'warning');
      triggerGateway();
    }, 15000);

    // Fetch data immediately alongside the animation
    const fetchSessionAndNavigate = async () => {
      try {
        const [sessionRes] = await Promise.all([
          withTimeout(supabase.auth.getSession(), 4000), 
          new Promise(r => setTimeout(r, 4800))  // Wait 4.8 seconds to allow full read
        ]);
        
        const { data: { session } } = sessionRes;

        if (session) {
          let data = null;
          let userType = 'employer';

          try {
            const empRes = await withTimeout(
              supabase.from('employer_profiles').select('*').eq('id', session.user.id).single(),
              1500
            );
            data = empRes.data;
          } catch (_) {}

          if (!data) {
            try {
              const seekerRes = await withTimeout(
                supabase.from('seeker_profiles').select('*').eq('id', session.user.id).single(),
                1500
              );
              data = seekerRes.data;
              userType = 'seeker';
            } catch (_) {}
          }

          clearTimeout(hardTimeout);
          if (data && data.user_name) {
            let lastTab = null;
            try {
              lastTab = await AsyncStorage.getItem('LAST_ACTIVE_TAB');
            } catch (e) {}

            Sentry.setUser({ id: session.user.id, email: session.user.email, role: userType });

            navigation.replace('Main', {
              screen: lastTab || 'Discover',
              params: {
                userName: data.user_name,
                userRole: data.user_role || data.job_type,
                jobType: data.job_type,
                aboutMe: data.about_me,
                searchTarget: data.search_target,
                userType: userType,
                skills: data.skills || [],
                cvUrl: data.cv_url,
                category: data.category,
              }
            });
          } else {
            triggerGateway();
          }
        } else {
          clearTimeout(hardTimeout);
          triggerGateway();
        }
      } catch (err) {
        console.warn('[Splash] Session fetch error or timeout:', err.message);
        Sentry.captureException(err);
        clearTimeout(hardTimeout);
        triggerGateway();
      }
    };

    fetchSessionAndNavigate();

    return () => {
      clearTimeout(hardTimeout);
    };
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [
      { scale: iconScale.value }
    ],
  }));

  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
  }));

  const fadeUpStyle = useAnimatedStyle(() => ({
    opacity: fadeUpOpacity.value,
    transform: [{ translateY: fadeUpTranslate.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: progressWidth.value,
  }));

  const textContainerStyle = useAnimatedStyle(() => ({
    opacity: textContainerOpacity.value,
    alignItems: 'center',
    gap: 12
  }));

  const gatewayStyle = useAnimatedStyle(() => ({
    opacity: gatewayOpacity.value,
    transform: [{ translateY: gatewayTranslateY.value }],
    position: 'absolute',
    bottom: 80,
    left: 24,
    right: 24,
    gap: 16,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: logoTranslateY.value }]
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      <Animated.View style={[styles.content, contentStyle]}>
        <Animated.View style={[styles.iconBox, iconStyle]}>
          <Image source={require('../../assets/logo.png')} style={{ width: 90, height: 90 }} resizeMode="contain" />
        </Animated.View>
        
        <Animated.Text style={[styles.welcomeText, typography.hero, { color: colors.text.primary }, welcomeStyle]}>
          Welcome to Jinni
        </Animated.Text>
        
        <Animated.View style={textContainerStyle}>
          <Animated.Text 
            style={[
              styles.tagline, 
              typography.caption, 
              { color: colors.text.hint, marginTop: 8 }, 
              fadeUpStyle
            ]}
          >
            MAKE A WISH. GET YOUR JOB.
          </Animated.Text>
        </Animated.View>
      </Animated.View>

      {/* Gateway Cycler appears underneath the logo area, positioned absolutely */}
      {showGateway && <TextCycler />}

      <Animated.View style={[styles.loaderTrack, { backgroundColor: colors.border.light, opacity: textContainerOpacity }]}>
        <Animated.View style={[styles.loaderBar, { backgroundColor: colors.brand.orange }, progressStyle]} />
      </Animated.View>

      {/* Powered by Brand Footer */}
      <Animated.View style={[styles.footer, fadeUpStyle]}>
        <Text style={[typography.micro, { color: colors.text.hint }]}>powered by</Text>
        <Text style={[typography.micro, { color: colors.brand.orange, letterSpacing: 0.5 }]}>KODx</Text>
      </Animated.View>

      {/* Gateway Buttons */}
      {showGateway && (
        <Animated.View style={gatewayStyle}>
          <BounceButton onPress={() => navigation.replace('Onboarding')}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>Sign Up</Text>
            </LinearGradient>
          </BounceButton>
          
          <BounceButton onPress={() => navigation.replace('Onboarding', { initialStep: 3, isLogin: true })}>
            <View style={[styles.secondaryBtn, { borderColor: 'rgba(0,0,0,0.1)' }]}>
              <Text style={[typography.button, { color: colors.text.primary }]}>Log In</Text>
            </View>
          </BounceButton>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    width: '100%',
    position: 'absolute',
    top: '38%',
    gap: 16,
  },
  iconBox: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tagline: {
    letterSpacing: 3,
  },
  loaderTrack: {
    position: 'absolute',
    bottom: 96,
    width: 60,
    height: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  loaderBar: {
    height: '100%',
    borderRadius: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  primaryBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
  },
});

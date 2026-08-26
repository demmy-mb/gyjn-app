import "react-native-gesture-handler";
import React, { useEffect, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer, useRoute } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Text, View, Pressable, Dimensions, Platform, ActivityIndicator, StatusBar } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing } from "react-native-reanimated";
import { BlurView } from 'expo-blur';
import * as SplashScreenModule from 'expo-splash-screen';
import Constants from 'expo-constants';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import BounceButton from './src/components/BounceButton';
import { ThemeProvider, useTheme } from './src/lib/ThemeProvider';
import { useMatches } from './src/hooks/useMatches';
import { springs, timings } from './src/lib/animations';
import { haptic } from './src/lib/haptics';
import { preloadSounds } from './src/lib/sounds';

import { PostHogProvider } from 'posthog-react-native';
import { posthog } from './src/config/posthog';

import SplashScreen    from "./src/screens/SplashScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import AuthScreen       from "./src/screens/AuthScreen";
import LoginScreen     from "./src/screens/LoginScreen";
import SwipeScreen     from "./src/screens/SwipeScreen";
import MatchesScreen   from "./src/screens/MatchesScreen";
import ProfileScreen   from "./src/screens/ProfileScreen";
import EmployerScreen  from "./src/screens/EmployerScreen";
import ChatScreen      from "./src/screens/ChatScreen";
import SettingsScreen  from "./src/screens/SettingsScreen";
import PremiumScreen   from "./src/screens/PremiumScreen";
import { GlobalNotificationHandler } from "./src/lib/usePushNotifications";

// ── React Query client ────────────────────────────────────────────────────────
// Single instance for the app lifetime. Provides caching for SwipeScreen jobs
// and MatchesScreen matches — no redundant fetches when switching tabs.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30 s — cached between tab switches
      gcTime:    5 * 60 * 1000, // 5 min — keep unused data in memory
      retry:     1,
    },
  },
});

// ── Tab Navigator ─────────────────────────────────────────────────────────────
const Tab = createBottomTabNavigator();

import { Feather } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://cc6b10eabfcdfec41610a61f98a39bf4@o4511766667722752.ingest.de.sentry.io/4511773891625040',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    }),
    Sentry.feedbackIntegration()
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Custom tab bar icon component with micro-bounce on selection
function TabIcon({ name, focused }) {
  const { colors } = useTheme();
  return <Feather name={name} size={22} color={focused ? colors.brand.orange : colors.text.hint} />;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { colors, typography, radii } = useTheme();
  
  const route = useRoute();
  const rawParams = route.params || {};
  const params = rawParams.params || rawParams;
  const isEmployer = params.userType === "employer";
  
  const { matches } = useMatches(params.name, isEmployer);
  const otherSenderType = isEmployer ? 'seeker' : 'employer';
  
  let hasUnreadMatches = false;
  for (const item of matches || []) {
    const msgs = item.messages || [];
    if (msgs.length > 0) {
      const sortedMsgs = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastMsg = sortedMsgs[sortedMsgs.length - 1];
      if (lastMsg.sender_type === otherSenderType || (otherSenderType === 'seeker' && lastMsg.sender_type === 'candidate')) {
        hasUnreadMatches = true;
        break;
      }
    }
  }
  
  const totalTabs = state.routes.length;
  const containerWidth = SCREEN_WIDTH;
  const tabWidth = containerWidth / totalTabs;

  const translateX = useSharedValue(state.index * tabWidth);

  useEffect(() => {
    // Use snappy spring instead of linear timing — feels alive
    translateX.value = withSpring(state.index * tabWidth, springs.snappy);
  }, [state.index]);

  const animatedPillStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const GlassBackground = Platform.OS === 'ios' ? BlurView : View;

  return (
    <GlassBackground 
      intensity={80} 
      tint={colors.isDark ? "dark" : "light"}
      style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        backgroundColor: Platform.OS === 'ios' ? (colors.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)') : colors.bg.card,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{
        height: 58,
        flexDirection: 'row',
        position: 'relative',
        alignItems: 'center',
      }}>
        {/* Sliding Background Pill */}
        <Animated.View style={[
          {
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 6,
            width: tabWidth - 12,
            backgroundColor: 'rgba(255, 107, 44, 0.08)',
            borderRadius: radii.lg,
          },
          animatedPillStyle
        ]} />

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              haptic.press(); // Light tap on every tab switch
              // Save last active tab
              AsyncStorage.setItem('LAST_ACTIVE_TAB', route.name).catch(() => {});
              navigation.navigate(route.name);
            }
          };

          const icon = options.tabBarIcon ? options.tabBarIcon({ focused: isFocused }) : null;

          return (
            <BounceButton
              key={route.key}
              onPress={onPress}
              activeScale={0.85}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 1,
              }}
            >
              <View>
                {icon}
                {route.name === 'Matches' && hasUnreadMatches && !isFocused && (
                  <View style={{
                    position: 'absolute',
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.status.error,
                    borderWidth: 1.5,
                    borderColor: colors.isDark ? '#000' : '#fff'
                  }} />
                )}
              </View>
              <Text style={[typography.micro, {
                fontWeight: '700',
                color: isFocused ? colors.brand.orange : colors.text.hint,
              }]}>
                {label}
              </Text>
            </BounceButton>
          );
        })}
      </View>
    </GlassBackground>
  );
}

/**
 * MainTabs replaces MainPager. It reads the user params injected by LoginScreen
 * via the parent Stack screen's params, then passes them as initialParams to each
 * tab. Screens read their own data via useQuery — params are only used for
 * immutable onboarding-time values (name, skills, cvUrl, etc.).
 */
function MainTabs() {
  const route = useRoute();
  const rawParams = route.params || {};
  const params = rawParams.params || rawParams; // Extract nested params if passed via { screen, params }
  const isEmployer = params.userType === "employer";

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Freeze off-screen tabs to preserve memory (Constraint 4)
        freezeOnBlur: true,
      }}
    >
      <Tab.Screen
        name="Discover"
        component={isEmployer ? EmployerScreen : SwipeScreen}
        initialParams={params}
        options={{
          title: isEmployer ? "Roles" : "Discover",
          tabBarIcon: ({ focused }) => <TabIcon name="compass" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        initialParams={params}
        options={{
          title: isEmployer ? "Applicants" : "Applied",
          tabBarIcon: ({ focused }) => <TabIcon name="message-circle" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        initialParams={params}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function GlobalStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />;
}

// ── Root Stack ────────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator();

// Keep splash visible while fonts load — try/catch prevents native crash
// on some Android devices where the module isn't ready at module scope
try {
  SplashScreenModule.preventAutoHideAsync();
} catch (e) {
  // Silently ignore — splash will auto-hide
}



export default Sentry.wrap(function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      // Preload sounds in the background (non-blocking)
      preloadSounds().catch(() => {});
      await SplashScreenModule.hideAsync();
    }
  }, [fontsLoaded]);



  if (!fontsLoaded) {
    return null; // Keep native splash visible
  }

  return (
    <ThemeProvider>
      <GlobalStatusBar />
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <SafeAreaProvider>
            {Constants.appOwnership !== 'expo' && <GlobalNotificationHandler />}
            <NavigationContainer>
              <PostHogProvider
                client={posthog}
                autocapture={{
                  captureScreens: true,
                  captureTouches: true,
                  propsToCapture: ['testID'],
                }}
              >
                <Stack.Navigator
                  initialRouteName="Splash"
                  screenOptions={{ headerShown: false, animation: "fade", animationDuration: 100 }}
                >
                  <Stack.Screen name="Splash"      component={SplashScreen} />
                  <Stack.Screen name="Auth"        component={AuthScreen} />
                  <Stack.Screen name="Onboarding"  component={OnboardingScreen} />
                  <Stack.Screen name="Login"       component={LoginScreen} />
                  <Stack.Screen
                    name="Main"
                    component={MainTabs}
                    options={{ animation: "fade", animationDuration: 100 }}
                  />
                  <Stack.Screen
                    name="Chat"
                    component={ChatScreen}
                    options={{ animation: "fade", animationDuration: 100 }}
                  />
                  <Stack.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ animation: "fade", animationDuration: 100 }}
                  />
                  <Stack.Screen
                    name="Premium"
                    component={PremiumScreen}
                    options={{ presentation: "modal", animationDuration: 200 }}
                  />
              </Stack.Navigator>
              </PostHogProvider>
            </NavigationContainer>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ThemeProvider>
  );
});

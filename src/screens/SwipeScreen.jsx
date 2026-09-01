import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, Pressable, Dimensions, Platform, NativeModules,
  ActivityIndicator, Alert, Image
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { getBackendUrl, getOptimizedImageUrl, getJobImageUrl } from '../lib/config';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, runOnJS, withRepeat, withSequence, interpolateColor,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';
import { usePostHog } from 'posthog-react-native';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import { useTheme } from '../lib/ThemeProvider';
import { springs, timings } from '../lib/animations';
import { haptic } from '../lib/haptics';
import { playSound } from '../lib/sounds';
import { ICON_MAP } from '../lib/icons';
import StaggeredList from '../components/StaggeredList';
import AnimatedTag from '../components/AnimatedTag';
import GlowButton from '../components/GlowButton';
import BounceButton from '../components/BounceButton';

// Tag color mapping for detail bottom sheet
const TAG_COLORS = {
  skill:    { bg: 'rgba(255, 107, 44, 0.10)', text: '#E05A00' },
  location: { bg: 'rgba(123, 79, 233, 0.10)', text: '#6B3FD4' },
  perk:     { bg: 'rgba(0, 200, 150, 0.10)',  text: '#00875A' },
  level:    { bg: 'rgba(255, 179, 0, 0.10)',   text: '#B37800' },
  default:  { bg: 'rgba(0, 0, 0, 0.05)',       text: '#555555' },
};

// Local match score calculation since we removed expensive LLM match from backend
const calculateMatchScore = (profile, job) => {
  let score = 50; // base score

  // Category match
  if (profile.category && job.category) {
    if (profile.category.toLowerCase() === job.category.toLowerCase()) {
      score += 25;
    }
  }

  // Job type match
  if (profile.jobType && job.job_type) {
    if (profile.jobType.toLowerCase() === job.job_type.toLowerCase()) {
      score += 10;
    }
  }

  // Skills match (if tags exist on job and skills on profile)
  if (profile.skills && profile.skills.length > 0 && job.tags && job.tags.length > 0) {
    const profileSkills = profile.skills.map(s => 
      (typeof s === 'string' ? s : s.label || '').toLowerCase()
    );
    let matchCount = 0;
    job.tags.forEach(t => {
      const tagLabel = (typeof t === 'string' ? t : t.label || '').toLowerCase();
      if (profileSkills.some(ps => ps.includes(tagLabel) || tagLabel.includes(ps))) {
        matchCount++;
      }
    });
    score += Math.min(15, matchCount * 3);
  }

  // Cap at 98% to leave room for "perfect" matches if we ever add them
  return Math.min(98, score);
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = SCREEN_W - 48;
const SWIPE_THRESHOLD = 120;
const RISE_DISTANCE = 24;
const CARD_HEIGHT = 420;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDisplaySalary(salary) {
  if (!salary) return 'Competitive';
  
  let result = salary.trim();
  if (!result.startsWith('₦')) {
    result = `₦${result}`;
  }
  
  const hasFrequency = result.includes('/') || 
                       result.toLowerCase().includes('contract') || 
                       result.toLowerCase().includes('mo') || 
                       result.toLowerCase().includes('wk');
  
  if (!hasFrequency) {
    result = `${result}/mo`;
  }
  
  return result;
}

const getNotifStyle = (type) => {
  switch (type) {
    case 'Interviewing':
      return {
        bg: '#FFF9E6',
        border: 'rgba(255, 179, 0, 0.4)',
        text: '#D97706',
        icon: 'target',
        label: "You've been moved to the Interviewing section!",
      };
    case 'Hired':
      return {
        bg: '#E6F9F0',
        border: 'rgba(0, 200, 150, 0.4)',
        text: '#059669',
        icon: 'award',
        label: 'Congratulations! You have been hired!',
      };
    case 'Message':
    default:
      return {
        bg: '#F3E8FF',
        border: 'rgba(123, 79, 233, 0.4)',
        text: '#7E22CE',
        icon: 'message-circle',
        label: 'New message received',
      };
  }
};

// AnimatedTag handles colors via theme directly

// ─── JobCard (pure renderer) ────────────────────────────────────────────────

function JobCard({ job, onPress, isTop }) {
  const { colors, typography, radii, shadows } = useTheme();
  const bgColors = job.colors && job.colors.length >= 2 ? job.colors : [colors.brand.orange, colors.brand.mango];
  const imageUrl = getJobImageUrl(job);
  const hasImage = Boolean(imageUrl);

  return (
    <BounceButton 
      onPress={onPress}
      activeScale={0.98}
      disabled={!isTop}
      style={[
        styles.card,
        isTop ? shadows.md : { shadowOpacity: 0, elevation: 0 }
      ]}
    >
      <View style={[
        styles.cardInner,
        { backgroundColor: colors.bg.card },
        !isTop && {
          borderWidth: 1.5,
          borderColor: colors.border.light,
        }
      ]}>
        <View style={styles.cardTopContainer}>
          {/* Base gradient background always present */}
          <LinearGradient
            colors={bgColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* High-res Image overlay when available */}
          {hasImage && (
            <>
              <Image
                source={{ uri: imageUrl }}
                style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', borderTopLeftRadius: 36, borderTopRightRadius: 36 }]}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.5)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[StyleSheet.absoluteFillObject, { borderTopLeftRadius: 36, borderTopRightRadius: 36 }]}
              />
            </>
          )}

          <View style={styles.cardTop}>
            <View style={styles.cardLogoWrap}>
              <View style={[
                styles.cardLogoBox,
                { borderRadius: radii.xl },
                hasImage && {
                  backgroundColor: 'rgba(255, 255, 255, 0.88)',
                  borderColor: 'rgba(255, 255, 255, 0.95)',
                }
              ]}>
                {job.logo_url ? (
                  <Image source={{ uri: job.logo_url }} style={{ width: 60, height: 60, borderRadius: radii.xl }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 24, fontWeight: '800', color: hasImage ? '#1A1817' : colors.text.primary }}>
                    {(job.company || 'C').substring(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
        
        <View style={[styles.cardBottom, { backgroundColor: colors.bg.card }]}>
          <Text style={[typography.caption, { color: colors.brand.orange }]}>{job.company}</Text>
          <Text style={[typography.title, { color: colors.text.primary }]}>{job.role}</Text>

          <StaggeredList animate={job.isInitialTop} baseDelay={80} style={styles.cardTagsRow} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {job.tags && job.tags.slice(0, 3).map((t, idx) => (
              <AnimatedTag 
                key={idx} 
                label={t.label} 
                colorType={t.type === 'green' ? 'green' : t.type === 'purple' ? 'purple' : 'orange'} 
              />
            ))}
          </StaggeredList>

          <View style={[styles.cardBottomFooter, { borderTopColor: colors.border.light }]}>
            <Text style={[typography.micro, { color: colors.text.hint }]}>Tap details ➔</Text>
          </View>
        </View>
      </View>
    </BounceButton>
  );
}

// ─── AnimatedCard ───────────────────────────────────────────────────────────
// Each card gets its own useAnimatedStyle hook for smooth deck animations.

function AnimatedCard({ job, isTop, stackIndex, translateX, translateY, onPress, swipedCardId, indexOffset }) {
  const animStyle = useAnimatedStyle(() => {
    // If this card just completed swiping out, hide it instantly before React removes it
    if (swipedCardId && swipedCardId.value === job.id) {
      return { opacity: 0, transform: [] };
    }

    // Determine the true visual index mapping during the hand-off frame
    const offset = indexOffset ? indexOffset.value : 0;
    const currentIndex = Math.max(0, stackIndex - offset);
    const activeIsTop = currentIndex === 0;

    if (activeIsTop) {
      return {
        opacity: 1,
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotate: `${interpolate(translateX.value, [-200, 200], [-10, 10])}deg` },
        ],
      };
    }
    // Background card rises + scales as user drags the top card
    const dist = Math.sqrt(translateX.value ** 2 + translateY.value ** 2);
    const progress = Math.min(1, dist / SWIPE_THRESHOLD);

    // Scale: 1.0 (top) down to ~0.84 (5th card)
    const baseScale = 1 - currentIndex * 0.04;
    // translateY: 0 (top) down and back to 120 (5th card)
    const baseTranslateY = currentIndex * RISE_DISTANCE;

    // Fade the back card in dynamically during the swipe gesture
    const baseOpacity = currentIndex >= 5 ? 0 : 1;
    const nextOpacity = currentIndex - 1 >= 5 ? 0 : 1;
    const currentOpacity = interpolate(progress, [0, 1], [baseOpacity, nextOpacity]);

    return {
      opacity: currentOpacity,
      transform: [
        { scale: interpolate(progress, [0, 1], [baseScale, baseScale + 0.04]) },
        { translateY: interpolate(progress, [0, 1], [baseTranslateY, baseTranslateY - RISE_DISTANCE]) },
      ],
    };
  });

  const likeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateX.value, [0, 80], [0, 1], 'clamp');
    return { opacity };
  });

  const nopeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateX.value, [-80, 0], [1, 0], 'clamp');
    return { opacity };
  });

  const saveStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [0, 80], [0, 1], 'clamp');
    return { opacity };
  });

  return (
    <Animated.View
      style={[styles.cardWrapper, animStyle, { zIndex: 100 - stackIndex }]}
      renderToHardwareTextureAndroid={true}
      shouldRasterizeIOS={true}
    >
      <JobCard job={job} onPress={isTop ? onPress : undefined} isTop={isTop} />
      {isTop && (
        <>
          <Animated.View style={[styles.stampOverlay, styles.stampLike, likeStyle]}>
            <Text style={styles.stampTextLike}>APPLY</Text>
          </Animated.View>
          <Animated.View style={[styles.stampOverlay, styles.stampNope, nopeStyle]}>
            <Text style={styles.stampTextNope}>SKIP</Text>
          </Animated.View>
          <Animated.View style={[styles.stampOverlay, styles.stampSave, saveStyle]}>
            <Text style={styles.stampTextSave}>SAVE</Text>
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

/* ─── Pulsing Loading Indicator for Job Cards ─── */
function LoadingPulse() {
  const { colors, radii, shadows } = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, timings.slow),
        withTiming(1.0, timings.slow)
      ),
      -1,
      true
    );
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[styles.pulseCircle, { borderRadius: 50, backgroundColor: colors.bg.card }, shadows.md, animatedStyle]}>
        <Feather name="search" size={24} color={colors.brand.orange} />
      </Animated.View>
      <ActivityIndicator size="small" color={colors.brand.orange} style={{ marginTop: 24 }} />
    </View>
  );
}

// ─── ExpandedDetailCard ───────────────────────────────────────────────────────

function ExpandedDetailCard({ job, isVisible, onClose, onApply }) {
  const { colors, typography, radii, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  
  const expandAnim = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (isVisible) {
      expandAnim.value = withSpring(1, { damping: 28, stiffness: 280, mass: 0.8 });
      dragY.value = 0;
    } else {
      expandAnim.value = withSpring(0, { damping: 28, stiffness: 280, mass: 0.8 });
    }
  }, [isVisible]);

  const cardTopInitial = (SCREEN_H + insets.top + 48 - CARD_HEIGHT) / 2;
  const cardLeftInitial = (SCREEN_W - CARD_W) / 2;

  const containerStyle = useAnimatedStyle(() => {
    return {
      opacity: expandAnim.value > 0.01 || isVisible ? 1 : 0,
      pointerEvents: isVisible ? 'auto' : 'none',
      transform: [{ translateY: dragY.value }],
    };
  });

  const cardStyle = useAnimatedStyle(() => {
    const width = interpolate(expandAnim.value, [0, 1], [CARD_W, SCREEN_W], 'clamp');
    const height = interpolate(expandAnim.value, [0, 1], [CARD_HEIGHT, SCREEN_H], 'clamp');
    const borderRadius = interpolate(expandAnim.value, [0, 1], [36, 40], 'clamp'); // Keep native-style modal curve
    const top = interpolate(expandAnim.value, [0, 1], [cardTopInitial, Math.max(insets.top, 24) + 16], 'clamp');
    const left = interpolate(expandAnim.value, [0, 1], [cardLeftInitial, 0], 'clamp');

    return {
      position: 'absolute',
      width,
      height,
      borderRadius,
      top,
      left,
      overflow: 'hidden',
      backgroundColor: colors.bg.card,
    };
  });

  const bgColors = job?.colors && job.colors.length >= 2 ? job.colors : [colors.brand.orange, colors.brand.mango];

  // Calculate mathematically exact background height based on flex wrapping of JobCard
  const roleLines = job?.role?.length > 22 ? 2 : 1;
  const calculatedBottomHeight = 142 + (roleLines * 26);
  const calculatedGradientHeight = CARD_HEIGHT - calculatedBottomHeight;
  const translateDistance = (calculatedGradientHeight + 24) - 88;

  const closedBackgroundStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: CARD_HEIGHT,
      opacity: interpolate(expandAnim.value, [0, 1], [1, 0], 'clamp'),
      overflow: 'hidden',
    };
  });

  const headerUIOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(expandAnim.value, [0.5, 1], [0, 1], 'clamp'),
    };
  });

  const iconScrollStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      left: 24,
      top: 24,
      width: interpolate(expandAnim.value, [0, 1], [64, 48], 'clamp'),
      height: interpolate(expandAnim.value, [0, 1], [64, 48], 'clamp'),
      borderRadius: interpolate(expandAnim.value, [0, 1], [radii.xl || 32, radii.md || 16], 'clamp'),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: interpolateColor(expandAnim.value, [0, 1], ['rgba(255, 255, 255, 0.35)', 'transparent']),
      backgroundColor: interpolateColor(expandAnim.value, [0, 1], ['rgba(255, 255, 255, 0.25)', bgColors[1] || colors.brand.orange]),
    };
  });

  const textTranslateStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: interpolate(expandAnim.value, [0, 1], [translateDistance, 0], 'clamp') }],
    };
  });

  const extraContentStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(expandAnim.value, [0.5, 1], [0, 1], 'clamp'),
    };
  });

  const footerOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(expandAnim.value, [0, 0.5], [1, 0], 'clamp'),
    };
  });

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        // As they pull down, interactively reverse the expansion animation!
        // The top of the card will perfectly follow their finger.
        const progress = Math.max(0, 1 - (e.translationY / cardTopInitial));
        expandAnim.value = progress;
        dragY.value = 0; // We don't need additional translation since expandAnim handles it
      } else {
        // Slight rubber-band if they pull up
        dragY.value = e.translationY * 0.1;
      }
    })
    .onEnd((e) => {
      dragY.value = withSpring(0, { damping: 25, stiffness: 250 });
      if (e.translationY > 100 || e.velocityY > 500) {
        // Close it - the useEffect will fluidly continue the spring down to 0 from its current progress!
        runOnJS(onClose)();
      } else {
        // Snap back to fully expanded
        expandAnim.value = withSpring(1, { damping: 28, stiffness: 280, mass: 0.8 });
      }
    });

  if (!job) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }, containerStyle]}>
      <Animated.View style={cardStyle}>
        
        <Animated.View style={closedBackgroundStyle}>
          <View style={{ flex: 1, borderTopLeftRadius: 36, borderTopRightRadius: 36, overflow: 'hidden', position: 'relative' }}>
            <LinearGradient colors={bgColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            {getJobImageUrl(job) ? (
              <>
                <Image
                  source={{ uri: getJobImageUrl(job) }}
                  style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', borderTopLeftRadius: 36, borderTopRightRadius: 36 }]}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={[StyleSheet.absoluteFillObject, { borderTopLeftRadius: 36, borderTopRightRadius: 36 }]}
                />
              </>
            ) : null}
          </View>
          
          {/* Invisible sizing block perfectly matching JobCard's cardBottom layout to force exact same gradient height */}
          <View style={[styles.cardBottom, { opacity: 0 }]} pointerEvents="none">
            <Text style={[typography.caption, { color: colors.brand.orange }]}>{job.company}</Text>
            <Text style={[typography.title, { color: colors.text.primary }]}>{job.role}</Text>
            <View style={[styles.cardTagsRow, { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
              {job.tags && job.tags.slice(0, 3).map((t, idx) => (
                <View key={idx} style={[styles.cardTag, { paddingHorizontal: 8, paddingVertical: 4 }]}>
                  <Text style={[styles.cardTagText, { fontSize: 10 }]}>{t.label}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.cardBottomFooter, { borderTopColor: colors.border.light }]}>
              <Text style={[typography.micro, { color: colors.text.hint }]}>Tap details ➔</Text>
            </View>
          </View>
        </Animated.View>

        <ScrollView 
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ padding: 24, paddingTop: 88, paddingBottom: Math.max(insets.bottom, 24) + 100 + Math.max(insets.top, 16) }}
          showsVerticalScrollIndicator={false}
        >
             <Animated.View style={[iconScrollStyle, { overflow: 'hidden' }]}>
               {job.logo_url ? (
                 <Image source={{ uri: job.logo_url }} style={{ width: 44, height: 44, borderRadius: 22 }} resizeMode="cover" />
               ) : (
                 <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary }}>
                   {(job.company || 'C').substring(0, 1).toUpperCase()}
                 </Text>
               )}
             </Animated.View>

             <Animated.View style={[textTranslateStyle]}>
               <View style={{ gap: 8 }}>
                 <Text style={[typography.caption, { color: colors.brand.orange }]}>{job.company}</Text>
                 <Text style={[typography.title, { color: colors.text.primary }]}>{job.role}</Text>
                 <View style={[styles.cardTagsRow, { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }]}>
                   {job.tags && job.tags.slice(0, 3).map((t, idx) => (
                     <AnimatedTag key={idx} label={t.label} colorType={t.type === 'green' ? 'green' : t.type === 'purple' ? 'purple' : 'orange'} animate={false} />
                   ))}
                 </View>
               </View>

               {/* Tap for details footer (fades out when expanding) */}
               <Animated.View style={[styles.cardBottomFooter, { borderTopColor: colors.border.light }, footerOpacityStyle]}>
                 <Text style={[typography.micro, { color: colors.text.hint }]}>Tap details ➔</Text>
               </Animated.View>

               {/* FADING IN EXTRA CONTENT */}
               <Animated.View style={[extraContentStyle, { marginTop: 12 }]}>
                 {job.category && (
                   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                     <View style={[styles.detailPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}>
                       <Text style={[styles.detailPillText, { color: colors.text.primary }]}>{job.category}</Text>
                     </View>
                   </View>
                 )}

                 {job.description && (
                   <View style={{ gap: 8, marginBottom: 24 }}>
                     <Text style={[styles.sheetSectionLabel, { color: colors.text.hint }]}>ABOUT THE ROLE</Text>
                     <Text style={[styles.sheetDesc, { color: colors.text.secondary }]}>{job.description}</Text>
                   </View>
                 )}

                 {job.reqs && job.reqs.length > 0 && (
                   <View style={{ gap: 8 }}>
                     <Text style={[styles.sheetSectionLabel, { color: colors.text.hint }]}>REQUIREMENTS</Text>
                     {job.reqs.map((r, i) => (
                       <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                         <Text style={{ color: colors.brand.orange }}>•</Text>
                         <Text style={{ fontSize: 15, color: colors.text.primary, lineHeight: 22, flex: 1 }}>{r}</Text>
                       </View>
                     ))}
                   </View>
                 )}
                 
                 <GlowButton
                   title="Apply via Jinni →"
                   onPress={onApply}
                   style={{ marginTop: 24 }}
                 />
               </Animated.View>
             </Animated.View>
          </ScrollView>
          
          {/* Drag Handle at top */}
          <Animated.View style={[headerUIOpacityStyle, { position: 'absolute', top: 0, left: 0, right: 0 }]}>
            <GestureDetector gesture={gesture}>
              <View style={{ height: 56, alignItems: 'center', paddingTop: 16, zIndex: 999, backgroundColor: 'transparent' }}>
                <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border.medium }} />
              </View>
            </GestureDetector>
          </Animated.View>

          <Animated.View style={[headerUIOpacityStyle, { position: 'absolute', top: 16, right: 24, zIndex: 1000 }]}>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
              onPress={onClose}
            >
              <Feather name="chevron-down" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── SwipeScreen ────────────────────────────────────────────────────────────

export default function SwipeScreen({ route, navigation, onMatchLand }) {
  const posthog = usePostHog();
  const { colors, typography, radii, shadows } = useTheme();
  const userType = route.params?.userType || 'seeker';
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [detailJob, setDetailJob] = useState(null);
  const queueInitialized = useRef(false);

  const [activeNotification, setActiveNotification] = useState(null);
  const [cachedNotification, setCachedNotification] = useState(null);

  const progress = useSharedValue(0);

  // ── Initial job fetch (cached by React Query) ──────────────────────────────
  // key changes when profile details (like category or skills) are updated, triggering re-fetch.
  const queryKey = [
    'jobs',
    route.params?.userName,
    route.params?.userRole,
    route.params?.category
  ];

  const { data: serverJobs = [], refetch, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn:  async () => {
      // Fetch live profile to override route.params if they are empty
      let activeProfile = {};
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const tableName = userType === 'employer' ? 'employer_profiles' : 'seeker_profiles';
          const { data } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', user.id)
            .single();
          if (data) activeProfile = data;
        }
      } catch (err) {
        console.warn('Failed to load profile for queryFn:', err);
        Sentry.captureException(err);
      }

      try {
        const response = await fetch(`${getBackendUrl()}/api/match-jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: activeProfile.category || route.params?.category,
          }),
        });
        if (!response.ok) throw new Error('API failed');
        const data = await response.json();
        
        // Calculate scores locally since backend no longer sends match %
        const localScoredJobs = (data.jobs || []).map((job, idx) => ({
          ...job,
          isInitialTop: idx === 0,
          match: calculateMatchScore({
            category: activeProfile.category || route.params?.category,
            skills: activeProfile.skills || route.params?.skills || [],
            jobType: activeProfile.job_type || route.params?.jobType
          }, job)
        }));
        
        return localScoredJobs;
      } catch (err) {
        console.warn('API fetch failed, falling back to direct Supabase query:', err.message);
        Sentry.captureException(err);
        
        let query = supabase
          .from('jobs')
          .select('*')
          .eq('status', 'Open');
          
        const targetCategory = activeProfile.category || route.params?.category;
        if (targetCategory) {
          query = query.eq('category', targetCategory);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        
        // Calculate scores locally
        const localScoredJobs = (data ?? []).map((job, idx) => ({
          ...job,
          isInitialTop: idx === 0,
          match: calculateMatchScore({
            category: activeProfile.category || route.params?.category,
            skills: activeProfile.skills || route.params?.skills || [],
            jobType: activeProfile.job_type || route.params?.jobType
          }, job)
        })).sort((a, b) => b.match - a.match);

        // After sorting, re-assign isInitialTop based on final order
        localScoredJobs.forEach((job, idx) => {
          job.isInitialTop = idx === 0;
        });

        return localScoredJobs;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Seed the swipe queue from query cache exactly once on first load
  useEffect(() => {
    if (serverJobs.length > 0 && !queueInitialized.current) {
      queueInitialized.current = true;
      setJobs(serverJobs);
    }
  }, [serverJobs]);

  // Realtime notification listener
  useEffect(() => {
    const userDisplayName = route.params?.userName || 'Professional';
    
    const channel = supabase
      .channel('candidate-notifications')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        async (payload) => {
          if (payload.new.candidate_name === userDisplayName) {
            const oldStatus = payload.old?.status;
            const newStatus = payload.new?.status;
            if (newStatus !== oldStatus && (newStatus === 'Interviewing' || newStatus === 'Hired')) {
              const { data: matchData, error } = await supabase
                .from('matches')
                .select('*, jobs(*), messages(*)')
                .eq('match_id', payload.new.match_id)
                .single();
              
              if (!error && matchData) {
                // Check if there is a recent message from the employer (within 8 seconds)
                const msgs = matchData.messages || [];
                const employerMsgs = msgs.filter(m => m.sender_type === 'employer');
                const lastMsg = employerMsgs[employerMsgs.length - 1];
                const isRecentMessage = lastMsg && 
                  (Date.now() - new Date(lastMsg.created_at).getTime() < 8000);

                if (isRecentMessage) {
                  setActiveNotification({
                    type: 'Message',
                    company: matchData.jobs?.company || 'Company',
                    role: matchData.jobs?.role || 'Role',
                    icon: 'message-circle',
                    text: lastMsg.text,
                    match: matchData,
                  });
                } else {
                  setActiveNotification({
                    type: newStatus,
                    company: matchData.jobs?.company || 'Company',
                    role: matchData.jobs?.role || 'Role',
                    icon: 'briefcase',
                    match: matchData,
                  });
                }
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          if (payload.new.sender_type === 'employer') {
            const { data: matchData, error } = await supabase
              .from('matches')
              .select('*, jobs(*)')
              .eq('match_id', payload.new.match_id)
              .single();
            
            if (!error && matchData && matchData.candidate_name === userDisplayName) {
              setActiveNotification({
                type: 'Message',
                company: matchData.jobs?.company || 'Company',
                role: matchData.jobs?.role || 'Role',
                icon: 'message-circle',
                text: payload.new.text,
                match: matchData,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [route.params?.userName]);

  // Manage thought bubble animation transitions and auto-dismiss timer
  useEffect(() => {
    if (activeNotification) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCachedNotification(activeNotification);
      progress.value = withSpring(1, { damping: 26, stiffness: 240, mass: 0.4 });
      
      const timer = setTimeout(() => {
        setActiveNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      progress.value = withSpring(0, { damping: 30, stiffness: 280, mass: 0.4 });
    }
  }, [activeNotification]);

  const handleNotifPress = () => {
    if (activeNotification?.match) {
      const matchData = activeNotification.match;
      setActiveNotification(null);
      navigation.navigate('Chat', { 
        match: matchData, 
        userName: route.params?.userName, 
        userType: 'seeker' 
      });
    }
  };

  const handleReload = async () => {
    const { data } = await refetch();
    if (data) {
      setJobs(data);
    }
  };

  const showLoadingSpinner = isLoading || (isFetching && jobs.length === 0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const contextX = useSharedValue(0);
  const contextY = useSharedValue(0);
  const swipedCardId = useSharedValue(null);
  const indexOffset = useSharedValue(0);

  const closeDetail = useCallback(() => {
    setShowDetail(false);
  }, []);

  const morphingContainerStyle = useAnimatedStyle(() => {
    const currentWidth = interpolate(progress.value, [0, 1], [40, SCREEN_W - 48]);
    const currentHeight = interpolate(progress.value, [0, 1], [40, 86]);
    const currentRadius = interpolate(progress.value, [0, 1], [20, 22]);

    let targetBg = '#ffffff';
    let targetBorder = '#F2EDE8';
    
    if (cachedNotification) {
      if (cachedNotification.type === 'Interviewing') {
        targetBg = '#FFF9E6';
        targetBorder = '#FFB300';
      } else if (cachedNotification.type === 'Hired') {
        targetBg = '#E6F9F0';
        targetBorder = '#00C896';
      } else {
        targetBg = '#F3E8FF';
        targetBorder = '#7B4FE9';
      }
    }

    const currentBg = interpolateColor(
      progress.value,
      [0, 1],
      ['#ffffff', targetBg]
    );

    const currentBorderColor = interpolateColor(
      progress.value,
      [0, 1],
      ['#F2EDE8', targetBorder]
    );

    let targetShadowColor = C.night;
    let targetShadowOpacity = 0.08;
    let targetShadowRadius = 6;
    let targetElevation = 3;

    if (cachedNotification) {
      if (cachedNotification.type === 'Interviewing') {
        targetShadowColor = C.gold;
      } else if (cachedNotification.type === 'Hired') {
        targetShadowColor = C.green;
      } else {
        targetShadowColor = C.purple;
      }
      targetShadowOpacity = 0.16;
      targetShadowRadius = 14;
      targetElevation = 8;
    }

    const currentShadowOpacity = interpolate(progress.value, [0, 1], [0.08, targetShadowOpacity]);
    const currentShadowRadius = interpolate(progress.value, [0, 1], [6, targetShadowRadius]);
    const currentElevation = interpolate(progress.value, [0, 1], [3, targetElevation]);

    return {
      width: currentWidth,
      height: currentHeight,
      borderRadius: currentRadius,
      backgroundColor: currentBg,
      borderColor: currentBorderColor,
      shadowColor: targetShadowColor,
      shadowOpacity: currentShadowOpacity,
      shadowRadius: currentShadowRadius,
      elevation: currentElevation,
      position: 'absolute',
      right: 24,
      top: Math.max(insets.top, 24) + 12,
      zIndex: 999,
      overflow: 'hidden',
      borderWidth: 1.5,
      justifyContent: 'center',
    };
  });

  const collapsedLayerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.25], [1, 0], 'clamp'),
      transform: [{ scale: interpolate(progress.value, [0, 0.25], [1, 0.5], 'clamp') }],
    };
  });

  const expandedLayerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0.75, 1], [0, 1], 'clamp'),
      transform: [{ scale: interpolate(progress.value, [0.75, 1], [0.95, 1], 'clamp') }],
    };
  });

  const dot1Style = useAnimatedStyle(() => {
    let targetBg = 'rgba(255, 255, 255, 0.9)';
    let targetBorder = 'rgba(0,0,0,0.05)';
    if (cachedNotification) {
      if (cachedNotification.type === 'Interviewing') {
        targetBg = 'rgba(255, 249, 230, 0.9)';
        targetBorder = 'rgba(255, 179, 0, 0.4)';
      } else if (cachedNotification.type === 'Hired') {
        targetBg = 'rgba(230, 249, 240, 0.9)';
        targetBorder = 'rgba(0, 200, 150, 0.4)';
      } else {
        targetBg = 'rgba(243, 232, 255, 0.9)';
        targetBorder = 'rgba(123, 79, 233, 0.4)';
      }
    }

    return {
      opacity: progress.value,
      transform: [
        { scale: progress.value },
        { translateY: interpolate(progress.value, [0, 1], [-20, 0]) },
        { translateX: interpolate(progress.value, [0, 1], [15, 0]) }
      ],
      backgroundColor: targetBg,
      borderColor: targetBorder,
      borderWidth: 1.5,
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: 7,
      right: 48,
      top: Math.max(insets.top, 8) + 84,
      zIndex: 998,
    };
  });

  const dot2Style = useAnimatedStyle(() => {
    let targetBg = 'rgba(255, 255, 255, 0.9)';
    let targetBorder = 'rgba(0,0,0,0.05)';
    if (cachedNotification) {
      if (cachedNotification.type === 'Interviewing') {
        targetBg = 'rgba(255, 249, 230, 0.9)';
        targetBorder = 'rgba(255, 179, 0, 0.4)';
      } else if (cachedNotification.type === 'Hired') {
        targetBg = 'rgba(230, 249, 240, 0.9)';
        targetBorder = 'rgba(0, 200, 150, 0.4)';
      } else {
        targetBg = 'rgba(243, 232, 255, 0.9)';
        targetBorder = 'rgba(123, 79, 233, 0.4)';
      }
    }

    return {
      opacity: progress.value,
      transform: [
        { scale: progress.value },
        { translateY: interpolate(progress.value, [0, 1], [-30, 0]) },
        { translateX: interpolate(progress.value, [0, 1], [25, 0]) }
      ],
      backgroundColor: targetBg,
      borderColor: targetBorder,
      borderWidth: 1.5,
      position: 'absolute',
      width: 9,
      height: 9,
      borderRadius: 4.5,
      right: 36,
      top: Math.max(insets.top, 8) + 102,
      zIndex: 997,
    };
  });

  const handleMorphingBtnPress = () => {
    if (activeNotification) {
      handleNotifPress();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate('Profile');
    }
  };

  const { userName } = route.params || { userName: 'Professional' };

  // Sync indexOffset back to 0 when React finishes updating the jobs array.
  const topJobId = jobs[0]?.id;
  useEffect(() => {
    swipedCardId.value = null;
    indexOffset.value = 0;
  }, [topJobId, swipedCardId, indexOffset]);

  // Called after a successful swipe animation completes
  const handleSwipeComplete = useCallback((direction, passedX, passedY, velocityX, velocityY) => {
    // FIX: Look up the job on the JS thread where state is always fresh
    const topJob = jobs[0]; 
    if (!topJob) return;

    // Capture current trajectory before resetting shared values
    const currentX = passedX ?? translateX.value;
    const currentY = passedY ?? translateY.value;

    // Instantly freeze the visual state on the UI thread
    // This perfectly bridges the gap before React re-renders the deck
    swipedCardId.value = topJob.id;
    indexOffset.value = 1;
    translateX.value = 0;
    translateY.value = 0;

    setJobs(prev => {
      const remaining = prev.slice(1);
      return remaining;
    });

    // Increment local swipes count
    const incrementSwipes = async () => {
      try {
        const count = await AsyncStorage.getItem('seeker_swipes_count');
        const nextCount = count ? parseInt(count) + 1 : 1;
        await AsyncStorage.setItem('seeker_swipes_count', nextCount.toString());
      } catch (err) {
        console.warn('Failed to increment local swipes count:', err);
      }
    };
    incrementSwipes();

    if (direction === 'right') {
      const saveMatch = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          let activeProfile = {};
          if (user) {
            const tableName = userType === 'employer' ? 'employer_profiles' : 'seeker_profiles';
            const { data } = await supabase
              .from(tableName)
              .select('*')
              .eq('id', user.id)
              .single();
            if (data) activeProfile = data;
          }

          const { data, error } = await supabase.from('matches').insert({
            user_id:             user?.id || null,
            job_id:              topJob.id,
            candidate_name:      activeProfile.user_name || route.params?.userName || 'Professional',
            candidate_role:      activeProfile.user_role || route.params?.userRole || '',
            category:            activeProfile.category || route.params?.category || null,
            about_me:            activeProfile.about_me || route.params?.aboutMe || null,
            job_type_preference: activeProfile.job_type || route.params?.jobType || null,
            skills:              activeProfile.skills || route.params?.skills || [],
            cv_url:              activeProfile.cv_url || route.params?.cvUrl || null,
            match_percent:       topJob.match ?? 0,
            status:              'Applied',
          })
          .select()
          .single();

          if (error) {
            console.warn('[saveMatch]', error.message);
            Sentry.captureException(error);
            Alert.alert('Apply Failed', 'Could not apply to this role. Please check your connection or try again later. Error: ' + error.message);
            return;
          }

          // Trigger detailed AI analysis in the background immediately
          const triggerAnalysis = async (retries = 2) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
              try {
                const analyzeRes = await fetch(`${getBackendUrl()}/api/analyze-match`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ record: data }),
                });
                if (!analyzeRes.ok) {
                  const errBody = await analyzeRes.text();
                  console.warn(`[analyzeMatch] Attempt ${attempt + 1} failed (${analyzeRes.status}):`, errBody);
                  Sentry.captureException(new Error(`[analyzeMatch] HTTP ${analyzeRes.status}: ${errBody}`));
                  if (attempt < retries) {
                    await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
                    continue;
                  }
                } else {
                  console.log('[analyzeMatch] Success for match:', data.match_id);
                  return;
                }
              } catch (err) {
                console.warn(`[analyzeMatch] Attempt ${attempt + 1} network error:`, err);
                Sentry.captureException(err);
                if (attempt < retries) {
                  await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
                }
              }
            }
          };
          triggerAnalysis();
        } catch (err) {
          console.warn('Failed to save match to database:', err);
          Sentry.captureException(err);
        }
      };

      posthog.capture('job_applied', {
        job_id: topJob.id,
        company: topJob.company,
        role: topJob.role,
        match_percent: topJob.match,
        category: topJob.category,
      });
      saveMatch();
      if (onMatchLand) onMatchLand(topJob);
    } else {
      // direction === 'left' or 'down' — user skipped this job
      posthog.capture('job_skipped', {
        job_id: topJob.id,
        company: topJob.company,
        role: topJob.role,
        match_percent: topJob.match,
        category: topJob.category,
        direction,
      });
    }
  }, [jobs, route.params, onMatchLand, translateX, translateY, posthog]);

  const hasTriggeredHaptic = useSharedValue(false);

  const gesture = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      'worklet';
      contextX.value = translateX.value;
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      translateX.value = contextX.value + e.translationX;
      translateY.value = contextY.value + e.translationY * 0.65; // Dampen less (0.65 instead of 0.4) so vertical drag feels lighter

      const THRESHOLD = 100;
      const isOver = Math.abs(translateX.value) > THRESHOLD || translateY.value > THRESHOLD;
      
      if (isOver && !hasTriggeredHaptic.value) {
        runOnJS(haptic.medium)();
        hasTriggeredHaptic.value = true;
      } else if (!isOver && hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((e) => {
      'worklet';
      const THRESHOLD = 90; // Lowered from 120 to make it require less physical drag distance
      const VELOCITY_THRESHOLD = 600; // Flick velocity threshold (px/sec) to trigger swipe

      const isDown  = (translateY.value > THRESHOLD || (e.velocityY > VELOCITY_THRESHOLD && translateY.value > 15)) && translateY.value > Math.abs(translateX.value);
      const isRight = (translateX.value > THRESHOLD || (e.velocityX > VELOCITY_THRESHOLD && translateX.value > 15)) && !isDown;
      const isLeft  = (translateX.value < -THRESHOLD || (e.velocityX < -VELOCITY_THRESHOLD && translateX.value < -15)) && !isDown;

      if (isRight || isLeft || isDown) {
        const dir = isDown ? 'down' : isRight ? 'right' : 'left';
        
        runOnJS(playSound)('swipe');
        if (dir === 'right') {
           runOnJS(playSound)('match');
        }

        // Handoff to JS immediately so LeavingCard smoothly takes over the trajectory 
        // without waiting for the animation to end, which removes the stutter/jump!
        runOnJS(handleSwipeComplete)(dir, translateX.value, translateY.value, e.velocityX, e.velocityY);
      } else {
        // Snappier, lighter spring physics to snap card back to center quickly when released
        translateX.value = withSpring(0, springs.snappy);
        translateY.value = withSpring(0, springs.snappy);
      }
      hasTriggeredHaptic.value = false;
    });

  const openDetail = useCallback(() => {
    if (jobs.length === 0) return;
    const topJob = jobs[0];
    setDetailJob(topJob);
    setShowDetail(true);
    posthog.capture('job_viewed', {
      job_id: topJob.id,
      company: topJob.company,
      role: topJob.role,
      match_percent: topJob.match,
      category: topJob.category,
    });
  }, [jobs, posthog]);

  const triggerSwipe = useCallback((dir) => {
    // For trigger buttons or programmatic swipes
    handleSwipeComplete(dir, 0, 0, 0, 0);
  }, [handleSwipeComplete]);

  // ── Render ────────────────────────────────────────────────────────────────
  const VISIBLE_COUNT = 3;
  const renderCount = Math.min(jobs.length, VISIBLE_COUNT + 1);

  const renderCards = () => {
    if (jobs.length === 0) return null;
    return jobs.slice(0, renderCount).reverse().map((job, idx) => {
      const stackIndex = renderCount - 1 - idx;
      const isTop = stackIndex === 0;
      const card = (
        <AnimatedCard
          key={job.id}
          job={job}
          isTop={isTop}
          stackIndex={stackIndex}
          translateX={translateX}
          translateY={translateY}
          onPress={openDetail}
          swipedCardId={swipedCardId}
          indexOffset={indexOffset}
        />
      );

      return isTop ? (
        <GestureDetector key={job.id} gesture={gesture}>
          {card}
        </GestureDetector>
      ) : card;
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Header — logo & text on left side */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 12, justifyContent: 'flex-start', alignItems: 'center', gap: 8 }]}>
        <Image 
          source={require('../../assets/logo.png')} 
          style={{ width: 28, height: 28 }} 
          resizeMode="contain" 
        />
        <Text style={[styles.logo, { color: colors.text.primary }]}>Jinni</Text>
      </View>

      {/* Morphing Liquid-Glass Notification Button */}
      <Animated.View style={morphingContainerStyle}>
        {/* Collapsed Menu State */}
        <Animated.View 
          style={[StyleSheet.absoluteFill, collapsedLayerStyle, { alignItems: 'center', justifyContent: 'center' }]}
          pointerEvents={activeNotification ? "none" : "auto"}
        >
          <TouchableOpacity 
            style={[styles.filterBtn, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]} 
            activeOpacity={0.7}
            onPress={handleMorphingBtnPress}
          >
            <View style={[styles.filterBtnCircle, { backgroundColor: colors.bg.secondary }]}>
              <Feather name="menu" size={16} color={colors.text.primary} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Expanded Notification State */}
        <Animated.View 
          style={[StyleSheet.absoluteFill, expandedLayerStyle]}
          pointerEvents={activeNotification ? "auto" : "none"}
        >
          <TouchableOpacity 
            style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }} 
            activeOpacity={0.95}
            onPress={handleMorphingBtnPress}
          >
            {/* Liquid Glass Shine Overlay */}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.05)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Close Button */}
            <TouchableOpacity 
              style={styles.notifCloseBtn} 
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveNotification(null);
              }}
              activeOpacity={0.7}
            >
              <Feather name="x" size={14} color="#666" />
            </TouchableOpacity>

            {/* Notification Header Row */}
            <View style={styles.notifBubbleRow}>
              <Feather 
                name={cachedNotification ? getNotifStyle(cachedNotification.type).icon : 'briefcase'} 
                size={20} 
                color={cachedNotification ? getNotifStyle(cachedNotification.type).text : C.night}
              />
              <Text style={[styles.notifBubbleTitle, { marginLeft: 6 }]} numberOfLines={1}>
                {cachedNotification ? `${cachedNotification.company} · ${cachedNotification.role}` : ''}
              </Text>
            </View>

            {/* Notification Body Text */}
            <Text 
              style={[
                styles.notifBubbleText, 
                { color: cachedNotification ? getNotifStyle(cachedNotification.type).text : C.night }
              ]} 
              numberOfLines={2}
            >
              {cachedNotification 
                ? (cachedNotification.type === 'Message' ? cachedNotification.text : getNotifStyle(cachedNotification.type).label)
                : ''}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Thought Bubble Satellite Dots */}
      <Animated.View style={dot1Style} pointerEvents="none" />
      <Animated.View style={dot2Style} pointerEvents="none" />

      {/* Card Deck */}
      <View style={styles.deck}>
        {showLoadingSpinner ? (
          <View style={styles.loadingDeck}>
            <LoadingPulse />
            <Text style={[styles.loadingTitle, { color: colors.text.primary }]}>Summoning jobs...</Text>
            <Text style={[styles.loadingSubtitle, { color: colors.text.secondary }]}>Evaluating your CV and skills with Gemini AI</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.emptyDeck}>
            <Feather name="star" size={72} color={C.orange} style={{ marginBottom: 8 }} />
            <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Your wish is our command, {userName}!</Text>
            <Text style={[styles.emptySubtitle, { color: colors.text.secondary }]}>But you've seen all roles for now. Check back tomorrow for more magic.</Text>
            <TouchableOpacity style={styles.reloadBtn} onPress={handleReload}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.reloadBtnText}>Refresh Wishes</Text>
                <Feather name="refresh-cw" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        ) : renderCards()}
      </View>

      {/* Expanded Details Card Overlay */}
      <ExpandedDetailCard 
        job={detailJob}
        isVisible={showDetail}
        onClose={closeDetail}
        onApply={() => { closeDetail(); setTimeout(() => triggerSwipe('right'), 300); }}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12,
  },
  logo: { fontSize: 22, fontWeight: '900', color: C.orange, letterSpacing: -0.5 },
  filterBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterBtnCircle: {
    width: 40, height: 40, backgroundColor: '#fff', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  filterIcon: { fontSize: 16, color: C.night },

  // Deck
  deck: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardWrapper: { position: 'absolute' },

  // Card — soft ambient shadow, no borders
  card: {
    width: CARD_W, height: CARD_HEIGHT, borderRadius: 36,
    backgroundColor: '#fff',
    shadowColor: C.night, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  cardInner: {
    flex: 1,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  cardTopContainer: {
    flex: 1,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
    position: 'relative',
  },
  cardTop: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  matchPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  matchPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardLogoWrap: { alignSelf: 'flex-start' },
  cardLogoBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    overflow: 'hidden',
  },
  cardLogoEmoji: { fontSize: 32 },
  cardBottom: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 8,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  cardCompany: {
    fontSize: 12,
    fontWeight: '700',
    color: C.orange,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardRole: {
    fontSize: 22,
    fontWeight: '800',
    color: C.night,
    letterSpacing: -0.5,
  },
  cardTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  cardTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cardTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  cardBottomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    paddingTop: 10,
  },
  cardSalary: {
    fontSize: 15,
    fontWeight: '800',
    color: C.night,
  },
  tapPrompt: {
    fontSize: 11,
    fontWeight: '600',
    color: C.hint,
  },

  // Stamp Overlays
  stampOverlay: {
    position: 'absolute',
    top: 36,
    borderWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 150,
  },
  stampLike: {
    left: 36,
    borderColor: C.green,
    transform: [{ rotate: '-12deg' }],
  },
  stampNope: {
    right: 36,
    borderColor: C.red,
    transform: [{ rotate: '12deg' }],
  },
  stampSave: {
    alignSelf: 'center',
    top: CARD_HEIGHT / 2 - 30,
    borderColor: C.gold,
    transform: [{ rotate: '-5deg' }],
  },
  stampTextLike: {
    fontSize: 24,
    fontWeight: '900',
    color: C.green,
    letterSpacing: 2,
  },
  stampTextNope: {
    fontSize: 24,
    fontWeight: '900',
    color: C.red,
    letterSpacing: 2,
  },
  stampTextSave: {
    fontSize: 24,
    fontWeight: '900',
    color: C.gold,
    letterSpacing: 2,
  },

  // Empty state
  emptyDeck: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },
  emptyIcon: { fontSize: 72, marginBottom: 8 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: C.night, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: C.hint, textAlign: 'center', lineHeight: 22 },
  reloadBtn: { backgroundColor: C.orange, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30, marginTop: 12 },
  reloadBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Detail sheet
  sheetBg2: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: C.night,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  sheetHandle: {
    backgroundColor: '#EBEBEF',
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  sheetRoleHeader: {
    fontSize: 20,
    fontWeight: '900',
    color: C.night,
    letterSpacing: -0.5,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetClose: {
    fontSize: 16,
    color: C.hint,
    fontWeight: '700',
  },
  detailLogoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F7F7FA',
    borderWidth: 1,
    borderColor: '#EBEBEF',
  },
  detailPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
  },
  sheetSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  salaryCard: {
    backgroundColor: '#F7F7FA',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  sheetSalary: {
    fontSize: 15,
    fontWeight: '700',
    color: C.night,
  },
  sheetDesc: { fontSize: 14, color: C.muted, lineHeight: 22 },
  sheetReq: { fontSize: 14, color: C.muted, marginBottom: 4, lineHeight: 22 },
  sheetApply: {
    backgroundColor: C.orange,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    width: '100%',
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  sheetApplyText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tag: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '600' },

  // Loading Screen Styles
  loadingDeck: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: C.night,
    marginTop: 16,
    letterSpacing: -0.4,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  pulseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 5,
  },
  pulseEmoji: {
    fontSize: 48,
  },

  // Thought Bubble Notification Styles
  notifBubbleContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 8 : 12,
    right: 16,
    zIndex: 999,
    alignItems: 'flex-end',
  },
  notifBubbleMain: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 1.5,
    width: SCREEN_W - 32,
    position: 'relative',
  },
  notifBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  notifBubbleEmoji: {
    fontSize: 18,
  },
  notifBubbleTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1A1A2E',
    flex: 1,
  },
  notifBubbleText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    paddingRight: 20,
  },
  notifCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  notifCloseText: {
    fontSize: 14,
    color: '#9E9EB9',
    fontWeight: '800',
  },
  notifDot1: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 26,
    marginTop: -3,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  notifDot2: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 18,
    marginTop: 3,
    shadowColor: '#1A1A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
});

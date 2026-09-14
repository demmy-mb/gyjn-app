import React, { useCallback, useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
  ScrollView, Alert, Dimensions, Animated as RNAnimated, Image,
} from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming,
  runOnJS, interpolate, withRepeat, withSequence, FadeIn,
} from 'react-native-reanimated';
const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle);
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { ICON_MAP } from '../lib/icons';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import { useTheme } from '../lib/ThemeProvider';
import BounceButton from '../components/BounceButton';
import { useMatches } from '../hooks/useMatches';

const STATUS_COLORS = {
  Applied:      { bg: 'rgba(255,107,44,0.12)', text: C.orange },
  Interviewing: { bg: 'rgba(123,79,233,0.12)', text: '#7B4FE9' },
  Hired:        { bg: 'rgba(0,200,150,0.12)',  text: '#00C896' },
};

function StreamText({ text, style }) {
  const [displayedText, setDisplayedText] = useState('');
  useEffect(() => {
    setDisplayedText('');
    const words = text.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(words.slice(0, i + 1).join(' '));
      i++;
      if (i >= words.length) clearInterval(interval);
    }, 25); // Fast word-by-word streaming (Gemini-like)
    return () => clearInterval(interval);
  }, [text]);
  
  return <Animated.Text entering={FadeIn.duration(400)} style={style}>{displayedText}</Animated.Text>;
}

// Fallback match score calculation in case backend sets match_percent to 0
const calculateMatchScore = (profile, job) => {
  if (!job) return 50;
  let score = 50;

  if (profile.category && job.category && profile.category.toLowerCase() === job.category.toLowerCase()) {
    score += 25;
  }

  const pJobType = profile.jobType || profile.job_type_preference;
  if (pJobType && job.job_type && pJobType.toLowerCase() === job.job_type.toLowerCase()) {
    score += 10;
  }

  if (profile.skills && profile.skills.length > 0 && job.tags && job.tags.length > 0) {
    const profileSkills = profile.skills.map(s => (typeof s === 'string' ? s : s.label || '').toLowerCase());
    let matchCount = 0;
    job.tags.forEach(t => {
      const tagLabel = (typeof t === 'string' ? t : t.label || '').toLowerCase();
      if (profileSkills.some(ps => ps.includes(tagLabel) || tagLabel.includes(ps))) matchCount++;
    });
    score += Math.min(15, matchCount * 3);
  }

  return Math.min(98, score);
};

const MatchCard = React.memo(function MatchCard({ item, isNew, onPress, onChatPress, userType }) {
  const { colors: tc } = useTheme();
  const s = STATUS_COLORS[item.status] || STATUS_COLORS.Applied;
  const canChat = item.status === 'Interviewing' || item.status === 'Hired';

  // Calculate fallback match score if the backend erroneously set it to 0
  const displayMatchPercent = item.match_percent && item.match_percent !== 0 
    ? item.match_percent 
    : calculateMatchScore(item, item.jobs);

  // Calculate unread badge state
  const otherSenderType = userType === 'employer' ? 'seeker' : 'employer';
  const msgs = item.messages ?? [];
  const sortedMsgs = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const lastMsg = sortedMsgs[sortedMsgs.length - 1];
  const hasUnread = lastMsg && (lastMsg.sender_type === otherSenderType || (otherSenderType === 'seeker' && lastMsg.sender_type === 'candidate'));

  return (
    <BounceButton
      style={[styles.card, { backgroundColor: tc.bg.card, borderColor: tc.border.light }]}
      activeOpacity={onPress ? 0.8 : 1.0}
      activeScale={onPress ? 0.95 : 1.0}
      onPress={onPress}
      disabled={!onPress}
    >
      {/* Logo / initials box */}
      <View style={[styles.logoBox, userType === 'employer' && { backgroundColor: C.peach }]}>
        {userType === 'employer' ? (
          <Text style={[styles.logoEmoji, { color: C.orange, fontSize: 24, fontWeight: '800' }]}>
            {(item.candidate_name || 'U').substring(0, 1).toUpperCase()}
          </Text>
        ) : (
          item.jobs?.logo_url ? (
            <Image source={{ uri: item.jobs.logo_url }} style={{ width: 50, height: 50, borderRadius: 25 }} resizeMode="cover" />
          ) : (
            <Text style={[styles.logoEmoji, { color: C.night, fontSize: 24, fontWeight: '800' }]}>
              {(item.jobs?.company || 'C').substring(0, 1).toUpperCase()}
            </Text>
          )
        )}
        {/* Match Percentage Badge */}
        {displayMatchPercent != null && (
          <View style={{
            position: 'absolute',
            bottom: -4,
            right: -6,
            backgroundColor: displayMatchPercent >= 80 ? '#00C896' : displayMatchPercent >= 50 ? '#FF9A62' : '#FF4B4B',
            borderRadius: 8,
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderWidth: 1.5,
            borderColor: tc.bg.card,
            zIndex: 10,
            minWidth: 32,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
          }}>
            <Text style={{ 
              color: '#FFF',
              fontSize: 9, 
              fontWeight: '800',
              fontFamily: 'Inter-Black',
              color: '#FFF',
              letterSpacing: -0.3,
            }}>
              {Math.round(displayMatchPercent)}%
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        {userType === 'employer' ? (
          <>
            <Text style={[styles.cardRole, { color: tc.text.primary }]} numberOfLines={1}>
              {item.candidate_name || 'Applicant'}
            </Text>
            <Text style={[styles.cardCompany, { color: tc.brand.orange }]} numberOfLines={1}>
              {item.candidate_role || 'Professional'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <View style={{ backgroundColor: '#F7F7FA', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#EBEBEB' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#5A5A7A' }}>For: {item.jobs?.role ?? 'Role'}</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.cardRole, { color: tc.text.primary }]} numberOfLines={1}>
              {item.jobs?.role ?? 'Role'}
            </Text>
            <Text style={[styles.cardCompany, { color: tc.brand.orange }]} numberOfLines={1}>
              {item.jobs?.company ?? ''}{item.jobs?.job_type ? ` · ${item.jobs.job_type}` : ''}
            </Text>
          </>
        )}
      </View>

      {/* Right: status + new badge */}
      <View style={styles.cardRight}>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusText, { color: s.text }]}>{item.status ?? 'Applied'}</Text>
        </View>
        {canChat && onPress && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <BounceButton 
              style={styles.chatActionIndicator}
              activeOpacity={0.6}
              activeScale={0.9}
              onPress={(e) => {
                e.stopPropagation();
                if (onChatPress) onChatPress();
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.chatActionText}>Chat</Text>
                <Feather name="message-circle" size={14} color="#7B4FE9" />
              </View>
            </BounceButton>
            {hasUnread && (
              <View style={styles.unreadDot} />
            )}
          </View>
        )}
        {isNew && !canChat && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>New</Text>
          </View>
        )}
      </View>
    </BounceButton>
  );
});

// Custom wrapper to manage row-level gesture state and exit animations.
// It is written with React Native Reanimated to ensure smooth 60fps/120fps animations.
// Reanimated runs animations directly on the UI thread, bypassing the React JS thread.
const SwipeableRow = React.memo(function SwipeableRow({ item, isNew, onUnapplyConfirmed, onOpenDetails, navigation, userName, userType }) {
  const swipeableRef = useRef(null);
  const hapticFired = useRef(false);
  const dragXRef = useRef(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const { width: SCREEN_W } = Dimensions.get('window');

  // Animated values for layout changes.
  // translateX moves the card left/right.
  // rowHeight handles collapsing. Initially -1 (sentinel for auto-height).
  // opacity controls fading.
  const translateX = useSharedValue(0);
  const rowHeight = useSharedValue(-1);
  const opacity = useSharedValue(1);

  const canChat = item.status === 'Interviewing' || item.status === 'Hired';

  // useAnimatedStyle connects the shared animation values to the component's visual styles.
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      height: rowHeight.value === -1 ? undefined : rowHeight.value,
      opacity: opacity.value,
    };
  });

  // This callback measures the item height when it first mounts on the layout.
  const onLayout = (event) => {
    const { height } = event.nativeEvent.layout;
    if (measuredHeight === 0 && height > 0) {
      setMeasuredHeight(height);
    }
  };

  // Perform a smooth 2-stage exit animation:
  // Stage 1: Slide card to the left off-screen while fading out (250ms).
  // Stage 2: Collapse card height to 0 (200ms) so items below slide up dynamically.
  // When completed, run the deletion logic on the JS thread.
  const startDeleteAnimation = () => {
    swipeableRef.current?.close();

    // Lock the height to the measured value before starting the collapse transition
    rowHeight.value = measuredHeight;

    translateX.value = withTiming(-SCREEN_W, { duration: 150 }, (finished) => {
      if (finished) {
        rowHeight.value = withTiming(0, { duration: 100 }, (heightFinished) => {
          if (heightFinished) {
            // runOnJS redirects execution back to the main React thread (JS thread)
            runOnJS(onUnapplyConfirmed)(item);
          }
        });
      }
    });
    opacity.value = withTiming(0, { duration: 150 });
  };

  const handleUnapplyPress = () => {
    Alert.alert(
      'Un - apply',
      'Do you want to un - apply for this job?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            swipeableRef.current?.close();
          },
        },
        {
          text: 'Un - apply',
          style: 'destructive',
          onPress: () => {
            startDeleteAnimation();
          },
        },
      ]
    );
  };

  const handleChatNavigation = () => {
    if (!canChat) return;
    swipeableRef.current?.close();
    navigation.navigate('Chat', { match: item, userName, userType });
  };

  // Only allow pressing the card if they are in a state that allows chatting (Interviewing or Hired)
  // When pressed, it takes them directly into the chat room.
  const handleCardPress = canChat ? handleChatNavigation : undefined;

  const handleSwipeableRightOpen = () => {
    // No-op — swipe visual feedback is sufficient
  };



  const renderRightActions = () => {
    if (userType === 'employer') return null; // Remove for employers
    return (
      <TouchableOpacity
        style={styles.unapplySwipeBtn}
        activeOpacity={0.8}
        onPress={handleUnapplyPress}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.unapplySwipeText}>Un - apply</Text>
          <Feather name="x" size={14} color="#fff" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View
      style={[styles.swipeableItemWrap, animatedStyle]}
      onLayout={onLayout}
    >
      {userType !== 'employer' ? (
        <Swipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          onSwipeableRightWillOpen={handleSwipeableRightOpen}
          friction={2}
          overshootFriction={8}
          rightThreshold={60}
          overshootRight={false}
        >
          <MatchCard
            item={item}
            isNew={isNew}
            onPress={handleCardPress}
            onChatPress={handleChatNavigation}
            userType={userType}
          />
        </Swipeable>
      ) : (
        <MatchCard
          item={item}
          isNew={isNew}
          onPress={handleCardPress}
          onChatPress={handleChatNavigation}
          userType={userType}
        />
      )}
    </Animated.View>
  );
});

const MatchCardSkeleton = React.memo(function MatchCardSkeleton({ animatedStyle }) {
  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      {/* Logo Box Placeholder */}
      <View style={[styles.logoBox, { backgroundColor: '#EBEBEB', borderColor: '#EBEBEB' }]} />

      {/* Info Placeholder */}
      <View style={styles.cardInfo}>
        <View style={[styles.skeletonLine, { width: '65%', height: 16, marginBottom: 8 }]} />
        <View style={[styles.skeletonLine, { width: '45%', height: 12 }]} />
      </View>

      {/* Right Badge Placeholder */}
      <View style={styles.cardRight}>
        <View style={[styles.skeletonLine, { width: 65, height: 22, borderRadius: 11 }]} />
      </View>
    </Animated.View>
  );
});

const MatchesSkeleton = React.memo(function MatchesSkeleton() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 800 }),
        withTiming(0.4, { duration: 800 })
      ),
      -1, // infinite loop
      true // reverse sequence
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  return (
    <View style={styles.skeletonContainer}>
      <Animated.View style={[styles.skeletonSearch, animatedStyle]} />
      <Animated.View style={[styles.skeletonTabs, animatedStyle]}>
        <View style={styles.skeletonTabPill} />
        <View style={[styles.skeletonTabPill, { width: 80 }]} />
        <View style={[styles.skeletonTabPill, { width: 100 }]} />
      </Animated.View>
      <View style={styles.skeletonList}>
        <MatchCardSkeleton animatedStyle={animatedStyle} />
        <MatchCardSkeleton animatedStyle={animatedStyle} />
        <MatchCardSkeleton animatedStyle={animatedStyle} />
        <MatchCardSkeleton animatedStyle={animatedStyle} />
      </View>
    </View>
  );
});

export default function MatchesScreen({ route, navigation }) {
  const { userName, userType, initialSearchQuery } = route.params || {};
  const isEmployer = userType === 'employer';
  const insets = useSafeAreaInsets();
  const { colors, shadows, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');

  // Keep search query in sync if we navigate to this tab with new params
  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [selectedStage, setSelectedStage] = useState('All');

  const { matches, isLoading, isFetching, refetch } = useMatches(userName, isEmployer);

  const stageCounts = useMemo(() => {
    const counts = {
      All: matches.length,
      Applied: 0,
      Interviewing: 0,
      Hired: 0,
    };
    matches.forEach((item) => {
      const status = item.status || 'Applied';
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });
    return counts;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    let result = [...matches]; // Copy to avoid mutating original
    
    // Sort logic: Hired items first when viewing 'All'
    if (selectedStage === 'All') {
      result.sort((a, b) => {
        const aHired = a.status === 'Hired' ? 1 : 0;
        const bHired = b.status === 'Hired' ? 1 : 0;
        if (aHired !== bHired) {
          return bHired - aHired; // 1 (Hired) comes before 0
        }
        return new Date(b.created_at) - new Date(a.created_at);
      });
    } else {
      result = result.filter((item) => (item.status || 'Applied') === selectedStage);
    }
    
    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase().trim();
    return result.filter((item) => {
      const role = item.jobs?.role?.toLowerCase() || '';
      const company = item.jobs?.company?.toLowerCase() || '';
      return role.includes(query) || company.includes(query);
    });
  }, [matches, selectedStage, searchQuery]);

  // Handle un-applying from a job posting after animation completes
  const handleUnapplyConfirmed = useCallback(async (item) => {
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('match_id', item.match_id);
    if (error) {
      Alert.alert('Error', `Could not un - apply: ${error.message}`);
    } else {
      refetch(); // Automatically sync UI with database deletions
    }
  }, [refetch]);

  const [selectedJob, setSelectedJob] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const generateAiRecommendation = async (force = false) => {
    if (!selectedJob || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://gyjn-dashboard.vercel.app';
      const response = await fetch(`${backendUrl}/api/analyze-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record: {
            match_id: selectedJob.match_id,
            job_id: selectedJob.jobs?.id,
            cv_url: selectedJob.cv_url,
            candidate_name: selectedJob.candidate_name,
            candidate_role: selectedJob.candidate_role,
            about_me: selectedJob.about_me,
            job_type_preference: selectedJob.job_type_preference,
            skills: selectedJob.skills,
          }
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to analyze candidate match.');

      if (result.success && result.aiResult) {
        const updated = {
          ...selectedJob,
          ai_summary: result.aiResult.ai_summary,
          ai_opinion: result.aiResult.ai_opinion,
          candidate_role: result.aiResult.candidate_role || selectedJob.candidate_role,
          skills: result.aiResult.skills || selectedJob.skills,
        };
        setSelectedJob(updated);
        refetch();
      }
    } catch (err) {
      console.warn('[AI Recommendation] Error:', err);
      setAnalysisError(err.message || 'An error occurred during analysis.');
    } finally {
      setAnalyzing(false);
    }
  };
  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ['70%', '90%'], []);

  const openSheet = useCallback((item) => {
    setSelectedJob(item);
    sheetRef.current?.expand();
  }, []);

  const closeSheet = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  // Employer: update a candidate's pipeline stage
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const handleUpdateStatus = useCallback(async (matchId, newStatus) => {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('matches')
        .update({ status: newStatus })
        .eq('match_id', matchId);
      if (error) throw error;
      // Update local selectedJob state so the sheet reflects the change immediately
      setSelectedJob((prev) => prev ? { ...prev, status: newStatus } : prev);
      refetch();
    } catch (err) {
      Alert.alert('Error', `Could not update status: ${err.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  }, [refetch]);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.3}
      />
    ),
    [],
  );

  const renderItem = useCallback(({ item, index }) => {
    return (
      <SwipeableRow
        item={item}
        isNew={index === 0}
        onUnapplyConfirmed={handleUnapplyConfirmed}
        onOpenDetails={openSheet}
        navigation={navigation}
        userName={userName}
        userType={userType}
      />
    );
  }, [handleUnapplyConfirmed, openSheet, navigation, userName, userType]);

  const keyExtractor = useCallback((item) => String(item.match_id ?? item.id), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>{isEmployer ? 'Applicants' : 'Applied'}</Text>
        <Text style={[styles.subtitle, { color: colors.text.hint }]}>
          {isEmployer ? (
            <>You have <Text style={styles.count}>{matches.length}</Text> applicant{matches.length !== 1 ? 's' : ''}</>
          ) : (
            <>You have applied to <Text style={styles.count}>{matches.length}</Text> role{matches.length !== 1 ? 's' : ''}</>
          )}
        </Text>
      </View>

      {/* Search Bar */}
      {!isLoading && matches.length > 0 && (
        <View style={styles.searchContainer}>
          <View style={[styles.searchInputWrap, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
            <Feather name="search" size={16} color={colors.text.hint} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text.primary }]}
              placeholder="Search by role or company..."
              placeholderTextColor={colors.text.hint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
          </View>
        </View>
      )}

      {/* Horizontal Pipeline Filter Tabs */}
      {!isLoading && matches.length > 0 && (
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
          >
            {['All', 'Applied', 'Interviewing', 'Hired'].map((stage) => {
              const isActive = selectedStage === stage;
              const count = stageCounts[stage];
              return (
                <TouchableOpacity
                  key={stage}
                  activeOpacity={0.8}
                  onPress={() => setSelectedStage(stage)}
                  style={[
                    styles.tabPill,
                    { backgroundColor: colors.bg.card, borderColor: colors.border.light },
                    isActive && styles.tabPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                    ]}
                  >
                    {stage} <Text style={[styles.tabCount, { color: colors.text.hint }, isActive && styles.tabCountActive]}>({count})</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

        <FlatList
          data={filteredMatches}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            filteredMatches.length === 0 && styles.listEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}

          ListHeaderComponent={
            filteredMatches.length > 0 ? (
              <Text style={[styles.sectionLabel, { color: colors.brand.orange }]}>
                {selectedStage === 'All'
                  ? (isEmployer ? 'ALL APPLICANTS' : 'ALL APPLICATIONS')
                  : `${selectedStage.toUpperCase()} (${filteredMatches.length})`}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="star" size={72} color={colors.brand.orange} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>
                {searchQuery || selectedStage !== 'All' ? 'No matches found' : 'No wishes granted yet'}
              </Text>
              <Text style={styles.emptyHint}>
                {searchQuery
                  ? "Try searching for a different keyword or role."
                  : selectedStage !== 'All'
                  ? `You don't have any matches in the ${selectedStage.toLowerCase()} stage yet.`
                  : "Keep swiping on roles you love — your matches will appear here."}
              </Text>
            </View>
          }
        />

      {/* Premium Job Details Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={[styles.sheetHandle, { backgroundColor: colors.border.medium }]}
        backgroundStyle={[styles.sheetBg, { backgroundColor: colors.bg.elevated }]}
        style={{ zIndex: 9999, elevation: 100 }}
      >
        {selectedJob && (
          <BottomSheetScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingBottom: insets.bottom + 160 }}>
              {isEmployer ? (
                // ── Employer View: Candidate Profile ──────────────────────
                <>
                  <View style={styles.sheetHeader}>
                    <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Candidate Profile</Text>
                    <TouchableOpacity onPress={closeSheet}>
                      <Feather name="x" size={24} color={colors.text.hint} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                    <View style={[styles.logoBox, { width: 64, height: 64, backgroundColor: C.peach, borderColor: 'transparent' }]}>
                      <Text style={{ fontSize: 28, fontWeight: '800', color: C.orange }}>
                        {(selectedJob.candidate_name || 'U').substring(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text.primary }}>{selectedJob.candidate_name || 'Applicant'}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.secondary, marginTop: 2 }}>{selectedJob.candidate_role || 'Professional'}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 6 }}>
                        <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border.light }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Applied for: {selectedJob.jobs?.role}</Text>
                        </View>
                        {selectedJob != null && (
                          <View style={{ backgroundColor: '#FFF0E8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,107,44,0.2)', marginLeft: 8 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: C.orange }}>
                              {Math.round(selectedJob.match_percent && selectedJob.match_percent !== 0 ? selectedJob.match_percent : calculateMatchScore(selectedJob, selectedJob.jobs))}% Match
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* AI Recruiter Insights */}
                  <View style={{ backgroundColor: colors.bg.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.light, padding: 16, position: 'relative' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.brand.orange, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        AI Recruiter Insights
                      </Text>
                      {selectedJob.ai_summary && !analyzing && (
                        <TouchableOpacity onPress={() => generateAiRecommendation(true)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.hint }}>Regenerate</Text>
                            <Feather name="refresh-cw" size={11} color={colors.text.hint} />
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    {analyzing ? (
                      <View style={{ gap: 8 }}>
                        <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '80%' }} />
                        <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '95%' }} />
                        <View style={{ height: 12, backgroundColor: '#F0F0F0', borderRadius: 4, width: '60%' }} />
                        <View style={{ height: 40, backgroundColor: '#F0F0F0', borderRadius: 8, marginTop: 8 }} />
                      </View>
                    ) : analysisError ? (
                      <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.15)' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Feather name="alert-triangle" size={14} color="#EF4444" />
                          <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>{analysisError}</Text>
                        </View>
                        <TouchableOpacity onPress={() => generateAiRecommendation(true)} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                          <Text style={{ color: C.orange, fontSize: 11, fontWeight: '800' }}>Try Again</Text>
                        </TouchableOpacity>
                      </View>
                    ) : selectedJob.ai_summary ? (
                      <View style={{ gap: 12 }}>
                        <View>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 }}>Profile & CV Summary</Text>
                          <StreamText style={{ fontSize: 14, color: colors.text.primary, lineHeight: 20 }} text={selectedJob.ai_summary} />
                        </View>
                        <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: colors.brand.orange }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary, marginBottom: 2 }}>Recruiter's Take</Text>
                          <StreamText style={{ fontSize: 13, color: colors.text.secondary, lineHeight: 18, fontWeight: '500' }} text={selectedJob.ai_opinion} />
                        </View>
                      </View>
                    ) : (
                      <View style={{ alignItems: 'center', paddingVertical: 16, borderWidth: 1.5, borderColor: colors.border.light, borderStyle: 'dashed', borderRadius: 12 }}>
                        <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 10 }}>No AI evaluation available yet.</Text>
                        <TouchableOpacity 
                          style={{ backgroundColor: colors.brand.orange, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                          onPress={() => generateAiRecommendation(true)}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Generate Insights</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* About */}
                  {selectedJob.about_me ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.secondary, letterSpacing: 1 }}>ABOUT</Text>
                      <Text style={{ fontSize: 15, color: colors.text.primary, lineHeight: 22 }}>{selectedJob.about_me}</Text>
                    </View>
                  ) : null}

                  {/* Skills */}
                  {selectedJob.skills && selectedJob.skills.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.secondary, letterSpacing: 1 }}>SKILLS</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {selectedJob.skills.map((skill, i) => (
                          <View key={i} style={[styles.detailPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}>
                            <Text style={[styles.detailPillText, { color: colors.text.secondary }]}>{skill}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* Action Buttons (Pipeline & Chat) */}
                  <View style={{ gap: 12, marginTop: 8, borderTopWidth: 1, borderColor: '#F0F0F0', paddingTop: 16 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1 }}>MOVE CANDIDATE</Text>
                    
                    {/* Enhanced Stage buttons row */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['Applied', 'Interviewing', 'Hired'].map((stage) => {
                        const isCurrent = (selectedJob.status || 'Applied') === stage;
                        const stageColors = {
                          Applied:      { active: C.orange,   inactive: '#FFF0E8', text: '#fff', textInactive: C.orange },
                          Interviewing: { active: '#7B4FE9',  inactive: '#F0EAFF', text: '#fff', textInactive: '#7B4FE9' },
                          Hired:        { active: '#00C896',  inactive: '#E6FAF5', text: '#fff', textInactive: '#00C896' },
                        };
                        const sc = stageColors[stage];
                        return (
                          <TouchableOpacity
                            key={stage}
                            style={[{
                              flex: 1,
                              paddingVertical: 14,
                              borderRadius: 16,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isCurrent ? sc.active : sc.inactive,
                              opacity: updatingStatus ? 0.6 : 1,
                              borderWidth: 1.5,
                              borderColor: isCurrent ? sc.active : 'transparent',
                            }]}
                            disabled={isCurrent || updatingStatus}
                            onPress={() => handleUpdateStatus(selectedJob.match_id, stage)}
                            activeOpacity={0.8}
                          >
                            <Feather name={stage === 'Applied' ? 'clipboard' : stage === 'Interviewing' ? 'mic' : 'award'} size={18} color={isCurrent ? sc.text : sc.textInactive} />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isCurrent ? sc.text : sc.textInactive, marginTop: 4 }}>
                              {stage}
                            </Text>
                            {isCurrent && <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)', marginTop: 2, fontWeight: '800', letterSpacing: 0.5 }}>CURRENT</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Chat button */}
                    {(selectedJob.status === 'Interviewing' || selectedJob.status === 'Hired') && (
                      <TouchableOpacity
                        style={[styles.submitBtn, { marginTop: 8 }]}
                        onPress={() => {
                          closeSheet();
                          navigation.navigate('Chat', { match: selectedJob, userName, userType });
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          <Text style={styles.submitText}>Chat with Candidate</Text>
                          <Feather name="message-circle" size={16} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                // ── Seeker View: Job Details ──────────────────────
                <>
                  <View style={styles.sheetHeader}>
                    <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Role Details</Text>
                    <TouchableOpacity onPress={closeSheet}>
                      <Text style={[styles.sheetClose, { color: colors.text.hint }]}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                    <View style={[styles.logoBox, { width: 64, height: 64, backgroundColor: selectedJob.jobs?.colors?.[1] || colors.brand.peach, borderColor: 'transparent' }]}>
                      {selectedJob.jobs?.logo_url ? (
                        <Image source={{ uri: selectedJob.jobs.logo_url }} style={{ width: 60, height: 60, borderRadius: 30 }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text.primary }}>
                          {(selectedJob.jobs?.company || 'C').substring(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text.primary }}>{selectedJob.jobs?.role}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.brand.orange, marginTop: 4 }}>{selectedJob.jobs?.company}</Text>
                    </View>
                  </View>
                  
                  {/* Tags */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <View style={[styles.detailPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}><Text style={[styles.detailPillText, { color: colors.text.secondary }]}>{selectedJob.status || 'Applied'}</Text></View>
                    {selectedJob != null && (
                      <View style={[styles.detailPill, { backgroundColor: '#FFF0E8', borderColor: 'rgba(255,107,44,0.2)' }]}>
                        <Text style={[styles.detailPillText, { color: C.orange, fontWeight: '800' }]}>
                          {Math.round(selectedJob.match_percent && selectedJob.match_percent !== 0 ? selectedJob.match_percent : calculateMatchScore(selectedJob, selectedJob.jobs))}% Match
                        </Text>
                      </View>
                    )}
                    {selectedJob.jobs?.job_type && <View style={[styles.detailPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}><Text style={[styles.detailPillText, { color: colors.text.secondary }]}>{selectedJob.jobs?.job_type}</Text></View>}
                    {selectedJob.jobs?.salary && <View style={[styles.detailPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}><Text style={[styles.detailPillText, { color: colors.text.secondary }]}>{selectedJob.jobs?.salary}</Text></View>}
                    {selectedJob.jobs?.category && <View style={[styles.detailPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}><Text style={[styles.detailPillText, { color: colors.text.secondary }]}>{selectedJob.jobs?.category}</Text></View>}
                  </View>

                  {/* Description */}
                  {selectedJob.jobs?.description && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.secondary, letterSpacing: 1 }}>ABOUT THE ROLE</Text>
                      <Text style={{ fontSize: 15, color: colors.text.primary, lineHeight: 22 }}>{selectedJob.jobs.description}</Text>
                    </View>
                  )}

                  {/* Reqs */}
                  {selectedJob.jobs?.reqs && selectedJob.jobs.reqs.length > 0 && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.secondary, letterSpacing: 1 }}>REQUIREMENTS</Text>
                      {selectedJob.jobs.reqs.map((req, i) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                          <Text style={{ color: colors.brand.orange }}>•</Text>
                          <Text style={{ fontSize: 15, color: colors.text.primary, lineHeight: 22, flex: 1 }}>{req}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Action Buttons */}
                  {(selectedJob.status === 'Interviewing' || selectedJob.status === 'Hired') ? (
                    <TouchableOpacity 
                      style={[styles.submitBtn, { marginTop: 20 }]} 
                      onPress={() => {
                        closeSheet();
                        navigation.navigate('Chat', { match: selectedJob, userName, userType });
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <Text style={styles.submitText}>Chat</Text>
                        <Feather name="message-circle" size={16} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ marginTop: 20, padding: 16, backgroundColor: 'rgba(255,107,44,0.06)', borderRadius: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: colors.brand.orange, fontWeight: '700' }}>Application pending review</Text>
                    </View>
                  )}
                </>
              )}
          </BottomSheetScrollView>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  skeletonLine: {
    backgroundColor: '#EBEBEB',
    borderRadius: 4,
  },
  skeletonContainer: {
    flex: 1,
  },
  skeletonSearch: {
    backgroundColor: '#EBEBEB',
    borderRadius: 16,
    height: 46,
    marginHorizontal: 24,
    marginBottom: 12,
    marginTop: 4,
  },
  skeletonTabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 12,
    gap: 8,
  },
  skeletonTabPill: {
    height: 36,
    width: 60,
    borderRadius: 20,
    backgroundColor: '#EBEBEB',
  },
  skeletonList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },

  // Header
  header:   { paddingHorizontal: 24, paddingBottom: 8, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 28, fontWeight: '800', color: C.night, textAlign: 'center' },
  subtitle: { fontSize: 13, color: C.hint, marginTop: 4, textAlign: 'center' },
  count:    { fontWeight: '700', color: C.orange },

  // Search Bar
  searchContainer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    marginTop: 4,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.night,
    padding: 0,
  },

  // Tabs
  tabsContainer: {
    paddingBottom: 12,
  },
  tabsScroll: {
    paddingHorizontal: 24,
    gap: 8,
    flexDirection: 'row',
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.03)',
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  tabPillActive: {
    backgroundColor: C.orange,
    borderColor: C.orange,
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
  },
  tabLabelActive: {
    color: '#fff',
  },
  tabCount: {
    fontSize: 11,
    fontWeight: '600',
    color: C.hint,
  },
  tabCountActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
  listEmpty:   { flex: 1, justifyContent: 'center' },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1.2, color: C.orange, marginBottom: 4, marginTop: 8,
  },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: C.night, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)',
  },
  swipeableItemWrap: {
    overflow: 'hidden',
    width: '100%',
  },
  unapplySwipeBtn: {
    backgroundColor: '#FF4757',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: 22,
    marginLeft: 10,
    height: '100%',
  },
  unapplySwipeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  chatSwipeBtn: {
    backgroundColor: C.orange,
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    borderRadius: 22,
    marginRight: 10,
    height: '100%',
  },
  chatSwipeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  logoBox: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,107,44,0.08)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,107,44,0.12)',
    overflow: 'hidden',
  },
  logoEmoji: { fontSize: 24 },
  cardInfo:    { flex: 1 },
  cardRole:    { fontSize: 16, fontWeight: '800', color: C.night },
  cardCompany: { fontSize: 13, color: C.orange, fontWeight: '600', marginTop: 2 },
  cardCandidate: { fontSize: 12, color: C.muted, marginTop: 2 },
  cardRight:   { alignItems: 'flex-end', gap: 4 },

  // Status badge
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // New badge
  newBadge:     { backgroundColor: C.orange, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  chatActionIndicator: {
    backgroundColor: 'rgba(255,107,44,0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
    borderWidth: 1,
    borderColor: C.orange,
  },
  chatActionText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.orange,
    textTransform: 'uppercase',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4757', // Alert red indicator dot
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyIcon:  { fontSize: 56, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.night },
  emptyHint:  { fontSize: 13, color: C.hint, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

  // Bottom Sheet styling
  sheetBg: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: C.night,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },
  sheetHandle: {
    backgroundColor: '#EBEBEF',
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: C.night,
    letterSpacing: -0.5,
  },
  sheetClose: {
    fontSize: 16,
    color: C.hint,
    padding: 6,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: C.orange,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  detailPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.lightGray,
    borderWidth: 1,
    borderColor: '#EBEBEF',
  },
  detailPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
  },
});

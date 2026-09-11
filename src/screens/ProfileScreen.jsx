import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Dimensions, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import BounceButton from '../components/BounceButton';
import { useTheme } from '../lib/ThemeProvider';
import { useSubscription } from '../hooks/useSubscription';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function ProfileScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  
  // The route.params are our "source of truth" passed from MainTabs
  const {
    userName    = 'You',
    userRole    = 'Professional',
    jobType     = 'Full-time',
    aboutMe     = '',
    skills: initialSkills,
    userType,
    category: initialCategory = 'Tech & Software',
  } = route.params || {};
  const isEmployer = userType === 'employer';

  const defaultSkills = useMemo(() =>
    initialSkills?.length > 0 ? initialSkills : ['JavaScript', 'React', 'Figma'],
  [initialSkills]);

  // Local display state
  const [profile, setProfile] = useState({
    name:    userName,
    role:    userRole,
    about:   aboutMe,
    jobType: jobType,
    skills:  defaultSkills,
    category: initialCategory,
    companyName: route.params?.companyName || '',
  });

  const [userEmail, setUserEmail] = useState('');
  const [localSwipes, setLocalSwipes] = useState(0);
  const [localMatches, setLocalMatches] = useState(0);
  const { isPremium, subscription } = useSubscription();

  const loadProfileAndStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        
        // 1. Fetch live profile data from Supabase to ensure we're up to date
        // even after coming back from Settings
        const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
        const { data: dbProfile } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', user.id)
          .single();

        let activeName = userName;
        if (dbProfile) {
          activeName = dbProfile.user_name || userName;
          setProfile({
            name:     activeName,
            role:     dbProfile.user_role || userRole,
            about:    dbProfile.about_me || aboutMe,
            jobType:  dbProfile.job_type || jobType,
            skills:   dbProfile.skills || defaultSkills,
            category: dbProfile.category || initialCategory,
            companyName: dbProfile.company_name || '',
          });
        }

        // 2. Fetch live stats
        const swipesVal = await AsyncStorage.getItem('seeker_swipes_count');
        if (swipesVal) {
          setLocalSwipes(parseInt(swipesVal));
        }

        if (isEmployer) {
          const { count } = await supabase
            .from('matches')
            .select('*', { count: 'exact', head: true });
          setLocalMatches(count || 0);
        } else {
          const { count } = await supabase
            .from('matches')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);
          setLocalMatches(count || 0);
        }
      }
    } catch (err) {
      console.warn('Failed to load live profile and stats:', err);
    }
  }, [userName, userRole, aboutMe, jobType, defaultSkills, initialCategory, isEmployer]);

  useFocusEffect(
    useCallback(() => {
      loadProfileAndStats();
    }, [loadProfileAndStats])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={{ width: 40 }} />
        <Text style={[styles.title, { color: colors.text.primary }]}>Profile</Text>
        <BounceButton 
          style={[styles.settingsBtn, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]} 
          onPress={() => navigation.navigate('Settings', route.params)} 
          activeScale={0.85}
        >
          <Feather name="settings" size={20} color={colors.text.primary} />
        </BounceButton>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <LinearGradient colors={[C.night, '#2A2A4E']} style={styles.profileCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>
              {profile.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
            {isPremium && (
              <LinearGradient
                colors={['#FFB042', '#FF6B2C']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#1E1815',
                  shadowColor: '#FF6B2C',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.5,
                  shadowRadius: 4,
                  elevation: 5
                }}>
                <Feather name="star" size={14} color="#FFF" />
              </LinearGradient>
            )}
          </View>
          <Text style={[styles.pName, { marginTop: 4 }]}>{profile.name}</Text>
          {isPremium && (
            <LinearGradient
              colors={['#FFD166', '#FF9B3E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'center',
                marginTop: 2,
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
                shadowColor: '#FF9B3E',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.55,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              <Feather name="zap" size={10} color="#1E1815" />
              <Text style={{ color: '#1E1815', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
                PREMIUM
              </Text>
            </LinearGradient>
          )}
          <Text style={styles.pRole}>{profile.role} {isEmployer ? (profile.companyName ? `at ${profile.companyName}` : '') : `· ${profile.category}`}</Text>
          {profile.about ? (
            <Text style={styles.pBio} numberOfLines={2}>{profile.about}</Text>
          ) : null}
        </LinearGradient>

        {/* Statistical Grid */}
        <View style={styles.statsCardsRow}>
          {[
            { val: localSwipes, lbl: 'Swipes', icon: 'zap', color: C.orange },
            { val: localMatches,  lbl: isEmployer ? 'Applicants' : 'Applied', icon: 'star', color: '#7B4FE9' },
          ].map(({ val, lbl, icon, color }) => (
            <View key={lbl} style={[styles.statCard, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
              <View style={[styles.statIconBox, { backgroundColor: `${color}12` }]}>
                <Feather name={icon} size={16} color={color} />
              </View>
              <Text style={[styles.statCardVal, { color: colors.text.primary }]}>{val}</Text>
              <Text style={[styles.statCardLbl, { color: colors.text.secondary }]}>{lbl}</Text>
            </View>
          ))}
        </View>

        {/* Skills */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text.hint }]}>SKILLS</Text>
          {profile.skills.length > 0 ? (
            <View style={styles.chips}>
              {profile.skills.map((s) => (
                <View key={s} style={[styles.chip, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
                  <Text style={[styles.chipText, { color: colors.text.primary }]}>{s}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>Open Settings to add your skills</Text>
          )}
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text.hint }]}>ACCOUNT & PREFERENCES</Text>
          {[
            { label: 'Email',        val: userEmail || 'Loading...' },
            { label: 'Looking for',  val: profile.jobType },
            ...(isEmployer ? [] : [{ label: 'Category', val: profile.category }]),
            { label: 'Availability', val: 'Immediate' },
            { label: 'Remote OK?',   val: 'Yes' },
          ].map(({ label, val }) => (
            <View key={label} style={[styles.prefRow, { borderBottomColor: colors.border.light }]}>
              <Text style={[styles.prefLabel, { color: colors.text.secondary }]}>{label}</Text>
              <Text style={[styles.prefVal, { color: colors.text.primary }]}>{val}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: C.night, textAlign: 'center', flex: 1 },
  settingsBtn: {
    width: 40, height: 40, backgroundColor: '#fff', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 120, gap: 14 },

  // Profile card
  profileCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3.5,
    borderColor: C.orange,
  },
  avatarInitials: { fontSize: 30, fontWeight: '900', color: '#fff' },
  pName: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  pRole: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '600', textAlign: 'center' },
  pBio: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4, paddingHorizontal: 10, lineHeight: 18 },

  // Stats cards
  statsCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.015)',
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statCardVal: {
    fontSize: 18,
    fontWeight: '800',
    color: C.night,
  },
  statCardLbl: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Sections
  section: { backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.06)' },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: C.orange, marginBottom: 12 },
  emptyHint: { fontSize: 13, color: C.hint, fontStyle: 'italic' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { 
    backgroundColor: 'rgba(255,107,44,0.08)', 
    borderRadius: 20, 
    paddingHorizontal: 14, 
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,107,44,0.15)',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: C.orange },

  prefRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: 'rgba(0,0,0,0.04)' 
  },
  prefLabel: { fontSize: 13, fontWeight: '500', color: C.muted },
  prefVal: { fontSize: 13, fontWeight: '700', color: C.night },
});

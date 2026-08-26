import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Alert,
  TouchableOpacity, Modal, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, Dimensions, Pressable, PanResponder
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  interpolate, runOnJS
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import { usePostHog } from 'posthog-react-native';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import { getBackendUrl } from '../lib/config';
import BounceButton from '../components/BounceButton';
import AnimatedInput from '../components/AnimatedInput';
import SkeletonPulse from '../components/SkeletonPulse';
import { useTheme } from '../lib/ThemeProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Base64 to ArrayBuffer decoder for React Native uploads
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

function decodeBase64(rawBase64) {
  // Strip any newlines or whitespace that Expo might add
  const base64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');
  
  let bufferLength = base64.length * 0.75;
  const len = base64.length;
  let p = 0;
  let val1, val2, val3, val4;

  if (base64[len - 1] === '=') {
    bufferLength--;
    if (base64[len - 2] === '=') {
      bufferLength--;
    }
  }

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arrayBuffer);

  for (let i = 0; i < len; i += 4) {
    val1 = lookup[base64.charCodeAt(i)];
    val2 = lookup[base64.charCodeAt(i + 1)];
    val3 = lookup[base64.charCodeAt(i + 2)];
    val4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (val1 << 2) | (val2 >> 4);
    if (p < bufferLength) bytes[p++] = ((val2 & 15) << 4) | (val3 >> 2);
    if (p < bufferLength) bytes[p++] = ((val3 & 3) << 6) | (val4 & 63);
  }

  return arrayBuffer;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CATEGORIES = [
  { name: 'Tech & Software', icon: 'monitor' },
  { name: 'Design & Creative', icon: 'pen-tool' },
  { name: 'Product & Project', icon: 'trello' },
  { name: 'Data & Analytics', icon: 'trending-up' },
  { name: 'Marketing & Sales', icon: 'pie-chart' },
  { name: 'Business & Operations', icon: 'settings' },
  { name: 'Finance & Accounting', icon: 'dollar-sign' },
  { name: 'Human Resources', icon: 'users' },
  { name: 'Supply Chain & Logistics', icon: 'truck' },
  { name: 'Other', icon: 'briefcase' }
];

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];

export default function SettingsScreen({ navigation, route }) {
  const posthog = usePostHog();
  const { colors, isDark, toggleDarkMode } = useTheme();
  
  const {
    userName    = 'You',
    userRole    = 'Professional',
    jobType     = 'Full-time',
    aboutMe     = '',
    skills: initialSkills,
    cvUrl:  initialCvUrl  = null,
    cvName: initialCvName = null,
    userType,
    category: initialCategory = 'Tech & Software',
  } = route.params || {};
  const isEmployer = userType === 'employer';

  const defaultSkills = useMemo(() =>
    initialSkills?.length > 0 ? initialSkills : ['JavaScript', 'React', 'Figma'],
  [initialSkills]);

  // Local draft state
  const [draft, setDraft] = useState({
    name:    userName,
    role:    userRole,
    about:   aboutMe,
    jobType: jobType,
    skills:  defaultSkills,
    category: initialCategory,
    companyName: route.params?.companyName || '',
  });

  const [saving, setSaving] = useState(false);

  // Edit Profile Modal state
  const [editing, setEditing] = useState(false);
  const editTranslateY = useSharedValue(SCREEN_H);

  const closeEditModal = useCallback(() => {
    editTranslateY.value = withTiming(SCREEN_H, { duration: 250 }, (finished) => {
      if (finished) {
        runOnJS(setEditing)(false);
      }
    });
  }, [editTranslateY]);

  useEffect(() => {
    if (editing) {
      editTranslateY.value = SCREEN_H;
      editTranslateY.value = withTiming(0, { duration: 200 });
    }
  }, [editing, editTranslateY]);

  const editBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(editTranslateY.value, [0, SCREEN_H * 0.5], [1, 0], 'clamp');
    return { opacity };
  });

  const editSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: editTranslateY.value }],
  }));

  const openEdit = () => {
    setEditing(true);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        editTranslateY.value = gestureState.dy;
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 120 || gestureState.vy > 0.5) {
        closeEditModal();
      } else {
        editTranslateY.value = withTiming(0, { duration: 250 });
      }
    }
  }), [editTranslateY, closeEditModal]);


  // CV state
  const [cvUrl, setCvUrl]             = useState(initialCvUrl);
  const [cvName, setCvName]           = useState(initialCvName);
  const [cvUploading, setCvUploading] = useState(false);
  const [aiParsing, setAiParsing]     = useState(false);

  // CV Review Modal state
  const [showCvReview, setShowCvReview] = useState(false);
  const [cvChanges, setCvChanges]       = useState(null);
  const [acceptedFields, setAcceptedFields] = useState({
    name: true, role: true, about: true, skills: true, category: true,
  });
  const reviewTranslateY = useSharedValue(SCREEN_H);
  const [skillInput, setSkillInput]   = useState('');

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (aiParsing) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [aiParsing]);

  const animatedPulseStyle = useAnimatedStyle(() => {
    return {
      opacity: pulseOpacity.value,
    };
  });

  // Load latest profile info from DB just in case route.params is stale
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
        const { data: dbProfile } = await supabase.from(tableName).select('*').eq('id', user.id).single();
        if (dbProfile) {
          setDraft({
            name:     dbProfile.user_name || userName,
            role:     dbProfile.user_role || userRole,
            about:    dbProfile.about_me || aboutMe,
            jobType:  dbProfile.job_type || jobType,
            skills:   dbProfile.skills || defaultSkills,
            category: dbProfile.category || initialCategory,
            companyName: dbProfile.company_name || '',
          });
          setCvUrl(dbProfile.cv_url);
          if (dbProfile.cv_url) {
            const parts = dbProfile.cv_url.split('/');
            const filenameWithTimestamp = parts[parts.length - 1];
            const filename = filenameWithTimestamp.replace(/^\d+_/, '');
            setCvName(decodeURIComponent(filename));
          } else {
            setCvName(null);
          }
        }
      }
    };
    loadProfile();
  }, [isEmployer, userName, userRole, aboutMe, jobType, defaultSkills, initialCategory]);


  // Animated styles for CV review modal
  const reviewSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reviewTranslateY.value }],
  }));
  const reviewBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(reviewTranslateY.value, [0, SCREEN_H * 0.5], [1, 0], 'clamp');
    return { opacity };
  });

  const closeCvReview = useCallback(() => {
    reviewTranslateY.value = withTiming(SCREEN_H, { duration: 250 }, (finished) => {
      if (finished) {
        runOnJS(setShowCvReview)(false);
      }
    });
  }, [reviewTranslateY]);

  const toggleField = (field) => {
    setAcceptedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const applyCvChanges = async () => {
    if (!cvChanges) return;
    const updates = {};
    if (acceptedFields.name && cvChanges.name) updates.name = cvChanges.name;
    if (acceptedFields.role && cvChanges.role) updates.role = cvChanges.role;
    if (acceptedFields.about && cvChanges.about) updates.about = cvChanges.about;
    if (acceptedFields.skills && cvChanges.skills) updates.skills = cvChanges.skills;
    if (acceptedFields.category && cvChanges.category) updates.category = cvChanges.category;

    // Apply to draft
    setDraft(prev => ({ ...prev, ...updates }));

    // Automatically trigger a full save when applying CV changes so they persist immediately
    saveEdit({ ...draft, ...updates });

    closeCvReview();
  };

  const saveEdit = async (forcedDraft = draft) => {
    if (!forcedDraft.name?.trim()) {
      Alert.alert('Required Field', 'Please enter your name.');
      return;
    }

    if (!isEmployer && !cvUrl) {
      const aboutLen = (forcedDraft.about || '').trim().length;
      if (aboutLen < 500) {
        Alert.alert(
          'More Context Required',
          `Since you haven't uploaded a CV, your 'About You' section must be at least 500 characters (currently ${aboutLen}/500) so our AI has enough details about your background to match you.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
        const { error } = await supabase
          .from(tableName)
          .upsert({
            id:            user.id,
            user_name:     forcedDraft.name,
            user_role:     forcedDraft.role,
            about_me:      forcedDraft.about,
            skills:        forcedDraft.skills,
            category:      forcedDraft.category,
            job_type:      forcedDraft.jobType,
            cv_url:        cvUrl,
            ...(isEmployer && { company_name: forcedDraft.companyName }),
          });
        
        if (error) {
          Alert.alert('Error updating profile', error.message);
          setSaving(false);
          return;
        }

        // Sync changes to ALL existing matches for this candidate (Seekers only really, but safe for both)
        if (!isEmployer) {
            const { data: existingMatches } = await supabase
            .from('matches')
            .select('match_id')
            .eq('user_id', user.id);

            if (existingMatches && existingMatches.length > 0) {
            const matchUpdates = {
                candidate_name: forcedDraft.name,
                candidate_role: forcedDraft.role,
                skills: forcedDraft.skills,
                category: forcedDraft.category,
                about_me: forcedDraft.about,
                cv_url: cvUrl,
                updated_at: new Date().toISOString(),
            };

            for (const m of existingMatches) {
                await supabase.from('matches').update(matchUpdates).eq('match_id', m.match_id);
                // Trigger score recalculation
                fetch(`${getBackendUrl()}/api/recalculate-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ match_id: m.match_id }),
                }).catch(err => {
                  console.warn('[recalculate-match]', err);
                  Sentry.captureException(err);
                });
            }
            }
        }
      }

      // Sync back to Tab router params so other tabs update
      navigation.getParent()?.setParams({
        userName: forcedDraft.name,
        userRole: forcedDraft.role,
        aboutMe: forcedDraft.about,
        skills: forcedDraft.skills,
        category: forcedDraft.category,
        jobType: forcedDraft.jobType,
      });

      posthog.capture('profile_updated', {
        user_type: isEmployer ? 'employer' : 'seeker',
        skills_count: forcedDraft.skills.length,
        has_cv: Boolean(cvUrl),
      });

      // Close modal on successful save
      closeEditModal();
      
    } catch (err) {
      console.warn('Database save failed:', err);
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  };

  const pickAndUploadCV = async () => {
    try {
      // Rate Limit Check
      const usageStr = await AsyncStorage.getItem('@cv_parse_usage');
      let usageLogs = usageStr ? JSON.parse(usageStr) : [];
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      usageLogs = usageLogs.filter(t => t > oneHourAgo);
      if (usageLogs.length >= 2) {
        Alert.alert(
          'Rate Limit Exceeded',
          'You can only use the AI CV Auto-fill 2 times per hour. Please try again later.'
        );
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setCvUploading(true);

      const filename = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;

      // We use base64 decoding because FormData wraps the file in multipart boundary on React Native
      // and fetch(blob) is blocked on Android for file:// URIs. The decodeBase64 function is completely safe.
      const base64Str = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const arrayBuffer = decodeBase64(base64Str);

      const { error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(filename, arrayBuffer, { contentType: file.mimeType || 'application/pdf', upsert: true });

      if (uploadError) {
        Alert.alert('Upload Failed', uploadError.message);
        setCvUploading(false);
        return;
      }
      const { data } = supabase.storage.from('cvs').getPublicUrl(filename);
      setCvUrl(data.publicUrl);
      setCvName(file.name);
      setCvUploading(false);

      // Sync CV to user profile immediately
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
        await supabase
          .from(tableName)
          .update({ cv_url: data.publicUrl })
          .eq('id', user.id);
      }

      // Trigger AI parsing in the background
      setAiParsing(true);
      try {
        const response = await fetch(`${getBackendUrl()}/api/parse-cv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cvUrl: data.publicUrl, userId: user?.id }),
        });

        if (response.status === 429) {
          throw new Error('RATE_LIMIT_EXCEEDED');
        }

        if (!response.ok) {
          let errMsg = 'CV Parsing failed';
          try {
            const errData = await response.json();
            errMsg = errData.error || errMsg;
          } catch (e) {}
          throw new Error(errMsg);
        }
        const parseData = await response.json();

        if (parseData.success && parseData.profile) {
          const { name: parsedName, role: parsedRole, aboutMe: parsedAbout, skills: parsedSkills, category: parsedCategory } = parseData.profile;

          setCvChanges({
            name: parsedName || null,
            role: parsedRole || null,
            about: parsedAbout || null,
            skills: Array.isArray(parsedSkills) ? parsedSkills : null,
            category: parsedCategory || null,
          });

          // Log successful parse for rate limiting
          usageLogs.push(Date.now());
          await AsyncStorage.setItem('@cv_parse_usage', JSON.stringify(usageLogs));

          setAcceptedFields({ name: true, role: true, about: true, skills: true, category: true });
          setShowCvReview(true);
          reviewTranslateY.value = SCREEN_H;
          reviewTranslateY.value = withTiming(0, { duration: 350 });
        }
      } catch (parseErr) {
        console.warn('CV Auto-fill failed:', parseErr);
        Sentry.captureException(parseErr);
        if (parseErr.message === 'RATE_LIMIT_EXCEEDED') {
          Alert.alert(
            'Rate Limit Exceeded',
            'You can only use the AI CV Auto-fill 2 times per hour. Your file was uploaded successfully, but please wait before auto-filling again.'
          );
        } else {
          Alert.alert(
            'Auto-fill Unavailable',
            `Genie was unable to parse your CV automatically (Error: ${parseErr.message || 'Unknown'}). Your file was uploaded successfully though!`
          );
        }
      } finally {
        setAiParsing(false);
      }
    } catch (err) {
      Alert.alert('Error', `Could not pick file: ${err?.message || err}`);
      setCvUploading(false);
      setAiParsing(false);
    }
  };

  const deleteCV = () => {
    const aboutLen = (draft.about || '').trim().length;
    if (!isEmployer && aboutLen < 500) {
      Alert.alert(
        'Cannot Remove CV',
        `To remove your CV, your 'About You' section must first be at least 500 characters (currently ${aboutLen}/500) to ensure the AI has enough context to match you.`
      );
      return;
    }

    Alert.alert('Remove CV', 'Remove your uploaded CV?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setCvUrl(null);
          setCvName(null);
          const { data: { user } } = await supabase.auth.getUser();
          const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
          if (user) {
            await supabase
              .from(tableName)
              .update({ cv_url: null })
              .eq('id', user.id);
          }
        },
      },
    ]);
  };

  const handleAddDraftSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !draft.skills.includes(trimmed)) {
      setDraft(prev => ({ ...prev, skills: [...prev.skills, trimmed] }));
    }
    setSkillInput('');
  };

  const removeDraftSkill = (skillToRemove) => {
    setDraft(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skillToRemove) }));
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Log Out', 
        style: 'destructive',
        onPress: async () => {
          posthog.capture('user_logged_out');
          posthog.reset();
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert('Error', error.message);
          }
          navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
        }
      }
    ]);
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? All your profile data, matches, and messages will be erased. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                // 1. Try RPC call
                const { error: rpcErr } = await supabase.rpc('delete_user_account');
                if (rpcErr) {
                  // Fallback manual table cleanup
                  const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
                  await supabase.from(tableName).delete().eq('id', user.id);
                  await supabase.from('profiles').delete().eq('id', user.id);
                  await supabase.from('matches').delete().eq('user_id', user.id);
                  if (isEmployer) {
                    await supabase.from('jobs').delete().eq('employer_id', user.id);
                  }
                }
              }

              // Sign out session & clear cache
              await supabase.auth.signOut();
              await AsyncStorage.clear();

              navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
            } catch (err) {
              console.warn('Account deletion failed:', err);
              Alert.alert('Error', `Account deletion failed: ${err.message || err}`);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg.primary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BounceButton onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={colors.text.primary} />
        </BounceButton>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Premium Upgrade */}
        <View style={styles.section}>
          <BounceButton 
            style={[styles.settingRow, { backgroundColor: colors.brand.orange, borderColor: colors.brand.orange, paddingVertical: 14 }]}
            onPress={() => navigation.navigate('Premium')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Feather name="star" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Jinni Premium</Text>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 }}>Upgrade your experience</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#FFF" />
          </BounceButton>
        </View>

        {/* Profile Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text.hint }]}>PROFILE</Text>
          <BounceButton 
            style={[styles.settingRow, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}
            onPress={openEdit}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
                <Feather name="user" size={20} color={colors.text.primary} />
              </View>
              <Text style={[styles.settingText, { color: colors.text.primary }]}>Edit Profile Details</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.text.hint} />
          </BounceButton>
        </View>

        {/* CV Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text.hint }]}>CV / RESUME</Text>
          <View style={{ padding: 12, borderRadius: 12, marginBottom: 12, backgroundColor: colors.bg.card }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="zap" size={14} color={colors.text.secondary} />
              <Text style={{ fontSize: 12, color: colors.text.secondary, fontWeight: '500', flex: 1 }}>
                Upload a new CV to automatically update your profile details via Genie AI.
              </Text>
            </View>
          </View>

          {/* CV State UI */}
          {(cvUploading || aiParsing) ? (
            <View style={[styles.cvPickBox, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
              {cvUploading ? (
                <>
                  <ActivityIndicator color={C.orange} size="small" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.cvPickText, { color: colors.text.primary }]}>Uploading CV...</Text>
                    <Text style={[styles.cvPickSub, { color: colors.text.hint }]}>Sending file securely to storage</Text>
                  </View>
                </>
              ) : (
                <>
                  <ActivityIndicator color={C.orange} size="small" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.cvPickText, { color: C.orange }]}>Genie is reading your CV...</Text>
                    <Text style={[styles.cvPickSub, { color: colors.text.hint }]}>Extracting profile details</Text>
                  </View>
                </>
              )}
            </View>
          ) : cvUrl ? (
            <View style={styles.cvEditRow}>
              <Feather name="file-text" size={20} color="#065F46" />
              <Text style={styles.cvFileName} numberOfLines={1}>{cvName || 'Uploaded CV'}</Text>
              <TouchableOpacity onPress={pickAndUploadCV} style={styles.cvReplaceBtn}>
                <Text style={styles.cvReplaceText}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deleteCV} style={styles.cvDeleteBtnEdit}>
                <Feather name="x" size={14} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.cvPickBox, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}
              onPress={pickAndUploadCV}
              activeOpacity={0.8}
            >
              <Feather name="upload-cloud" size={24} color={C.orange} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.cvPickText, { color: colors.text.primary }]}>Upload your CV</Text>
                <Text style={[styles.cvPickSub, { color: colors.text.hint }]}>PDF or Word</Text>
              </View>
              <Text style={styles.cvPickArrow}>↑</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text.hint }]}>APP PREFERENCES</Text>
          
          <View style={[styles.settingRow, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
                <Feather name={isDark ? "moon" : "sun"} size={20} color={colors.text.primary} />
              </View>
              <Text style={[styles.settingText, { color: colors.text.primary }]}>Dark Mode</Text>
            </View>
            <Switch 
              value={isDark} 
              onValueChange={toggleDarkMode} 
              trackColor={{ false: '#d1d5db', true: C.orange }}
            />
          </View>

          <BounceButton 
            style={[styles.settingRow, { backgroundColor: colors.bg.card, borderColor: colors.border.light, marginTop: 12 }]}
            onPress={handleLogout}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255,71,87,0.1)' }]}>
                <Feather name="log-out" size={20} color={C.red} />
              </View>
              <Text style={[styles.settingText, { color: C.red }]}>Log Out</Text>
            </View>
          </BounceButton>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: '#EF4444' }]}>DANGER ZONE</Text>
          <BounceButton 
            style={[styles.settingRow, { backgroundColor: 'rgba(239, 68, 68, 0.05)', borderWidth: 0 }]}
            onPress={handleDeleteAccount}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <Feather name="trash-2" size={20} color="#EF4444" />
              </View>
              <Text style={[styles.settingText, { color: '#EF4444' }]}>Delete Account</Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(239, 68, 68, 0.5)" />
          </BounceButton>
        </View>

      </ScrollView>


      {/* ── Edit Profile Modal ── */}
      <Modal visible={editing} transparent animationType="none" statusBarTranslucent={true}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeEditModal}>
          <Animated.View style={[styles.sheetBg, editBgStyle]} />
        </Pressable>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, { backgroundColor: colors.bg.elevated }, editSheetStyle]}>
            <View 
              {...panResponder.panHandlers}
              style={styles.dragZone}
            >
              <View style={[styles.sheetHandle, { backgroundColor: colors.border.medium }]} />
            </View>

            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeEditModal}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => saveEdit(draft)}>
                {saving ? (
                   <ActivityIndicator color={C.orange} size="small" />
                ) : (
                  <Text style={styles.modalSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexGrow: 0 }}
            >
              {/* Name */}
              {aiParsing ? (
                <View style={styles.group}>
                  <Text style={styles.fieldLabel}>GENIE IS EXTRACTING NAME...</Text>
                  <SkeletonPulse style={{ height: 56, borderRadius: 16, width: '100%' }} />
                </View>
              ) : (
                <AnimatedInput
                  label="Full Name"
                  value={draft.name}
                  onChangeText={v => setDraft(p => ({ ...p, name: v }))}
                  placeholder="Your name"
                  labelBgColor={colors.bg.elevated}
                />
              )}

              {/* Company Name (Employers Only) */}
              {isEmployer && (
                aiParsing ? (
                  <View style={styles.group}>
                    <Text style={styles.fieldLabel}>GENIE IS EXTRACTING COMPANY...</Text>
                    <SkeletonPulse style={{ height: 56, borderRadius: 16, width: '100%' }} />
                  </View>
                ) : (
                  <AnimatedInput
                    label="Company Name"
                    value={draft.companyName}
                    onChangeText={v => setDraft(p => ({ ...p, companyName: v }))}
                    placeholder="e.g. Jinni Technologies"
                    labelBgColor={colors.bg.elevated}
                  />
                )
              )}

              {/* Role */}
              {aiParsing ? (
                <View style={styles.group}>
                  <Text style={styles.fieldLabel}>GENIE IS EXTRACTING ROLE...</Text>
                  <SkeletonPulse style={{ height: 56, borderRadius: 16, width: '100%' }} />
                </View>
              ) : (
                <AnimatedInput
                  label="Current Role"
                  value={draft.role}
                  onChangeText={v => setDraft(p => ({ ...p, role: v }))}
                  placeholder="e.g. UX Designer"
                  labelBgColor={colors.bg.elevated}
                />
              )}

              {/* About */}
              {aiParsing ? (
                <View style={styles.group}>
                  <Text style={styles.fieldLabel}>GENIE IS EXTRACTING BIO...</Text>
                  <SkeletonPulse style={{ height: 110, borderRadius: 16, width: '100%' }} />
                </View>
              ) : (
                <>
                  <AnimatedInput
                    label="About You"
                    value={draft.about}
                    onChangeText={v => setDraft(p => ({ ...p, about: v }))}
                    placeholder="Tell recruiters about yourself..."
                    multiline={true}
                    showsVerticalScrollIndicator={true}
                    labelBgColor={colors.bg.elevated}
                  />
                  {!isEmployer && !cvUrl && (
                    <Text style={{ fontSize: 11, color: (draft.about || '').trim().length >= 500 ? colors.status.success : colors.status.error, textAlign: 'right', marginTop: -8, marginBottom: 12 }}>
                      {(draft.about || '').trim().length} / 500 characters minimum
                    </Text>
                  )}
                </>
              )}

              {/* Job Type */}
              <View style={styles.group}>
                <Text style={styles.fieldLabel}>I'M LOOKING FOR</Text>
                <View style={styles.pillRow}>
                  {JOB_TYPES.map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typePill, 
                        { backgroundColor: colors.bg.card, borderColor: colors.border.light },
                        draft.jobType === type && styles.typePillActive
                      ]}
                      onPress={() => setDraft(p => ({ ...p, jobType: type }))}
                    >
                      <Text style={[
                        styles.typePillText,
                        { color: colors.text.secondary },
                        draft.jobType === type && styles.typePillActiveText
                      ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category selector — seekers only */}
              {!isEmployer && (
                <View style={styles.group}>
                  <Text style={styles.fieldLabel}>PROFESSIONAL CATEGORY</Text>
                  <Animated.View style={[styles.pillRow, aiParsing && animatedPulseStyle]}>
                    {CATEGORIES.map((cat) => {
                      const selected = draft.category === cat.name;
                      return (
                        <TouchableOpacity
                          key={cat.name}
                          style={[
                            styles.categoryPill, 
                            { backgroundColor: colors.bg.card, borderColor: colors.border.light },
                            selected && styles.categoryPillActive
                          ]}
                          onPress={() => setDraft(prev => ({ ...prev, category: cat.name }))}
                          disabled={aiParsing}
                          activeOpacity={0.8}
                        >
                          <Feather name={cat.icon} size={15} color={selected ? C.orange : colors.text.hint} style={{ marginRight: 4 }} />
                          <Text style={[
                            styles.categoryText, 
                            { color: colors.text.secondary },
                            selected && styles.categoryTextActive, 
                            aiParsing && { color: C.orange }
                          ]}>
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </Animated.View>
                </View>
              )}

              {/* Skills */}
              {!isEmployer && (
                <View style={styles.group}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.fieldLabel}>MY SKILLS</Text>
                    <Text style={[styles.fieldLabel, { color: C.orange }]}>
                      {aiParsing ? "Genie matching skills..." : `${draft.skills.length} selected`}
                    </Text>
                  </View>

                  <View style={[styles.skillInputContainer, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
                    <TextInput
                      style={[styles.skillTextInput, { color: colors.text.primary }]}
                      placeholder="e.g. Python, Figma, Copywriting"
                      placeholderTextColor={colors.text.hint}
                      value={skillInput}
                      onChangeText={setSkillInput}
                      onSubmitEditing={handleAddDraftSkill}
                      editable={!aiParsing}
                      autoCorrect={false}
                    />
                    <TouchableOpacity style={styles.addSkillBtn} onPress={handleAddDraftSkill} disabled={aiParsing}>
                      <Text style={styles.addSkillBtnText}>Add</Text>
                    </TouchableOpacity>
                  </View>

                  <Animated.View style={[styles.pillRow, aiParsing && animatedPulseStyle, { marginTop: 4 }]}>
                    {draft.skills.length > 0 ? (
                      draft.skills.map((skill) => (
                        <View key={skill} style={styles.skillTag}>
                          <Text style={styles.skillTagText}>{skill}</Text>
                          <TouchableOpacity onPress={() => removeDraftSkill(skill)} disabled={aiParsing}>
                            <Feather name="x" size={12} color={C.orange} style={{ paddingLeft: 4 }} />
                          </TouchableOpacity>
                        </View>
                      ))
                    ) : (
                      <Text style={{ fontSize: 13, color: colors.text.hint, fontStyle: 'italic', paddingLeft: 4 }}>
                        No skills added yet. Type above to add, or auto-fill via CV.
                      </Text>
                    )}
                  </Animated.View>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── CV Changes Review Modal ── */}
      <Modal visible={showCvReview} transparent animationType="none" statusBarTranslucent={true}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeCvReview}>
          <Animated.View style={[styles.sheetBg, reviewBgStyle]} />
        </Pressable>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[styles.reviewSheet, { backgroundColor: colors.bg.elevated }, reviewSheetStyle]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border.medium }]} />

            <View style={styles.reviewHeader}>
              <View style={styles.reviewHeaderLeft}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,107,44,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="star" size={18} color={C.orange} />
                </View>
                <View>
                  <Text style={[styles.reviewTitle, { color: colors.text.primary }]}>Profile Update</Text>
                  <Text style={styles.reviewSub}>Genie extracted these from your CV</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeCvReview}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.muted }}>Skip</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={true}>
              {cvChanges && [
                { key: 'name', label: 'Full Name', icon: 'user', current: draft.name, suggested: cvChanges.name },
                { key: 'role', label: 'Professional Title', icon: 'briefcase', current: draft.role, suggested: cvChanges.role },
                { key: 'about', label: 'About You', icon: 'file-text', current: draft.about, suggested: cvChanges.about },
                { key: 'category', label: 'Category', icon: 'tag', current: draft.category, suggested: cvChanges.category },
                { key: 'skills', label: 'Skills', icon: 'zap', current: draft.skills?.join(', '), suggested: cvChanges.skills?.join(', ') },
              ].filter(f => f.suggested && f.suggested !== f.current).map((field, idx) => {
                const accepted = acceptedFields[field.key];
                const hasChanged = field.suggested !== field.current;
                return (
                  <TouchableOpacity
                    key={field.key}
                    activeOpacity={0.85}
                    onPress={() => toggleField(field.key)}
                    style={[
                      styles.reviewCard,
                      { backgroundColor: colors.bg.card, borderColor: colors.border.light },
                      accepted && styles.reviewCardActive,
                      !hasChanged && { opacity: 0.5 },
                    ]}
                  >
                    <View style={[styles.reviewToggle, accepted && styles.reviewToggleActive]}>
                      {accepted && <Feather name="check" size={12} color="#fff" />}
                    </View>

                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name={field.icon} size={14} color={C.muted} />
                        <Text style={styles.reviewFieldLabel}>{field.label}</Text>
                      </View>

                      {field.current ? (
                        <Text style={styles.reviewOldValue}>{field.current}</Text>
                      ) : null}

                      <Text style={[styles.reviewNewValue, { color: colors.text.primary }, accepted && { color: '#06b6d4' }]}>
                        {field.suggested}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <View style={{ gap: 10, marginTop: 8 }}>
                <TouchableOpacity onPress={applyCvChanges} activeOpacity={0.85}>
                  <LinearGradient colors={['#06b6d4', '#0891b2']} style={styles.reviewAcceptBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={styles.reviewAcceptText}>Accept Selected & Save</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (cvChanges) {
                      setDraft(prev => ({
                        ...prev,
                        ...(acceptedFields.name && cvChanges.name ? { name: cvChanges.name } : {}),
                        ...(acceptedFields.role && cvChanges.role ? { role: cvChanges.role } : {}),
                        ...(acceptedFields.about && cvChanges.about ? { about: cvChanges.about } : {}),
                        ...(acceptedFields.skills && cvChanges.skills ? { skills: cvChanges.skills } : {}),
                        ...(acceptedFields.category && cvChanges.category ? { category: cvChanges.category } : {}),
                      }));
                    }
                    closeCvReview();
                    setTimeout(() => setEditing(true), 400); // Wait for cvReview modal to close then open edit modal
                  }}
                  activeOpacity={0.85}
                  style={styles.reviewEditBtn}
                >
                  <Feather name="edit-2" size={14} color="#0891b2" />
                  <Text style={styles.reviewEditText}>Review & Edit Manually</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 20,
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    fontSize: 16,
    fontWeight: '700',
  },
  
  // Profile Form Group
  group: { gap: 8, marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 40,
    borderWidth: 1.5,
  },
  typePillActive: { backgroundColor: C.orange, borderColor: C.orange },
  typePillText: { fontSize: 13, fontWeight: '600' },
  typePillActiveText: { color: '#fff' },

  categoryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 15, paddingVertical: 9, borderRadius: 40,
    borderWidth: 1.5,
  },
  categoryPillActive: { backgroundColor: 'rgba(255,107,44,0.08)', borderColor: C.orange },
  categoryText: { fontSize: 13, fontWeight: '600' },
  categoryTextActive: { color: C.orange, fontWeight: '700' },

  skillInputContainer: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 2,
  },
  skillTextInput: { flex: 1, paddingVertical: 11, paddingHorizontal: 8, fontSize: 15 },
  addSkillBtn: { backgroundColor: C.orange, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addSkillBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  skillTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,107,44,0.08)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,107,44,0.15)',
  },
  skillTagText: { fontSize: 12, fontWeight: '600', color: C.orange },
  saveCta: { borderRadius: 18, paddingVertical: 17, alignItems: 'center' },
  saveCtaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // CV Row
  cvEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14,
  },
  cvFileName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#065F46' },
  cvReplaceBtn: { backgroundColor: '#FFF0E8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cvReplaceText: { fontSize: 12, fontWeight: '700', color: C.orange },
  cvDeleteBtnEdit: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  cvPickBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16,
    borderWidth: 1.5, borderStyle: 'dashed', paddingHorizontal: 18, paddingVertical: 16,
  },
  cvPickText:  { fontSize: 14, fontWeight: '600' },
  cvPickSub:   { fontSize: 11, marginTop: 2 },
  cvPickArrow: { fontSize: 18, fontWeight: '700', color: C.orange },

  // Edit Modal styling
  sheetBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingBottom: 40, maxHeight: SCREEN_H * 0.85, shadowColor: C.night, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 24 },
  dragZone: { width: '100%', alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.1)' },
  modalScroll: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 48, gap: 22 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalCancel: { fontSize: 15, fontWeight: '600', color: C.muted },
  modalTitle:  { fontSize: 17, fontWeight: '800' },
  modalSave:   { fontSize: 15, fontWeight: '700', color: C.orange },

  reviewSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: SCREEN_H * 0.88, shadowColor: C.night, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 24 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 16 },
  reviewHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  reviewSub: { fontSize: 11, fontWeight: '500', color: C.muted, marginTop: 1 },
  reviewCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, padding: 16, borderWidth: 1.5 },
  reviewCardActive: { borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.05)' },
  reviewToggle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  reviewToggleActive: { backgroundColor: '#06b6d4', borderColor: '#06b6d4' },
  reviewFieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewOldValue: { fontSize: 13, color: '#9CA3AF', textDecorationLine: 'line-through', fontStyle: 'italic' },
  reviewNewValue: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  reviewAcceptBtn: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  reviewAcceptText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  reviewEditBtn: { borderRadius: 18, paddingVertical: 15, alignItems: 'center', backgroundColor: 'rgba(6,182,212,0.08)', borderWidth: 1.5, borderColor: 'rgba(6,182,212,0.2)', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  reviewEditText: { fontSize: 14, fontWeight: '700', color: '#06b6d4' },
});

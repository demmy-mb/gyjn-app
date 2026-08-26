import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Pressable
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sentry from '@sentry/react-native';
import { usePostHog } from 'posthog-react-native';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import { getBackendUrl } from '../lib/config';

// Base64 to ArrayBuffer decoder for React Native uploads
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

function decodeBase64(base64) {
  let bufferLength = base64.length * 0.75;
  const len = base64.length;
  let p = 0;
  let val1, val2, val3, val4;

  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
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

const ALL_SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'React Native', 'Next.js',
  'Node.js', 'Python', 'SQL', 'Figma', 'UI/UX Design',
  'Product Management', 'Data Analysis', 'AWS', 'Docker', 'Git',
  'Swift', 'Kotlin', 'Go', 'GraphQL', 'Firebase',
];

const CATEGORIES = [
  { name: 'Tech & Software', emoji: '💻' },
  { name: 'Design & Creative', emoji: '🎨' },
  { name: 'Product & Project', emoji: '📊' },
  { name: 'Data & Analytics', emoji: '📈' },
  { name: 'Marketing & Sales', emoji: '✍️' },
  { name: 'Business & Operations', emoji: '⚙️' },
  { name: 'Finance & Accounting', emoji: '💰' },
  { name: 'Human Resources', emoji: '👥' },
  { name: 'Supply Chain & Logistics', emoji: '📦' },
  { name: 'Other', emoji: '💼' }
];

import { NativeModules } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring } from 'react-native-reanimated';

export default function LoginScreen({ navigation, route }) {
  const posthog = usePostHog();
  const [name, setName]               = useState('');
  const [role, setRole]               = useState('');
  const [companyName, setCompanyName] = useState('');
  const [aboutMe, setAboutMe]         = useState('');
  const [jobType, setJobType]         = useState('Full-time');
  const [searchTarget, setSearchTarget] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [category, setCategory]       = useState('Tech & Software');
  const [skillInput, setSkillInput]   = useState('');
  const [cvUrl, setCvUrl]             = useState(null);
  const [cvName, setCvName]           = useState(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [aiParsing, setAiParsing]     = useState(false);

  const pulseOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: buttonScale.value }],
    };
  });

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    buttonScale.value = withSpring(0.96, { damping: 10, stiffness: 400 });
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1, { damping: 10, stiffness: 400 });
  };

  React.useEffect(() => {
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

  const jobTypes = ['Full-time', 'Part-time', 'Contract', 'Internship'];
  const isEmployer = route.params?.role === 'employer';

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !selectedSkills.includes(trimmed)) {
      setSelectedSkills(prev => [...prev, trimmed]);
    }
    setSkillInput('');
  };

  const removeSkill = (skillToRemove) => {
    setSelectedSkills(prev => prev.filter(s => s !== skillToRemove));
  };

  const pickAndUploadCV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setCvUploading(true);

      // Read local file as base64 and decode to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'base64',
      });
      const arrayBuffer = decodeBase64(base64);

      // Upload to Supabase Storage
      const filename = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(filename, arrayBuffer, { contentType: file.mimeType, upsert: true });

      if (uploadError) {
        Alert.alert('Upload Failed', uploadError.message);
        setCvUploading(false);
        return;
      }

      // Get public URL
      const { data } = supabase.storage.from('cvs').getPublicUrl(filename);
      setCvUrl(data.publicUrl);
      setCvName(file.name);
      setCvUploading(false);
      posthog.capture('cv_uploaded', { file_type: file.mimeType, is_employer: isEmployer });

      // Trigger AI parsing in the background
      setAiParsing(true);
      try {
        const response = await fetch(`${getBackendUrl()}/api/parse-cv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cvUrl: data.publicUrl }),
        });

        if (!response.ok) throw new Error('CV Parsing failed');
        const parseData = await response.json();

        if (parseData.success && parseData.profile) {
          const { name: parsedName, role: parsedRole, aboutMe: parsedAbout, skills: parsedSkills, category: parsedCategory } = parseData.profile;
          
          // Stop the "reading" pulse animation immediately
          setAiParsing(false);

          const typeText = (fullText, setter, delay = 25) => {
            return new Promise((resolve) => {
              if (!fullText) return resolve();
              const parts = fullText.split(/(\s+)/);
              let i = -1;
              let currentString = '';
              const interval = setInterval(() => {
                i++;
                if (i < parts.length) {
                  currentString += parts[i];
                  setter(currentString);
                } else {
                  clearInterval(interval);
                  resolve();
                }
              }, delay);
            });
          };

          // Sequence the animations asynchronously so it doesn't block
          (async () => {
            if (parsedCategory) setCategory(parsedCategory);
            
            if (parsedName) await typeText(parsedName, setName, 20);
            if (parsedRole) await typeText(parsedRole, setRole, 20);
            if (parsedAbout) await typeText(parsedAbout, setAboutMe, 20);
            
            if (Array.isArray(parsedSkills)) {
              for (const skill of parsedSkills) {
                setSelectedSkills(prev => {
                  if (!prev.includes(skill)) return [...prev, skill];
                  return prev;
                });
                await new Promise(r => setTimeout(r, 80));
              }
            }

            Alert.alert('Genie Auto-Filled! ✨', 'Your profile details have been magically extracted from your CV.');
          })();
          
          return; // Skip the finally block since we already stopped aiParsing
        }
      } catch (parseErr) {
        console.warn('CV Auto-fill failed:', parseErr);
        Alert.alert(
          'Auto-fill Unavailable',
          'Genie was unable to parse your CV automatically, but your file has been uploaded. Please fill in your profile details manually.'
        );
        setAiParsing(false);
      }
    } catch (err) {
      Alert.alert('Error', `Could not pick file: ${err?.message || err}`);
      setCvUploading(false);
      setAiParsing(false);
    }
  };

  const navigateToMain = async (overrideName) => {
    const resolvedName = overrideName || name.trim();
    if (!resolvedName) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Not Authenticated', 'You must be logged in to save your profile.');
        return;
      }
      
      const profile = {
        id:            user.id,
        user_name:     resolvedName,
        user_role:     role.trim() || (isEmployer ? 'Employer' : 'Professional'),
        job_type:      jobType,
        about_me:      aboutMe,
        search_target: searchTarget,
        skills:        selectedSkills.length > 0 ? selectedSkills : ['JavaScript', 'React', 'Figma'],
        cv_url:        cvUrl ?? null,
        category:      isEmployer ? null : category,
        ...(isEmployer && { company_name: companyName.trim() })
      };

      const tableName = isEmployer ? 'employer_profiles' : 'seeker_profiles';
      const { error } = await supabase
        .from(tableName)
        .upsert(profile);

      if (error) {
        Alert.alert('Error saving profile', error.message);
        return;
      }

      Sentry.setUser({ id: user.id, email: user.email, role: isEmployer ? 'employer' : 'seeker' });

      // Identify user and track profile creation in PostHog
      posthog.identify(user.id, {
        $set: { user_type: isEmployer ? 'employer' : 'seeker', job_type: jobType, category: isEmployer ? null : category },
        $set_once: { profile_created_date: new Date().toISOString() },
      });
      posthog.capture('profile_created', {
        user_type: isEmployer ? 'employer' : 'seeker',
        has_cv: Boolean(cvUrl),
        skills_count: profile.skills.length,
        job_type: jobType,
      });

      navigation.reset({
        index: 0,
        routes: [{
          name: 'Main',
          params: { ...profile, userType: isEmployer ? 'employer' : 'seeker' }
        }],
      });
    } catch (err) {
      Alert.alert('Error', err.message || JSON.stringify(err));
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter your name to continue.');
      return;
    }
    
    if (!isEmployer && !cvUrl) {
      const aboutLen = (aboutMe || '').trim().length;
      if (aboutLen < 500) {
        Alert.alert(
          'More Context Required',
          `Since you haven't uploaded a CV, your 'About You' section must be at least 500 characters (currently ${aboutLen}/500) so our AI has enough details about your background to match you.`
        );
        return;
      }
      
      Alert.alert(
        '⚠️ Heads up!',
        'Without a CV, our matching algorithm has less information to work with. Your match scores may be lower than candidates with a full profile.',
        [
          { text: 'Upload CV', style: 'cancel', onPress: pickAndUploadCV },
          { text: 'Continue anyway', style: 'default', onPress: () => navigateToMain() }
        ]
      );
    } else {
      navigateToMain();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <Text style={styles.title}>
            {isEmployer ? "Find elite talent\nin 10 seconds." : "Make a wish.\nGet your job."}
          </Text>
          <Text style={styles.subtitle}>
            {isEmployer ? "No long recruitment cycles." : "Your profile in 10 seconds. Or upload a CV to auto-fill!"}
          </Text>

          {/* Seekers Magic CV Auto-Fill Banner */}
          {!isEmployer && (
            <TouchableOpacity 
              style={styles.magicBanner} 
              onPress={pickAndUploadCV}
              disabled={cvUploading || aiParsing}
              activeOpacity={0.8}
            >
              <LinearGradient 
                colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.6)']} 
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.magicBannerInner}>
                <View style={styles.magicIconBox}>
                  <Text style={styles.magicIcon}>📄✨</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.magicTitle}>Magic CV Auto-Fill</Text>
                  <Text style={styles.magicDesc} numberOfLines={2} ellipsizeMode="tail">
                    {aiParsing 
                      ? "🧞‍♂️ Genie is reading your CV..." 
                      : cvUploading 
                      ? "Uploading file..." 
                      : cvUrl 
                      ? `CV Loaded: ${cvName}`
                      : "Upload your CV to instantly populate your profile details."}
                  </Text>
                  {(cvUploading || aiParsing) && (
                    <Animated.View style={[styles.loadingBar, animatedPulseStyle]} />
                  )}
                </View>
                <LinearGradient colors={[C.orange, C.mango]} style={styles.magicArrowBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Text style={styles.magicArrow}>➔</Text>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          )}

          {/* Full Name */}
          <View style={styles.group}>
            <Text style={styles.label}>FULL NAME</Text>
            <Animated.View style={aiParsing && animatedPulseStyle}>
              <TextInput
                style={[styles.input, aiParsing && { backgroundColor: '#FFF5EE', borderColor: C.orange }]}
                placeholder={aiParsing ? "Genie is extracting name..." : "e.g. Jordan Lee"}
                placeholderTextColor={aiParsing ? C.orange : "#ABABAB"}
                value={name}
                onChangeText={setName}
                autoCorrect={false}
                editable={!aiParsing}
              />
            </Animated.View>
          </View>

          {/* Role */}
          <View style={styles.group}>
            <Text style={styles.label}>YOUR ROLE</Text>
            <Animated.View style={aiParsing && animatedPulseStyle}>
              <TextInput
                style={[styles.input, aiParsing && { backgroundColor: '#FFF5EE', borderColor: C.orange }]}
                placeholder={aiParsing ? "Genie is extracting role..." : (isEmployer ? "e.g. Lead Recruiter" : "e.g. UX Designer")}
                placeholderTextColor={aiParsing ? C.orange : "#ABABAB"}
                value={role}
                onChangeText={setRole}
                autoCorrect={false}
                editable={!aiParsing}
              />
            </Animated.View>
          </View>

          {/* Company Name (Employers only) */}
          {isEmployer && (
            <View style={styles.group}>
              <Text style={styles.label}>COMPANY NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Jinni Technologies"
                placeholderTextColor="#ABABAB"
                value={companyName}
                onChangeText={setCompanyName}
                autoCorrect={false}
              />
            </View>
          )}

          {/* About */}
          <View style={styles.group}>
            <Text style={styles.label}>ABOUT {isEmployer ? "COMPANY" : "YOU"}</Text>
            <Animated.View style={aiParsing && animatedPulseStyle}>
              <TextInput
                style={[styles.input, styles.textArea, aiParsing && { backgroundColor: '#FFF5EE', borderColor: C.orange }]}
                placeholder={aiParsing ? "Genie is extracting bio..." : (isEmployer ? "Briefly describe your company..." : "Tell us a bit about yourself...")}
                placeholderTextColor={aiParsing ? C.orange : "#ABABAB"}
                value={aboutMe}
                onChangeText={setAboutMe}
                multiline
                numberOfLines={3}
                editable={!aiParsing}
              />
            </Animated.View>
            {!isEmployer && !cvUrl && (
              <Text style={{ fontSize: 11, color: (aboutMe || '').trim().length >= 500 ? C.green : C.red, textAlign: 'right', marginTop: 4 }}>
                {(aboutMe || '').trim().length} / 500 characters minimum
              </Text>
            )}
          </View>

          {/* Job type (seekers) / Search target (employers) */}
          {isEmployer ? (
            <View style={styles.group}>
              <Text style={styles.label}>WHAT DO YOU WANT TO FIND?</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Senior Frontend Engineer"
                placeholderTextColor="#ABABAB"
                value={searchTarget}
                onChangeText={setSearchTarget}
              />
            </View>
          ) : (
            <View style={styles.group}>
              <Text style={styles.label}>I'M LOOKING FOR</Text>
              <View style={styles.pillRow}>
                {jobTypes.map((type) => {
                  const isActive = jobType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={isActive ? styles.typePillActiveContainer : styles.typePill}
                      onPress={() => setJobType(type)}
                      activeOpacity={0.8}
                    >
                      {isActive ? (
                        <LinearGradient colors={[C.orange, C.mango]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.typePillActive}>
                          <Text style={[styles.typePillText, styles.typePillTextActive]}>
                            {type}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <Text style={styles.typePillText}>
                          {type}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Category Selector — seekers only */}
          {!isEmployer && (
            <View style={styles.group}>
              <Text style={styles.label}>PROFESSIONAL CATEGORY</Text>
              <Animated.View style={[styles.pillRow, aiParsing && animatedPulseStyle]}>
                {CATEGORIES.map((cat) => {
                  const selected = category === cat.name;
                  return (
                    <TouchableOpacity
                      key={cat.name}
                      style={[styles.categoryPill, selected && styles.categoryPillActive]}
                      onPress={() => setCategory(cat.name)}
                      disabled={aiParsing}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                      <Text style={[styles.categoryText, selected && styles.categoryTextActive, aiParsing && { color: C.orange }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            </View>
          )}

          {/* Skills section — seekers only */}
          {!isEmployer && (
            <View style={styles.group}>
              <View style={styles.skillsHeader}>
                <Text style={styles.label}>MY SKILLS</Text>
                <Text style={styles.skillsCount}>
                  {aiParsing ? "Genie is matching skills..." : `${selectedSkills.length} selected`}
                </Text>
              </View>

              {/* Skill Input Row */}
              <View style={styles.skillInputContainer}>
                <TextInput
                  style={styles.skillTextInput}
                  placeholder="e.g. Python, Figma, Copywriting"
                  placeholderTextColor="#ABABAB"
                  value={skillInput}
                  onChangeText={setSkillInput}
                  onSubmitEditing={handleAddSkill}
                  editable={!aiParsing}
                  autoCorrect={false}
                />
                <TouchableOpacity 
                  style={styles.addSkillBtn} 
                  onPress={handleAddSkill}
                  disabled={aiParsing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addSkillBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Dynamic Skills Tag Cloud */}
              <Animated.View style={[styles.pillRow, aiParsing && animatedPulseStyle, { marginTop: 4 }]}>
                {selectedSkills.length > 0 ? (
                  selectedSkills.map((skill) => (
                    <View key={skill} style={styles.skillTag}>
                      <Text style={styles.skillTagText}>{skill}</Text>
                      <TouchableOpacity onPress={() => removeSkill(skill)} disabled={aiParsing}>
                        <Text style={styles.skillTagDelete}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={{ fontSize: 13, color: '#ABABAB', fontStyle: 'italic', paddingLeft: 4 }}>
                    No skills added yet. Type above to add, or auto-fill via CV.
                  </Text>
                )}
              </Animated.View>
            </View>
          )}

          {/* CV Upload — seekers only */}
          {!isEmployer && (
            <View style={styles.group}>
              <Text style={styles.label}>CV / RESUME</Text>
              <TouchableOpacity
                style={[styles.cvBox, cvUrl && !aiParsing && styles.cvBoxDone]}
                onPress={pickAndUploadCV}
                disabled={cvUploading || aiParsing}
                activeOpacity={0.8}
              >
                {cvUploading ? (
                  <>
                    <ActivityIndicator color={C.orange} size="small" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cvUploadText}>Uploading CV...</Text>
                      <Text style={styles.cvSubText}>Sending file to storage</Text>
                    </View>
                  </>
                ) : aiParsing ? (
                  <>
                    <ActivityIndicator color={C.orange} size="small" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cvUploadText}>🧞‍♂️ Genie is reading your CV...</Text>
                      <Text style={styles.cvSubText}>Auto-filling your profile details</Text>
                    </View>
                  </>
                ) : cvUrl ? (
                  <>
                    <Text style={styles.cvIcon}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cvDoneText} numberOfLines={1}>{cvName}</Text>
                      <Text style={styles.cvSubText}>Tap to replace</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.cvIcon}>📄</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cvUploadText}>Upload your CV</Text>
                      <Text style={styles.cvSubText}>PDF or Word — optional but recommended</Text>
                    </View>
                    <Text style={styles.cvArrow}>↑</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* CTA */}
          <Pressable 
            onPress={handleSubmit} 
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <Animated.View style={buttonAnimatedStyle}>
              <LinearGradient colors={[C.orange, C.mango]} style={styles.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.ctaText}>Let's Go ✨</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  scroll: { paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40, gap: 20 },
  backBtn: {
    width: 40, height: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
    elevation: 3,
  },
  backArrow: { fontSize: 22, color: C.night, textAlign: 'center', lineHeight: 22, marginTop: -2, marginLeft: -2 },
  title: { fontSize: 30, fontWeight: '800', color: C.night, lineHeight: 38 },
  subtitle: { fontSize: 14, color: C.hint, marginTop: -8 },
  group: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.8 },
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
  textArea: { height: 110, textAlignVertical: 'top', paddingTop: 16, paddingHorizontal: 20, borderColor: 'rgba(0,0,0,0.08)' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  typePill: {
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 40, borderWidth: 1,
    borderColor: '#E2E2E2',
    backgroundColor: '#fff',
  },
  typePillActiveContainer: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  typePillActive: { 
    paddingHorizontal: 19, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  typePillText: { fontSize: 13, fontWeight: '600', color: '#7A7A7A' },
  typePillTextActive: { color: '#fff', fontWeight: '800' },

  // Skills
  skillsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skillsCount: { fontSize: 11, fontWeight: '600', color: C.orange },
  skillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 40, borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
    backgroundColor: '#fff',
  },
  skillPillActive: { backgroundColor: 'rgba(255,107,44,0.08)', borderColor: C.orange },
  skillCheck: { fontSize: 11, color: C.orange, fontWeight: '800' },
  skillPillText: { fontSize: 13, fontWeight: '600', color: C.muted },
  skillPillTextActive: { color: C.orange, fontWeight: '700' },

  // Professional Category selection
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#fff',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(255,107,44,0.08)',
    borderColor: C.orange,
  },
  categoryEmoji: { fontSize: 15 },
  categoryText: { fontSize: 13, fontWeight: '600', color: C.muted },
  categoryTextActive: { color: C.orange, fontWeight: '700' },

  // Skill Input & Dynamic Tag Cloud
  skillInputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  skillTextInput: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 8,
    fontSize: 15,
    color: '#1A1A1A',
  },
  addSkillBtn: {
    backgroundColor: C.orange,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addSkillBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  skillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,107,44,0.08)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,107,44,0.15)',
  },
  skillTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.orange,
  },
  skillTagDelete: {
    fontSize: 11,
    fontWeight: '700',
    color: C.orange,
    paddingLeft: 2,
  },

  cta: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  dividerText: { fontSize: 12, color: C.hint },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.05)', paddingVertical: 15,
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  socialIcon: { fontSize: 16, fontWeight: '900', color: '#4285F4' },
  socialText: { fontSize: 14, fontWeight: '600', color: C.night },

  // CV upload
  cvBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16, borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    borderStyle: 'dashed',
    paddingHorizontal: 18, paddingVertical: 16,
    minHeight: 60,
  },
  cvBoxDone: {
    borderColor: '#10b981', borderStyle: 'solid',
    backgroundColor: '#ECFDF5',
  },
  cvIcon: { fontSize: 22 },
  cvUploadText: { fontSize: 14, fontWeight: '600', color: C.night },
  cvDoneText:   { fontSize: 13, fontWeight: '700', color: '#059669' },
  cvSubText:    { fontSize: 11, color: C.hint, marginTop: 2 },
  cvArrow:      { fontSize: 18, fontWeight: '700', color: C.orange },
  magicBanner: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    marginVertical: 4,
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  magicBannerInner: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  magicIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  magicIcon: {
    fontSize: 22,
  },
  magicTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.night,
  },
  magicDesc: {
    fontSize: 13,
    color: '#333333',
    fontWeight: '500',
    lineHeight: 18,
  },
  loadingBar: {
    height: 3,
    backgroundColor: C.orange,
    borderRadius: 2,
    marginTop: 4,
    width: '40%',
  },
  magicArrowBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.orange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  magicArrow: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '800',
  },
});

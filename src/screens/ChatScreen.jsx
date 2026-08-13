import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Modal, StatusBar, Keyboard,
  Animated as RNAnimated, Pressable, Dimensions,
  LayoutAnimation, UIManager,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Reanimated, { SlideInRight, SlideInLeft, FadeInUp } from 'react-native-reanimated';

import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import CustomDateTimePicker from '../components/CustomDateTimePicker';
import { BlurView } from 'expo-blur';
import BounceButton from '../components/BounceButton';
import { supabase } from '../lib/supabase';
import { C } from '../lib/theme';
import { useTheme } from '../lib/ThemeProvider';

const C_COMPAT = { ...C, border: '#EBEBEB', lightBg: '#F7F7FA' };

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const SCREEN_WIDTH = Dimensions.get('window').width;

/* ─── Typing Indicator Dots Animation ─── */
function TypingDots() {
  const dot1 = useRef(new RNAnimated.Value(0)).current;
  const dot2 = useRef(new RNAnimated.Value(0)).current;
  const dot3 = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const animate = (dot, delay) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(delay),
          RNAnimated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          RNAnimated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (dot) => ({
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.muted,
    marginHorizontal: 2,
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
    opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
  });

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingBubble}>
        <RNAnimated.View style={dotStyle(dot1)} />
        <RNAnimated.View style={dotStyle(dot2)} />
        <RNAnimated.View style={dotStyle(dot3)} />
      </View>
    </View>
  );
}

const MessageItem = React.memo(({ 
  item, 
  userType, 
  repliedMsg, 
  isLatestOwnMsg, 
  recipientName, 
  lastTapRefs, 
  onEditMessage, 
  onLongPress, 
  onSwipeReply,
  renderLeftActions,
  renderRightActions,
  swipeableRef
}) => {
  if (item.sender_type === 'system') {
    return (
      <Reanimated.View entering={FadeInUp.duration(300)} style={styles.systemMsgRow}>
        <View style={styles.systemMsgBubble}>
          <Text style={styles.systemMsgText}>{item.text}</Text>
        </View>
      </Reanimated.View>
    );
  }

  const isMine = item.sender_type === userType || (userType === 'seeker' && item.sender_type === 'candidate');

  const bubble = (
    <Reanimated.View 
      entering={FadeInUp.duration(250)}
      style={{ width: '100%', marginBottom: (isMine && isLatestOwnMsg) ? 14 : 0 }}
    >
      <Pressable
        onPress={() => {
          const now = Date.now();
          const lastTap = lastTapRefs.current[item.id] || 0;
          if (now - lastTap < 300) {
            if (isMine) {
              onEditMessage(item);
            }
          }
          lastTapRefs.current[item.id] = now;
        }}
        onLongPress={(evt) => onLongPress(item, evt)}
        delayLongPress={400}
        style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}
      >
        <View
          style={[
            styles.msgBubble,
            isMine ? styles.msgBubbleRight : styles.msgBubbleLeft,
          ]}
        >
          {repliedMsg && (
            <View style={[
              styles.replyQuote,
              isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs,
            ]}>
              <Text style={[styles.replyQuoteSender, isMine && { color: 'rgba(255,255,255,0.8)' }]}>
                {repliedMsg.sender_type === userType || (userType === 'seeker' && repliedMsg.sender_type === 'candidate') ? 'You' : recipientName}
              </Text>
              <Text
                style={[styles.replyQuoteText, isMine && { color: 'rgba(255,255,255,0.7)' }]}
                numberOfLines={2}
              >
                {repliedMsg.text}
              </Text>
            </View>
          )}

          <Text style={[styles.msgText, isMine ? styles.msgTextRight : styles.msgTextLeft]}>
            {item.text}
          </Text>
          <Text style={[styles.msgTime, isMine ? styles.msgTimeRight : styles.msgTimeLeft]}>
            {item.is_edited && <Text style={{ fontStyle: 'italic' }}>(edited) </Text>}
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>
      </Pressable>
      {isMine && isLatestOwnMsg && (
        <Text style={{ fontSize: 10, color: C.muted, position: 'absolute', bottom: -12, right: 8, fontWeight: '500' }}>
          {item.status === 'seen' ? 'Seen' : item.status === 'delivered' ? 'Delivered' : 'Sent'}
        </Text>
      )}
    </Reanimated.View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={!isMine ? renderLeftActions : undefined}
      renderRightActions={isMine ? renderRightActions : undefined}
      onSwipeableLeftWillOpen={!isMine ? () => onSwipeReply(item) : undefined}
      onSwipeableRightWillOpen={isMine ? () => onSwipeReply(item) : undefined}
      overshootLeft={!isMine}
      overshootRight={isMine}
      friction={2}
      overshootFriction={8}
      leftThreshold={60}
      rightThreshold={60}
    >
      {bubble}
    </Swipeable>
  );
});

export default function ChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { match, userName, userType: rawUserType } = route.params || {};
  const userType = rawUserType === 'candidate' ? 'seeker' : rawUserType;
  const isEmployer = userType === 'employer';
  const matchId = match?.match_id;

  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const swipeableRefs = useRef({});
  const isInitialLayout = useRef(true);
  const inputRef = useRef(null);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);

  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.nativeEvent.pageY;
    touchStartX.current = e.nativeEvent.pageX;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const deltaY = touchStartY.current - e.nativeEvent.pageY;
    const deltaX = Math.abs(e.nativeEvent.pageX - touchStartX.current);
    // Focus the input if swiped up by more than 20 pixels, and it's mostly a vertical motion
    if (deltaY > 20 && deltaX < 50) {
      inputRef.current?.focus();
    }
  }, []);

  // Core state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Reply state
  const [replyTo, setReplyTo] = useState(null);
  const replyBarAnim = useRef(new RNAnimated.Value(0)).current;

  // Edit state
  const [editingMsg, setEditingMsg] = useState(null);
  const editBarAnim = useRef(new RNAnimated.Value(0)).current;
  const lastTapRefs = useRef({});

  // Long-press context menu
  const [menuMsg, setMenuMsg] = useState(null); // the message being acted on
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  // Typing indicators
  const [remoteIsTyping, setRemoteIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const lastTypingBroadcast = useRef(0);
  const channelRef = useRef(null);

  // Call scheduling (employer only)
  const [callDate, setCallDate] = useState(match?.call_date || null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  const parseCallDate = useCallback((dateString) => {
    if (!dateString) return new Date();
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? new Date() : d;
  }, []);

  const displayCallDate = useMemo(() => {
    if (!callDate) return 'No call scheduled yet';
    const d = new Date(callDate);
    if (isNaN(d.getTime())) return callDate;
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }, [callDate]);

  // Determine names
  const jobTitle = match?.jobs?.role ?? 'Role';
  const companyName = match?.jobs?.company ?? 'Company';
  const candidateName = match?.candidate_name ?? 'Candidate';
  const recipientName = isEmployer ? candidateName : companyName;

  // Quick lookup for reply references
  const msgMap = useMemo(() => {
    const map = {};
    messages.forEach((m) => { map[m.id] = m; });
    return map;
  }, [messages]);

  const latestOwnMsgId = useMemo(() => {
    const ownMsgs = messages.filter(m => m.sender_type === userType || (userType === 'seeker' && m.sender_type === 'candidate'));
    return ownMsgs.length > 0 ? ownMsgs[ownMsgs.length - 1].id : null;
  }, [messages, userType]);

  // ── Fetch messages ──
  const fetchMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data ?? []);

      // Mark unread received messages as seen
      const unreadIds = (data ?? [])
        .filter(m => (m.sender_type !== userType && !(userType === 'seeker' && m.sender_type === 'candidate')) && m.status !== 'seen')
        .map(m => m.id);
      
      if (unreadIds.length > 0) {
        supabase.from('messages').update({ status: 'seen' }).in('id', unreadIds).then();
      }
    } catch (err) {
      console.warn('[ChatScreen] fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  // ── Realtime: postgres_changes + broadcast typing ──
  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`room:${matchId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages((prev) => {
          if (prev.some((msg) => msg.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        const isRemote = payload.new.sender_type !== userType && !(userType === 'seeker' && payload.new.sender_type === 'candidate');
        if (isRemote) {
          setRemoteIsTyping(false);
          supabase.from('messages').update({ status: 'seen' }).eq('id', payload.new.id).then();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages((prev) => prev.map((msg) => msg.id === payload.new.id ? payload.new : msg));
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const isRemote = payload?.sender !== userType && !(userType === 'seeker' && payload?.sender === 'candidate');
        if (isRemote) {
          setRemoteIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setRemoteIsTyping(false);
          }, 3000);
        }
      })
      .subscribe();

    channelRef.current = channel;

    // Fetch fresh call date
    supabase.from('matches').select('call_date').eq('match_id', matchId).single()
      .then(({ data }) => { if (data?.call_date) setCallDate(data.call_date); });

    return () => {
      supabase.removeChannel(channel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [matchId, fetchMessages, userType]);

  // Debounced scroll-to-bottom helper — prevents multiple competing scroll calls
  const scrollTimer = useRef(null);
  const scrollToBottom = useCallback((animated = true) => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 80);
  }, []);

  // Auto scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // Android: smoothly animate keyboard height since KAV is unreliable
  const androidKeyboardAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      RNAnimated.spring(androidKeyboardAnim, {
        toValue: e.endCoordinates.height,
        useNativeDriver: false,
        tension: 180,
        friction: 24,
      }).start();
      scrollToBottom();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      RNAnimated.spring(androidKeyboardAnim, {
        toValue: 0,
        useNativeDriver: false,
        tension: 180,
        friction: 24,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [scrollToBottom]);

  // Keyboard scroll listener (iOS)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = Keyboard.addListener('keyboardWillShow', () => {
      scrollToBottom();
    });
    return () => sub.remove();
  }, [scrollToBottom]);

  // Auto scroll to show remote user's typing dots
  useEffect(() => {
    if (remoteIsTyping && messages.length > 0) {
      scrollToBottom();
    }
  }, [remoteIsTyping, messages.length, scrollToBottom]);

  // Animate reply bar slide up
  useEffect(() => {
    if (replyTo) {
      replyBarAnim.setValue(40);
      RNAnimated.spring(replyBarAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }).start();
    }
  }, [replyTo]);

  // Animate edit bar slide up
  useEffect(() => {
    if (editingMsg) {
      editBarAnim.setValue(40);
      RNAnimated.spring(editBarAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }).start();
    }
  }, [editingMsg]);

  // Animated dismiss for reply bar
  const dismissReply = useCallback(() => {
    RNAnimated.timing(replyBarAnim, {
      toValue: 40,
      duration: 120,
      useNativeDriver: true,
    }).start(() => setReplyTo(null));
  }, [replyBarAnim]);

  // Animated dismiss for edit bar
  const dismissEdit = useCallback(() => {
    RNAnimated.timing(editBarAnim, {
      toValue: 40,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setEditingMsg(null);
      setInputText('');
    });
  }, [editBarAnim]);

  // ── Broadcast typing (throttled 2s) ──
  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingBroadcast.current < 2000) return;
    lastTypingBroadcast.current = now;
    channelRef.current?.send({
      type: 'broadcast', event: 'typing',
      payload: { sender: userType },
    });
  }, [userType]);

  const handleTextChange = useCallback((text) => {
    setInputText(text);
    if (text.trim().length > 0) broadcastTyping();
  }, [broadcastTyping]);

  // ── Send message ──
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const typedText = inputText.trim();
    
    if (editingMsg) {
      setSending(true);
      // Optimistic update
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages((prev) => prev.map((msg) => msg.id === editingMsg.id ? { ...msg, text: typedText } : msg));
      setInputText('');
      setEditingMsg(null);
      
      try {
        const { error } = await supabase.from('messages').update({ text: typedText }).eq('id', editingMsg.id);
        if (error) throw error;
      } catch (err) {
        Alert.alert('Edit failed', err.message);
        // Revert on fail
        setMessages((prev) => prev.map((msg) => msg.id === editingMsg.id ? { ...msg, text: editingMsg.text } : msg));
        setInputText(typedText);
        setEditingMsg(editingMsg);
      } finally {
        setSending(false);
      }
      return;
    }

    const replyId = replyTo?.id || null;
    setInputText('');
    setReplyTo(null);
    setSending(true);

    const newId = generateUUID();
    const optimisticMsg = {
      id: newId,
      match_id: matchId,
      sender_type: userType,
      text: typedText,
      reply_to: replyId,
      created_at: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const payload = { id: newId, match_id: matchId, sender_type: userType, text: typedText };
      if (replyId) payload.reply_to = replyId;

      const { data, error } = await supabase.from('messages').insert(payload).select();
      if (error) throw error;
      if (data?.[0]) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMessages((prev) => prev.map((msg) => (msg.id === optimisticMsg.id ? data[0] : msg)));
      }
    } catch (err) {
      Alert.alert('Send failed', err.message);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMsg.id));
      setInputText(typedText);
    } finally {
      setSending(false);
    }
  };

  // ── Delete message ──
  const handleDeleteMessage = async (msgId) => {
    setMenuMsg(null);
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // Optimistic remove
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMessages((prev) => prev.filter((m) => m.id !== msgId));
          try {
            const { error } = await supabase.from('messages').delete().eq('id', msgId);
            if (error) throw error;
          } catch (err) {
            Alert.alert('Delete failed', err.message);
            fetchMessages(); // Re-fetch to restore
          }
        },
      },
    ]);
  };

  // ── Schedule call (employer only) ──
  const handleScheduleConfirm = async (finalDate) => {
    setShowDatePicker(false);
    const isoString = finalDate.toISOString();

    try {
      const { error: matchError } = await supabase
        .from('matches').update({ call_date: isoString }).eq('match_id', matchId);
      if (matchError) throw matchError;
      setCallDate(isoString);

      const formattedNotice = finalDate.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });

      await supabase.from('messages').insert({
        match_id: matchId, sender_type: 'system',
        text: `Call scheduled for ${formattedNotice}`,
      });
    } catch (err) {
      Alert.alert('Scheduling failed', err.message);
    }
  };

  // ── Swipe-to-reply ──
  const handleSwipeReply = useCallback((msg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setReplyTo({ id: msg.id, text: msg.text, sender_type: msg.sender_type });
    swipeableRefs.current[msg.id]?.close();
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
  }, []);

  const renderLeftActions = useCallback((progress, dragX) => {
    const scale = dragX.interpolate({
      inputRange: [0, 20, 60, 100],
      outputRange: [0.3, 0.5, 1, 1],
      extrapolate: 'clamp',
    });
    const opacity = dragX.interpolate({
      inputRange: [0, 20, 60, 100],
      outputRange: [0, 0.3, 1, 1],
      extrapolate: 'clamp',
    });
    const rotate = dragX.interpolate({
      inputRange: [0, 60],
      outputRange: ['-45deg', '0deg'],
      extrapolate: 'clamp',
    });
    return (
      <View style={{
        width: 60,
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 8,
      }}>
        <RNAnimated.View style={{
          transform: [{ scale }, { rotate }],
          opacity,
          backgroundColor: 'rgba(255, 107, 44, 0.12)',
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Feather name="corner-up-left" size={16} color={C.orange} style={{ marginTop: -2 }} />
        </RNAnimated.View>
      </View>
    );
  }, []);

  const renderRightActions = useCallback((progress, dragX) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -60, -20, 0],
      outputRange: [1, 1, 0.5, 0.3],
      extrapolate: 'clamp',
    });
    const opacity = dragX.interpolate({
      inputRange: [-100, -60, -20, 0],
      outputRange: [1, 1, 0.3, 0],
      extrapolate: 'clamp',
    });
    const rotate = dragX.interpolate({
      inputRange: [-60, 0],
      outputRange: ['0deg', '45deg'],
      extrapolate: 'clamp',
    });
    return (
      <View style={{
        width: 60,
        justifyContent: 'center',
        alignItems: 'center',
        paddingRight: 8,
      }}>
        <RNAnimated.View style={{
          transform: [{ scale }, { rotate }],
          opacity,
          backgroundColor: 'rgba(255, 107, 44, 0.12)',
          width: 36,
          height: 36,
          borderRadius: 18,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Feather name="corner-up-left" size={16} color={C.orange} style={{ marginTop: -2 }} />
        </RNAnimated.View>
      </View>
    );
  }, []);

  // ── Long-press handler ──
  const handleLongPress = useCallback((msg, evt) => {
    // Don't allow long-press on system messages
    if (msg.sender_type === 'system') return;
    const { pageY } = evt.nativeEvent;
    setMenuMsg(msg);
    setMenuPos({ x: SCREEN_WIDTH / 2, y: pageY });
  }, []);

  const handleEditMessage = useCallback((item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setEditingMsg(item);
    setInputText(item.text);
    inputRef.current?.focus();
  }, []);

  // ── Render message bubble ──
  const renderMessageItem = useCallback(({ item }) => {
    return (
      <MessageItem
        item={item}
        userType={userType}
        repliedMsg={item.reply_to ? msgMap[item.reply_to] : null}
        isLatestOwnMsg={item.id === latestOwnMsgId}
        recipientName={recipientName}
        lastTapRefs={lastTapRefs}
        onEditMessage={handleEditMessage}
        onLongPress={handleLongPress}
        onSwipeReply={handleSwipeReply}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        swipeableRef={(ref) => { swipeableRefs.current[item.id] = ref; }}
      />
    );
  }, [userType, msgMap, latestOwnMsgId, recipientName, handleEditMessage, handleLongPress, handleSwipeReply, renderLeftActions, renderRightActions]);

  const GlassBackground = Platform.OS === 'ios' ? BlurView : View;

  const Wrapper = Platform.OS === 'ios' ? KeyboardAvoidingView : View;
  const wrapperProps = Platform.OS === 'ios' 
    ? { behavior: 'padding', keyboardVerticalOffset: headerHeight }
    : {};

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <Wrapper
        style={[styles.container, { backgroundColor: colors.bg.primary }]}
        {...wrapperProps}
      >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Top Glass Area: Header + Call Bar */}
      <GlassBackground 
        intensity={isDark ? 30 : 85} 
        tint={isDark ? "dark" : "light"} 
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)') : colors.bg.card }}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), paddingLeft: Math.max(insets.left, 24), paddingRight: Math.max(insets.right, 24), backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
          <BounceButton onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={colors.text.primary} />
          </BounceButton>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]} numberOfLines={1}>{recipientName}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]} numberOfLines={1}>{jobTitle}</Text>
          </View>
          {callDate ? (
            <BounceButton onPress={() => {
              Alert.alert('Call Scheduled', `You have a call scheduled for ${displayCallDate}`);
            }} style={styles.backBtn}>
              <Feather name="calendar" size={20} color={C.orange} />
            </BounceButton>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>
      </GlassBackground>



      {/* Messages Feed */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingTop: headerHeight || insets.top + 100, paddingBottom: 16 }]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={20}
          onLayout={() => {
            if (messages.length > 0) {
              if (isInitialLayout.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
                isInitialLayout.current = false;
              }
            }
          }}
          onContentSizeChange={() => {
            if (messages.length > 0 && !isInitialLayout.current) {
              scrollToBottom();
            }
          }}
        />
      )}
      
      {/* Typing indicator (Moved outside scroll area) */}
      {remoteIsTyping && <TypingDots />}

      {/* Bottom Glass Area: Reply/Edit + Input Bar */}
      <RNAnimated.View style={{ width: '100%', paddingBottom: Platform.OS === 'android' ? androidKeyboardAnim : 0 }}>
        {/* Reply Preview Bar */}
        {replyTo && !editingMsg && (
          <RNAnimated.View style={{ transform: [{ translateY: replyBarAnim }], opacity: replyBarAnim.interpolate({ inputRange: [0, 40], outputRange: [1, 0] }) }}>
            <GlassBackground intensity={isDark ? 30 : 85} tint={isDark ? "dark" : "light"} style={[styles.replyBar, { backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)') : colors.bg.card }]}>
              <View style={styles.replyBarAccent} />
              <View style={styles.replyBarContent}>
                <Text style={[styles.replyBarSender, { color: colors.text.secondary }]}>
                   Replying to {replyTo.sender_type === userType || (userType === 'seeker' && replyTo.sender_type === 'candidate') ? 'yourself' : recipientName}
                </Text>
                <Text style={[styles.replyBarText, { color: colors.text.primary }]} numberOfLines={1}>{replyTo.text}</Text>
              </View>
              <BounceButton onPress={dismissReply} style={[styles.replyBarClose, { backgroundColor: colors.bg.secondary }]}>
                <Text style={[styles.replyBarCloseText, { color: colors.text.primary }]}>✕</Text>
              </BounceButton>
            </GlassBackground>
          </RNAnimated.View>
        )}

        {/* Edit Preview Bar */}
        {editingMsg && (
          <RNAnimated.View style={{ transform: [{ translateY: editBarAnim }], opacity: editBarAnim.interpolate({ inputRange: [0, 40], outputRange: [1, 0] }) }}>
            <GlassBackground intensity={isDark ? 30 : 85} tint={isDark ? "dark" : "light"} style={[styles.replyBar, { backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)') : colors.bg.card }]}>
              <View style={[styles.replyBarAccent, { backgroundColor: C.orange }]} />
              <View style={styles.replyBarContent}>
                <Text style={[styles.replyBarSender, { color: C.orange }]}>Editing Message</Text>
                <Text style={[styles.replyBarText, { color: colors.text.primary }]} numberOfLines={1}>{editingMsg.text}</Text>
              </View>
              <BounceButton onPress={dismissEdit} style={[styles.replyBarClose, { backgroundColor: colors.bg.secondary }]}>
                <Text style={[styles.replyBarCloseText, { color: colors.text.primary }]}>✕</Text>
              </BounceButton>
            </GlassBackground>
          </RNAnimated.View>
        )}

        {/* Footer Input Bar */}
        <GlassBackground
          intensity={isDark ? 30 : 85} tint={isDark ? "dark" : "light"}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={[styles.inputBar, { paddingBottom: 16, paddingLeft: Math.max(insets.left, 20), paddingRight: Math.max(insets.right, 20), backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)') : colors.bg.card }]}
        >
          {isEmployer && (
            <BounceButton
              style={[styles.scheduleIconBtn, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light }]}
              onPress={() => { setTempDate(parseCallDate(callDate)); setShowDatePicker(true); }}
            >
              <Feather name="calendar" size={18} color={colors.text.primary} />
            </BounceButton>
          )}

          <TextInput
            ref={inputRef}
            style={[styles.textInput, { backgroundColor: colors.bg.secondary, borderColor: colors.border.light, color: colors.text.primary }]}
            placeholder={editingMsg ? 'Editing message...' : replyTo ? 'Type your reply...' : 'Type your message...'}
            placeholderTextColor={colors.text.hint}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxHeight={100}
          />

          <BounceButton
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>Send</Text>}
          </BounceButton>
        </GlassBackground>
      </RNAnimated.View>

      {/* ── Long-press Context Menu Modal ── */}
      <Modal
        visible={!!menuMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMsg(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuMsg(null)}>
          <View style={[styles.menuCard, {
            top: Math.min(menuPos.y - 60, Dimensions.get('window').height - 200),
          }]}>
            {/* Reply */}
            <BounceButton
              style={styles.menuItem}
              onPress={() => {
                setReplyTo({ id: menuMsg.id, text: menuMsg.text, sender_type: menuMsg.sender_type });
                setMenuMsg(null);
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
              }}
            >
              <Feather name="corner-up-left" size={18} color={C.night} />
              <Text style={styles.menuItemText}>Reply</Text>
            </BounceButton>

            {/* Delete — only for own messages */}
             {((menuMsg?.sender_type === userType) || (userType === 'seeker' && menuMsg?.sender_type === 'candidate')) && (
              <BounceButton
                style={styles.menuItem}
                onPress={() => handleDeleteMessage(menuMsg.id)}
              >
                <Feather name="trash-2" size={18} color="#EF4444" />
                <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Delete</Text>
              </BounceButton>
            )}

            {/* Cancel */}
            <BounceButton
              style={[styles.menuItem, { borderBottomWidth: 0 }]}
              onPress={() => setMenuMsg(null)}
            >
              <Feather name="x" size={18} color={C.muted} />
              <Text style={[styles.menuItemText, { color: C.muted }]}>Cancel</Text>
            </BounceButton>
          </View>
        </Pressable>
      </Modal>

      {/* Schedule Call Pickers — employer only */}
      {isEmployer && (
        <CustomDateTimePicker
          visible={showDatePicker}
          initialDate={tempDate}
          onClose={() => setShowDatePicker(false)}
          onConfirm={handleScheduleConfirm}
        />
      )}
      </Wrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  backBtnText: { fontSize: 20, fontWeight: '800', color: C.orange, marginTop: -2 },
  headerInfo: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.night },
  headerSubtitle: { fontSize: 11, color: C.orange, fontWeight: '600', marginTop: 1 },

  // Call Bar
  callBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)',
    shadowColor: C.night, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.015, shadowRadius: 4, elevation: 1,
  },
  callBarInfo: { flex: 1, gap: 2 },
  callBarLabel: { fontSize: 9, fontWeight: '800', color: C.muted, letterSpacing: 0.6 },
  callBarValue: { fontSize: 13, fontWeight: '700', color: C.night },
  callBarBtn: { backgroundColor: C.orange, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  callBarBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Messages
  listContent: { paddingHorizontal: 24, paddingVertical: 16, gap: 6 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Bubbles
  msgRow: { flexDirection: 'row', width: '100%', marginVertical: 3 },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  msgBubble: {
    maxWidth: '75%', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, gap: 4,
    shadowColor: C.night, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02, shadowRadius: 4, elevation: 1,
  },
  msgBubbleLeft: {
    backgroundColor: '#fff', borderTopLeftRadius: 4,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)',
  },
  msgBubbleRight: { backgroundColor: C.orange, borderTopRightRadius: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextLeft: { color: C.night },
  msgTextRight: { color: '#fff' },
  msgTime: { fontSize: 8, alignSelf: 'flex-end', marginTop: 2 },
  msgTimeLeft: { color: C.hint },
  msgTimeRight: { color: 'rgba(255,255,255,0.7)' },

  // Reply quote inside bubble
  replyQuote: {
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6,
    borderLeftWidth: 4,
    borderTopRightRadius: 8, borderBottomRightRadius: 8,
    borderTopLeftRadius: 2, borderBottomLeftRadius: 2,
  },
  replyQuoteMine: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: 'rgba(255,255,255,0.6)' },
  replyQuoteTheirs: { backgroundColor: 'rgba(0,0,0,0.05)', borderLeftColor: C.orange },
  replyQuoteSender: { fontSize: 11, fontWeight: '800', color: C.orange, marginBottom: 2 },
  replyQuoteText: { fontSize: 13, color: C.muted, lineHeight: 18 },

  // System messages
  systemMsgRow: { flexDirection: 'row', justifyContent: 'center', width: '100%', marginVertical: 4 },
  systemMsgBubble: {
    backgroundColor: 'rgba(26,26,46,0.05)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(26,26,46,0.03)',
  },
  systemMsgText: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center' },

  // Swipe action
  swipeAction: { width: 60, justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
  swipeActionText: { fontSize: 20 },
  swipeActionLabel: { fontSize: 9, fontWeight: '700', color: C.muted, marginTop: 2 },

  // Typing indicator
  typingRow: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)',
  },

  // Reply preview bar
  replyBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
  },
  replyBarAccent: {
    width: 4, height: '100%', minHeight: 36,
    backgroundColor: C.orange, borderRadius: 2, marginRight: 12,
  },
  replyBarContent: { flex: 1 },
  replyBarSender: { fontSize: 12, fontWeight: '800', color: C.orange, marginBottom: 2 },
  replyBarText: { fontSize: 13, color: C.muted, lineHeight: 18 },
  replyBarClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.lightBg, alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  replyBarCloseText: { fontSize: 14, fontWeight: '700', color: C.muted },

  // Input Bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', gap: 8,
  },
  scheduleIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center',
  },
  scheduleIcon: { fontSize: 18 },
  textInput: {
    flex: 1, backgroundColor: C.lightBg, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    fontSize: 14, color: C.night, maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: C.orange, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.peach },
  sendBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Long-press context menu ──
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menuCard: {
    position: 'absolute',
    left: 40, right: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: C.night,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  menuItemIcon: { fontSize: 18 },
  menuItemText: { fontSize: 15, fontWeight: '700', color: C.night },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 28, padding: 24,
    width: '100%', maxWidth: 340, gap: 16,
    shadowColor: C.night, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: C.night },
  modalDesc: { fontSize: 13, color: C.muted, lineHeight: 18 },
  modalInput: {
    backgroundColor: C.lightBg, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: C.night, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.03)',
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: C.lightBg },
  modalBtnCancelText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  modalBtnConfirm: { backgroundColor: C.orange },
  modalBtnConfirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

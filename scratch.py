import re

file_path = 'src/screens/SettingsScreen.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the state setup for showSubModal
state_search = "  const [showSubModal, setShowSubModal] = useState(false);"
state_replace = """  const [showSubModal, setShowSubModal] = useState(false);
  const subTranslateY = useSharedValue(SCREEN_H);

  const closeSubModal = useCallback(() => {
    subTranslateY.value = withTiming(SCREEN_H, { duration: 250 }, (finished) => {
      if (finished) {
        runOnJS(setShowSubModal)(false);
      }
    });
  }, [subTranslateY]);

  useEffect(() => {
    if (showSubModal) {
      subTranslateY.value = SCREEN_H;
      subTranslateY.value = withTiming(0, { duration: 200 });
    }
  }, [showSubModal, subTranslateY]);

  const subBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(subTranslateY.value, [0, SCREEN_H * 0.5], [1, 0], 'clamp');
    return { opacity };
  });

  const subSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: subTranslateY.value }],
  }));

  const subPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        subTranslateY.value = gestureState.dy;
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 120 || gestureState.vy > 0.5) {
        closeSubModal();
      } else {
        subTranslateY.value = withTiming(0, { duration: 250 });
      }
    }
  }), [subTranslateY, closeSubModal]);"""

content = content.replace(state_search, state_replace, 1)

# 2. Update the modal render block
modal_search = """      {/* ?? Manage Subscription Modal ?? */}
      <Modal visible={showSubModal} transparent animationType="slide" statusBarTranslucent={true}>
        <View style={[styles.sheetBg, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSubModal(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.bg.elevated, maxHeight: SCREEN_H * 0.9 }]}>
            <View style={styles.dragZone}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border.medium }]} />
            </View>"""
modal_replace = """      {/* ?? Manage Subscription Modal ?? */}
      <Modal visible={showSubModal} transparent animationType="none" statusBarTranslucent={true} onRequestClose={closeSubModal}>
        <Animated.View style={[styles.sheetBg, { backgroundColor: 'rgba(0,0,0,0.6)' }, subBgStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSubModal} />
          <Animated.View style={[styles.sheet, { backgroundColor: colors.bg.elevated, maxHeight: SCREEN_H * 0.9 }, subSheetStyle]}>
            <View style={styles.dragZone} {...subPanResponder.panHandlers}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border.medium }]} />
            </View>"""

content = content.replace(modal_search, modal_replace, 1)

# Update setShowSubModal(false) occurrences in the modal to closeSubModal()
content = content.replace("onPress={() => setShowSubModal(false)}", "onPress={closeSubModal}")
content = content.replace("setShowSubModal(false);\n                      navigation.navigate('Premium');", "closeSubModal();\n                      navigation.navigate('Premium');")

# 3. Enhance the ACTIVE/CANCELLED badge inside SettingsScreen
badge_search = """                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.brand.orange, fontSize: 16, fontWeight: '800' }}>Jinni Premium</Text>
                      <View style={{ backgroundColor: isCancelled ? '#EF4444' : '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>
                          {isCancelled ? 'CANCELLED' : 'ACTIVE'}
                        </Text>
                      </View>
                    </View>"""

badge_replace = """                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: colors.brand.orange, fontSize: 16, fontWeight: '800' }}>Jinni Premium</Text>
                      <View style={{
                        backgroundColor: isCancelled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        borderWidth: 1,
                        borderColor: isCancelled ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 12,
                      }}>
                        <Text style={{ color: isCancelled ? '#EF4444' : '#10B981', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
                          {isCancelled ? 'CANCELLED' : 'ACTIVE'}
                        </Text>
                      </View>
                    </View>"""
content = content.replace(badge_search, badge_replace, 1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated SettingsScreen.jsx")

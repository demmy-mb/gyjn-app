import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Platform, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeIn, SlideInRight, SlideOutLeft, SlideInLeft, SlideOutRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/ThemeProvider';
import { usePostHog } from 'posthog-react-native';
import BounceButton from '../components/BounceButton';
import { supabase } from '../lib/supabase';
import { PaystackProvider, usePaystack } from 'react-native-paystack-webview';
const { width: SCREEN_W } = Dimensions.get('window');

const TIERS = [
  {
    id: 'yearly',
    title: 'Yearly',
    price: '₦15,000/year',
    rawPrice: 15000,
    originalPrice: '₦30,000/year',
    subtitle: 'Pay Once, Save 50%',
    badge: 'For You 50% OFF',
    planCode: 'PLN_acbf252j2azbehj'
  },
  {
    id: 'monthly',
    title: 'Monthly',
    price: '₦2,500/month',
    rawPrice: 2500,
    originalPrice: null,
    subtitle: 'Flexible subscription',
    badge: null,
    planCode: 'PLN_svuxon2v4wvjvh4'
  }
];

const FEATURES = [
  { id: 1, icon: 'zap', title: 'Better AI Matchmaking', desc: 'Get matched with top roles faster with advanced algorithms.' },
  { id: 2, icon: 'sliders', title: 'Customisation Features', desc: 'Personalise your profile to stand out from the crowd.' },
  { id: 3, icon: 'trending-up', title: 'Priority Placement', desc: 'Push your profile higher in the employer dashboard.' },
];

export default function PremiumScreen({ navigation }) {
  return (
    <PaystackProvider
      publicKey="pk_test_2dc3373a7c7640091159f65cc14306a605a54189"
      currency="NGN"
    >
      <PremiumScreenContent navigation={navigation} />
    </PaystackProvider>
  );
}

function PremiumScreenContent({ navigation }) {
  const posthog = usePostHog();
  const { colors, typography, radii, shadows, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { popup } = usePaystack();
  const [viewState, setViewState] = useState('intro'); // 'intro' | 'plans'
  const [selectedTier, setSelectedTier] = useState('yearly');
  const [animDirection, setAnimDirection] = useState(1);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  }, []);

  const selectedData = TIERS.find(t => t.id === selectedTier);

  // Track premium screen view on mount
  React.useEffect(() => {
    posthog.capture('premium_viewed');
  }, [posthog]);

  const goToPlans = () => {
    setAnimDirection(1);
    setViewState('plans');
  };

  const goBackToIntro = () => {
    setAnimDirection(-1);
    setViewState('intro');
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const enteringAnim = animDirection === 1 ? SlideInRight.springify() : SlideInLeft.springify();
  const exitingAnim = animDirection === 1 ? SlideOutLeft : SlideOutRight;

  const renderIntroContent = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={[styles.stepContainer, { paddingBottom: 150 }]}>
      <Animated.View entering={FadeInUp.duration(400).springify()}>
        <Text style={[styles.title, { color: colors.text.primary, marginTop: 20 }]}>
          Unlock Jinni Premium
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Supercharge your career journey with exclusive tools designed to get you hired faster.
        </Text>
      </Animated.View>

      <View style={styles.featuresList}>
        {FEATURES.map((feature, index) => (
          <Animated.View 
            key={feature.id} 
            entering={FadeInUp.delay(150 + index * 100).duration(400).springify()}
            style={[styles.featureCard, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}
          >
            <View style={[styles.featureIconBox, { backgroundColor: 'rgba(255,107,44,0.1)' }]}>
              <Feather name={feature.icon} size={24} color={colors.brand.orange} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: colors.text.primary }]}>{feature.title}</Text>
              <Text style={[styles.featureDesc, { color: colors.text.secondary }]}>{feature.desc}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );

  const renderPlansContent = () => (
    <Animated.View entering={enteringAnim} exiting={exitingAnim} style={[styles.stepContainer, { paddingBottom: 180 }]}>
      <Animated.View entering={FadeInUp.duration(400).springify()}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Choose Your Plan
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Cancel anytime. No hidden fees.
        </Text>
      </Animated.View>

      <View style={[styles.tiersContainer, { marginTop: 40 }]}>
        {TIERS.map((tier, index) => {
          const isSelected = selectedTier === tier.id;
          return (
            <Animated.View key={tier.id} entering={FadeInUp.delay(100 + index * 100).duration(400).springify()}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedTier(tier.id)}
                style={[
                  styles.tierCard,
                  { 
                    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderColor: isSelected ? colors.brand.orange : (isDark ? '#2C2C2E' : '#E5E5EA'),
                    borderWidth: isSelected ? 2 : 1,
                  },
                  !isSelected && !isDark && styles.shadow
                ]}
              >
                {/* Badge */}
                {tier.badge && (
                  <View style={[styles.badge, { backgroundColor: colors.brand.orange }]}>
                    <Text style={styles.badgeText}>{tier.badge}</Text>
                  </View>
                )}

                <View style={styles.tierContent}>
                  <View style={styles.radioContainer}>
                    <View style={[
                      styles.radioOuter, 
                      { borderColor: isSelected ? colors.brand.orange : (isDark ? '#48484A' : '#C7C7CC') }
                    ]}>
                      {isSelected && <View style={[styles.radioInner, { backgroundColor: colors.brand.orange }]} />}
                    </View>
                  </View>

                  <View style={styles.tierMain}>
                    <View style={styles.tierRow}>
                      <Text style={[styles.tierTitle, { color: colors.text.primary }]}>{tier.title}</Text>
                      <Text style={[styles.tierPrice, { color: colors.text.primary }]}>{tier.price}</Text>
                    </View>
                    
                    <View style={styles.tierRow}>
                      <Text style={[styles.tierSubtitle, { color: colors.text.hint }]}>{tier.subtitle}</Text>
                      {tier.originalPrice && (
                        <Text style={[styles.tierOriginalPrice, { color: colors.text.hint }]}>{tier.originalPrice}</Text>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <Animated.View entering={FadeIn.delay(400)}>
        <TouchableOpacity style={styles.restoreBtn}>
          <Text style={[styles.restoreText, { color: colors.text.hint }]}>Restore Purchase</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );

  const handlePaystackCheckout = () => {
    const reference = `jinni_${selectedTier}_${Date.now()}`;
    posthog.capture('premium_purchase_initiated', {
      plan_id: selectedTier,
      plan_price: selectedData?.price,
      is_discounted: Boolean(selectedData?.badge),
    });
    popup.checkout({
      email: userEmail || 'user@example.com',
      amount: selectedData.rawPrice, // The library internally multiplies this by 100
      reference,
      plan: selectedData.planCode, // Link it to your Paystack subscription plan
      metadata: {
        plan_id: selectedTier,
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: selectedTier },
        ],
      },
      onCancel: (e) => {
        Alert.alert('Payment Cancelled', 'Your payment was not completed.');
      },
      onSuccess: async (res) => {
        try {
          // Verify payment server-side via Supabase Edge Function
          const { data, error } = await supabase.functions.invoke('verify-paystack', {
            body: { reference: res.transactionRef || res.reference || reference },
          });

          if (error) throw error;

          if (data?.verified) {
            posthog.capture('premium_purchased_success', {
              plan_id: selectedTier,
              amount: selectedData.rawPrice,
              reference: data.reference,
            });
            Alert.alert('🎉 Welcome to Premium!', 'Your payment was successful. Enjoy your new features!', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } else {
            Alert.alert('Payment Issue', 'We could not verify your payment. Please contact support.');
          }
        } catch (err) {
          console.error('Payment verification error:', err);
          Alert.alert('Verification Error', 'Payment was received but verification failed. Please contact support with your reference.');
        }
      }
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerLeft}>
          {viewState === 'plans' && (
            <TouchableOpacity onPress={goBackToIntro} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
              <View style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <Feather name="arrow-left" size={20} color={colors.text.primary} />
              </View>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
            <View style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
              <Feather name="x" size={20} color={colors.text.primary} />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {viewState === 'intro' ? renderIntroContent() : renderPlansContent()}
      </ScrollView>

      {/* Sticky Bottom Actions outside ScrollView */}
      {viewState === 'intro' ? (
        <View style={[styles.bottomAction, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)', paddingBottom: insets.bottom || 24 }]}>
          <BounceButton onPress={goToPlans}>
            <LinearGradient colors={[colors.brand.orange, colors.brand.mango]} style={styles.primaryBtn} start={{x:0, y:0}} end={{x:1, y:1}}>
              <Text style={[typography.button, { color: '#fff' }]}>View Plans</Text>
            </LinearGradient>
          </BounceButton>
        </View>
      ) : (
        <View style={[styles.bottomAction, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)', paddingBottom: insets.bottom || 24 }]}>
          <View style={styles.bottomPriceRow}>
            {selectedData.originalPrice && (
              <Text style={[styles.bottomOldPrice, { color: colors.text.hint }]}>{selectedData.originalPrice}</Text>
            )}
            <Text style={[styles.bottomNewPrice, { color: colors.text.primary }]}>
              {selectedData.price} {selectedData.badge ? '(50% OFF)' : ''}
            </Text>
          </View>
          <BounceButton
            style={[styles.continueBtn, { backgroundColor: colors.brand.orange }]}
            onPress={handlePaystackCheckout}
          >
            <Text style={styles.continueTitle}>Continue</Text>
            <Text style={styles.continueSubtitle}>Cancel Anytime</Text>
          </BounceButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    alignItems: 'flex-start',
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 10,
  },
  stepContainer: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 10,
    marginBottom: 32,
  },
  featuresList: {
    gap: 16,
    marginBottom: 32,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  featureIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiersContainer: {
    gap: 16,
    marginBottom: 32,
  },
  tierCard: {
    borderRadius: 20,
    padding: 20,
    position: 'relative',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  badge: {
    position: 'absolute',
    top: -12,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 2,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tierContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioContainer: {
    marginRight: 16,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tierMain: {
    flex: 1,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tierTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  tierPrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  tierSubtitle: {
    fontSize: 14,
  },
  tierOriginalPrice: {
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  restoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  bottomPriceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  bottomOldPrice: {
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  bottomNewPrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  continueBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  continueSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
});

/**
 * ─── Jinni Design System — Animation Presets ─────────────────────────────────
 *
 * All animation configs for react-native-reanimated.
 * No more ad-hoc spring/timing values scattered across screens.
 *
 * Usage:
 *   import { springs, timings, staggerEntrance, breathe } from '../lib/animations';
 *
 *   scale.value = withSpring(1, springs.snappy);
 *   opacity.value = withTiming(1, timings.quick);
 */

import {
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

// ─── Spring Presets ──────────────────────────────────────────────────────────
// Each preset has a distinct physical "feel" that maps to an interaction type.

export const springs = {
  /** Quick, responsive — button presses, tab switches */
  snappy: { damping: 22, stiffness: 280, mass: 0.8 },

  /** Smooth, natural — card transitions, layout shifts */
  gentle: { damping: 24, stiffness: 160, mass: 1 },

  /** Lively but controlled — success celebrations, match animation */
  bouncy: { damping: 16, stiffness: 340, mass: 0.7 },

  /** Weighted, deliberate — bottom sheets, modals */
  heavy: { damping: 28, stiffness: 220, mass: 0.5 },

  /** Slight overshoot — pull-to-refresh, rubber-band */
  elastic: { damping: 14, stiffness: 180, mass: 1.1 },
};

// ─── Timing Presets ──────────────────────────────────────────────────────────

export const timings = {
  /** Opacity flashes, micro-states */
  instant: { duration: 100, easing: Easing.out(Easing.cubic) },

  /** Tab pill slide, color transitions */
  quick: { duration: 150, easing: Easing.out(Easing.cubic) },

  /** Screen transitions, sheet dismiss */
  normal: { duration: 250, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },

  /** Card swipe-out, leaving animations */
  smooth: { duration: 350, easing: Easing.inOut(Easing.cubic) },

  /** Splash fade-in, hero entrance */
  slow: { duration: 500, easing: Easing.out(Easing.cubic) },

  /** Pulse loops, breathing animations */
  dramatic: { duration: 800, easing: Easing.inOut(Easing.quad) },
};

// ─── Choreography Helpers ────────────────────────────────────────────────────

/**
 * Stagger entrance — returns a delay value for a child at `index`.
 * Used with withDelay() to create staggered list animations.
 *
 * @param {number} index - Child index (0-based)
 * @param {number} baseDelay - Delay between each child (ms)
 * @returns {number} Total delay for this child
 *
 * Example:
 *   // In a useEffect for each item:
 *   opacity.value = withDelay(
 *     staggerDelay(index),
 *     withTiming(1, timings.quick)
 *   );
 */
export function staggerDelay(index, baseDelay = 60) {
  return index * baseDelay;
}

/**
 * Animate a shared value with a staggered entrance (fade + slide up).
 *
 * @param {SharedValue} opacityValue - Shared value for opacity
 * @param {SharedValue} translateYValue - Shared value for translateY
 * @param {number} index - Child index for stagger delay
 * @param {object} options - { baseDelay, slideDistance, spring }
 */
export function animateStaggerEntrance(
  opacityValue,
  translateYValue,
  index,
  options = {}
) {
  const {
    baseDelay = 60,
    slideDistance = 20,
    spring = springs.snappy,
  } = options;

  const delay = staggerDelay(index, baseDelay);

  // Set initial state
  opacityValue.value = 0;
  translateYValue.value = slideDistance;

  // Animate with stagger
  opacityValue.value = withDelay(delay, withTiming(1, timings.quick));
  translateYValue.value = withDelay(delay, withSpring(0, spring));
}

/**
 * Breathing pulse — infinite loop between min and max opacity.
 * Used for skeleton loaders, waiting states, attention indicators.
 *
 * @param {SharedValue} sharedValue - The shared value to animate
 * @param {number} min - Minimum value (default 0.4)
 * @param {number} max - Maximum value (default 1)
 * @param {number} duration - Half-cycle duration in ms (default 600)
 */
export function breathe(sharedValue, min = 0.4, max = 1, duration = 600) {
  sharedValue.value = withRepeat(
    withSequence(
      withTiming(min, { duration }),
      withTiming(max, { duration })
    ),
    -1, // infinite
    true // reverse
  );
}

/**
 * Stop a breathing animation and reset to a target value.
 *
 * @param {SharedValue} sharedValue - The shared value to stop
 * @param {number} target - Value to animate to (default 1)
 */
export function stopBreathe(sharedValue, target = 1) {
  sharedValue.value = withTiming(target, timings.quick);
}

/**
 * Gentle floating animation — small translateY oscillation.
 * Used for FAB buttons, attention-drawing elements.
 *
 * @param {SharedValue} sharedValue - translateY shared value
 * @param {number} distance - Float distance in pixels (default 4)
 * @param {number} duration - Half-cycle duration (default 1500)
 */
export function float(sharedValue, distance = 4, duration = 1500) {
  sharedValue.value = withRepeat(
    withSequence(
      withTiming(-distance, { duration, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })
    ),
    -1,
    true
  );
}

/**
 * Shake animation — for error states.
 * Translates left-right rapidly then settles.
 *
 * @param {SharedValue} sharedValue - translateX shared value
 * @param {number} intensity - Shake distance in pixels (default 8)
 */
export function shake(sharedValue, intensity = 8) {
  sharedValue.value = withSequence(
    withTiming(-intensity, { duration: 50 }),
    withTiming(intensity, { duration: 50 }),
    withTiming(-intensity * 0.6, { duration: 50 }),
    withTiming(intensity * 0.6, { duration: 50 }),
    withSpring(0, springs.snappy)
  );
}

/**
 * Count-up animation helper — returns timing config for number interpolation.
 *
 * @param {SharedValue} sharedValue - Value to animate from 0 to target
 * @param {number} target - Target number
 * @param {number} duration - Animation duration (default 800)
 */
export function countUp(sharedValue, target, duration = 800) {
  sharedValue.value = 0;
  sharedValue.value = withTiming(target, {
    duration,
    easing: Easing.out(Easing.cubic),
  });
}

import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';

// Configuration loaded from app.config.js extras via expo-constants.
// Environment variables (POSTHOG_PROJECT_TOKEN, POSTHOG_HOST) are read at
// build time in app.config.js and embedded into the app bundle.
const projectToken = Constants.expoConfig?.extra?.posthogProjectToken;
const host =
  Constants.expoConfig?.extra?.posthogHost || 'https://eu.i.posthog.com';

const isPostHogConfigured =
  Boolean(projectToken) && projectToken !== 'phc_your_project_token_here';

if (__DEV__ && !isPostHogConfigured) {
  console.warn(
    'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or ' +
      'un-configured, this causes events to be silently missed. ' +
      'This error stops appearing once POSTHOG_PROJECT_TOKEN is configured.'
  );
}

/**
 * PostHog client instance for the Jinni app.
 *
 * Peer dependencies already installed:
 *   expo-file-system, expo-application, expo-device, expo-localization,
 *   react-native-svg
 *
 * @see https://posthog.com/docs/libraries/react-native
 */
export const posthog = new PostHog(projectToken || 'placeholder_key', {
  host,

  // Disable entirely when no token is provided — prevents placeholder events.
  disabled: !isPostHogConfigured,

  // Capture app lifecycle events (Installed, Updated, Opened, Backgrounded).
  captureAppLifecycleEvents: true,

  // Verbose logging in development builds.
  debug: __DEV__,

  // Batching — optimises battery and network usage.
  flushAt: 20,
  flushInterval: 10000,
  maxBatchSize: 100,
  maxQueueSize: 1000,

  // Feature flags.
  preloadFeatureFlags: true,
  sendFeatureFlagEvent: true,
  featureFlagsRequestTimeoutMs: 10000,

  // Network resilience.
  requestTimeout: 10000,
  fetchRetryCount: 3,
  fetchRetryDelay: 3000,
});

export const isPostHogEnabled = isPostHogConfigured;

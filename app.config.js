// Dynamic Expo config — converts the static app.json to a JS config so that
// build-time environment variables can be injected into the app bundle.
// Access values in code via: import Constants from 'expo-constants'
//   Constants.expoConfig?.extra?.posthogProjectToken

export default {
  expo: {
    name: 'Jinni',
    slug: 'jinni',
    scheme: 'jinni',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.kodxdev.jinni',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      softwareKeyboardLayoutMode: 'resize',
      package: 'com.kodxdev.jinni',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    runtimeVersion: '1.0.0',
    extra: {
      eas: {
        projectId: '5d4538d6-df3f-4366-a08c-fcc61d7da767',
      },
      // PostHog analytics — read from environment variables at build time.
      // Set POSTHOG_PROJECT_TOKEN and POSTHOG_HOST in your .env file.
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
    },
    owner: 'kodx-dev',
    updates: {
      url: 'https://u.expo.dev/5d4538d6-df3f-4366-a08c-fcc61d7da767',
      fallbackToCacheTimeout: 2000,
    },
    plugins: [
      'expo-web-browser',
      'expo-font',
      'expo-localization',
      'expo-image',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      'expo-status-bar',
      '@react-native-community/datetimepicker',
      'expo-audio',
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          project: 'jinni',
          organization: 'kodex-ub',
        },
      ],
      '@didit-protocol/sdk-react-native',
    ],
  },
};

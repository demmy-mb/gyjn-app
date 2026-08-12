/**
 * ─── Jinni App Config ────────────────────────────────────────────────────────
 *
 * Shared configuration utilities. Extracted from duplicated code across
 * SwipeScreen, LoginScreen, ProfileScreen, and EmployerScreen.
 */

import { Platform, NativeModules } from 'react-native';

/**
 * Resolves the backend URL for API calls.
 *
 * Priority:
 *  1. EXPO_PUBLIC_BACKEND_URL env var (production / staging)
 *  2. Metro bundler host IP (physical device on same Wi-Fi)
 *  3. Android emulator fallback (10.0.2.2)
 *  4. localhost fallback (iOS simulator)
 */
export function getBackendUrl() {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }

  // Dynamically resolve your computer's local IP from the Metro bundler URL.
  // This ensures physical devices on the same Wi-Fi can connect.
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^https?:\/\/([^:/]+)(:\d+)?/);
    if (match && match[1]) {
      const host = match[1];
      if (host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:3000`;
      }
    }
  }

  // Emulators / Simulators fallbacks
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

const DEFAULT_CATEGORY_IMAGES = {
  'Tech & Software': 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
  'Tech': 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80',
  'Design & Creative': 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80',
  'Design': 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80',
  'Finance & Accounting': 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
  'Finance & Fintech': 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
  'Finance': 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
  'Marketing & Sales': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
  'Marketing': 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
  'Data & AI': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80',
  'Product & Operations': 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
  'default': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
};

export function getOptimizedImageUrl(url, width = 800, quality = 80) {
  if (!url || typeof url !== 'string') return url;

  let processedUrl = url.trim();
  if (!processedUrl) return processedUrl;

  // 1. If relative URL starting with '/', attach backend host URL so mobile phones can resolve it
  if (processedUrl.startsWith('/')) {
    const backendUrl = getBackendUrl();
    processedUrl = `${backendUrl}${processedUrl}`;
  }

  // 2. Fix localhost / 127.0.0.1 references for physical mobile devices
  if (processedUrl.includes('localhost') || processedUrl.includes('127.0.0.1')) {
    const backendUrl = getBackendUrl();
    processedUrl = processedUrl.replace(/http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, backendUrl);
  }

  // 3. Unsplash CDN optimization
  if (processedUrl.includes('images.unsplash.com')) {
    const baseUrl = processedUrl.split('?')[0];
    return `${baseUrl}?auto=format&fit=crop&w=${width}&q=${quality}`;
  }

  // 4. Supabase Storage:
  // Standard Supabase public storage endpoint `/storage/v1/object/public/` returns HTTP 400 Bad Request
  // when query parameters like `width` or `quality` are appended if image transformation service isn't enabled.
  // Returning the raw public URL ensures images load reliably on physical devices without 400 errors.
  if (processedUrl.includes('supabase.co/storage/v1/object/public/')) {
    return processedUrl;
  }

  return processedUrl;
}

/**
 * Returns a valid optimized image URL for a job object, using category fallbacks if image_url is missing.
 */
export function getJobImageUrl(job) {
  if (!job) return DEFAULT_CATEGORY_IMAGES['default'];
  if (job.image_url && typeof job.image_url === 'string' && job.image_url.trim()) {
    return getOptimizedImageUrl(job.image_url);
  }
  const categoryRaw = (job.category || '').trim();
  if (categoryRaw && DEFAULT_CATEGORY_IMAGES[categoryRaw]) {
    return DEFAULT_CATEGORY_IMAGES[categoryRaw];
  }
  // Case-insensitive lookup fallback
  const matchedKey = Object.keys(DEFAULT_CATEGORY_IMAGES).find(
    k => k.toLowerCase() === categoryRaw.toLowerCase()
  );
  return matchedKey ? DEFAULT_CATEGORY_IMAGES[matchedKey] : DEFAULT_CATEGORY_IMAGES['default'];
}



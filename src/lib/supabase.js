import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Default fallbacks ensure the app never crashes at startup if env variables are missing during an EAS update bundle
const DEFAULT_SUPABASE_URL = 'https://bwmeojuvxlufknwvlrbz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3bWVvanV2eGx1Zmtud3ZscmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1Mzc2MjgsImV4cCI6MjA5MDExMzYyOH0.E8h-ZNDVGGipPYOjwXJCf0SnPpwm3NxtR0N90EFePFA';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit', // More reliable for mobile OAuth with custom schemes
  },
});

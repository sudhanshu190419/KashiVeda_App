// src/infrastructure/supabase/client.ts
import EncryptedStorage from "react-native-encrypted-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.ts";

try {
  const polyfill = require("react-native-url-polyfill");
  if (polyfill && typeof polyfill.setupURLPolyfill === "function") {
    polyfill.setupURLPolyfill();
  }
} catch {
  // Global URL already present in runtime
}

/**
 * Secure persistent storage adapter for Supabase authentication.
 * Uses hardware-backed encryption (Android Keystore / EncryptedSharedPreferences and iOS Keychain).
 */
export const secureAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await EncryptedStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await EncryptedStorage.setItem(key, value);
    } catch {
      // Keystore write fallback
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await EncryptedStorage.removeItem(key);
    } catch {
      // Keystore cleanup fallback
    }
  },
};

/**
 * Authoritative Supabase Client for Kashi Veda React Native Mobile App.
 * Persists auth sessions and refresh tokens via secure EncryptedStorage
 * and enforces RLS for client-side queries.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

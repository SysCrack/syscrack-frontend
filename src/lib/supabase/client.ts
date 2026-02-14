"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** No-op stub when Supabase env vars are missing (e.g. during Vercel build without env). */
function createStubClient() {
  const noop = () => ({ data: { subscription: { unsubscribe: () => {} } } });
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: noop,
      signOut: () => Promise.resolve({ error: null }),
      signInWithOAuth: () => Promise.resolve({ data: {}, error: null }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signUp: () => Promise.resolve({ data: {}, error: null }),
    },
  } as ReturnType<typeof createBrowserClient>;
}

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (_client) return _client;
  if (supabaseUrl && supabaseAnonKey) {
    _client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  } else {
    if (typeof window === "undefined") {
      console.warn(
        "Supabase environment variables are not set. Authentication will not work."
      );
    }
    _client = createStubClient();
  }
  return _client;
}

// Export a singleton instance for use in stores and components
export const supabase = createClient();
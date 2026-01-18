"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase environment variables are not set. Authentication will not work."
  );
}

export function createClient() {
  return createBrowserClient(
    supabaseUrl || "",
    supabaseAnonKey || ""
  );
}

// Export a singleton instance for use in stores and components
export const supabase = createClient();
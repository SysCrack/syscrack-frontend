// Browser client (use in client components)
export { supabase } from "./client";

// Server client (use in server components, API routes)
export { createServerSupabaseClient } from "./server";

// Admin client (use in webhooks, cron jobs - bypasses RLS)
export { createAdminClient, calculateExpirationDate } from "./admin";
export type { SubscriptionTier } from "./admin";

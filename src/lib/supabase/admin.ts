import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin Client
 * 
 * Uses the service role key which bypasses Row Level Security (RLS).
 * ONLY use this in server-side code (API routes, webhooks, server actions).
 * NEVER expose this client to the browser.
 * 
 * Primary use cases:
 * - Payment webhooks updating premium status
 * - Cron jobs for premium expiration
 * - Admin operations
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Admin operations require service role key."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Helper type for subscription tiers
export type SubscriptionTier = "monthly" | "quarterly" | "yearly";

// Calculate expiration date based on subscription tier
export function calculateExpirationDate(tier: SubscriptionTier): Date {
  const expiresAt = new Date();
  switch (tier) {
    case "monthly":
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      break;
    case "quarterly":
      expiresAt.setMonth(expiresAt.getMonth() + 3);
      break;
    case "yearly":
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      break;
  }
  return expiresAt;
}

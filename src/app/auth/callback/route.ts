import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Handle OAuth errors (e.g., user denied access)
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    const redirectUrl = new URL("/auth/login", request.url);
    redirectUrl.searchParams.set("error", error);
    if (errorDescription) {
      redirectUrl.searchParams.set("error_description", errorDescription);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Exchange the code for a session
  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Successful authentication - redirect to intended destination
      return NextResponse.redirect(new URL(next, request.url));
    }

    console.error("Code exchange error:", exchangeError.message);
  }

  // If we get here, something went wrong
  const redirectUrl = new URL("/auth/login", request.url);
  redirectUrl.searchParams.set("error", "auth_callback_error");
  return NextResponse.redirect(redirectUrl);
}

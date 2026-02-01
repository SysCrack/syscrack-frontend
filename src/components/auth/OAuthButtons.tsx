"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FaGoogle, FaGithub } from "react-icons/fa";
import { cn } from "@/lib/utils/cn";

interface OAuthButtonsProps {
  className?: string;
}

export function OAuthButtons({ className }: OAuthButtonsProps) {
  const [isLoading, setIsLoading] = useState<"google" | "github" | null>(null);

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    setIsLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        console.error("OAuth error:", error.message);
        setIsLoading(null);
      }
      // If successful, the user will be redirected to the OAuth provider
    } catch (error) {
      console.error("OAuth error:", error);
      setIsLoading(null);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <button
        onClick={() => handleOAuthSignIn("google")}
        disabled={isLoading !== null}
        className={cn(
          "w-full flex items-center justify-center gap-3 px-4 py-2.5",
          "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600",
          "rounded-lg font-medium text-gray-700 dark:text-gray-200",
          "hover:bg-gray-50 dark:hover:bg-gray-700",
          "focus:outline-none focus:ring-2 focus:ring-primary/50",
          "transition-colors duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isLoading === "google" ? (
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        ) : (
          <FaGoogle className="w-5 h-5 text-red-500" />
        )}
        Continue with Google
      </button>

      <button
        onClick={() => handleOAuthSignIn("github")}
        disabled={isLoading !== null}
        className={cn(
          "w-full flex items-center justify-center gap-3 px-4 py-2.5",
          "bg-gray-900 dark:bg-gray-700 border border-gray-900 dark:border-gray-600",
          "rounded-lg font-medium text-white",
          "hover:bg-gray-800 dark:hover:bg-gray-600",
          "focus:outline-none focus:ring-2 focus:ring-gray-500/50",
          "transition-colors duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isLoading === "github" ? (
          <div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
        ) : (
          <FaGithub className="w-5 h-5" />
        )}
        Continue with GitHub
      </button>
    </div>
  );
}

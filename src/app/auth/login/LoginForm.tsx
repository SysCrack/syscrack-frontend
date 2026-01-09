"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Code2, Eye, EyeOff } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/authStore";

export function LoginForm() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/problems");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        router.push("/problems");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return null; // Redirect is happening
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="flex items-center justify-center gap-2 mb-8">
            <Code2 className="h-8 w-8 text-[var(--color-primary)]" />
            <span className="text-2xl font-bold text-[var(--color-text-primary)]">
              Syscrack
            </span>
          </Link>

          {/* Card */}
          <div className="bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-2xl p-8 shadow-[var(--shadow-md)]">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] text-center mb-2">
              Welcome back
            </h1>
            <p className="text-[var(--color-text-secondary)] text-center mb-8">
              Sign in to continue your SQL journey
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-[var(--color-error)]/10 border border-[var(--color-error)]/20 text-[var(--color-error)] text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[38px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-[var(--color-text-secondary)]">
                Don&apos;t have an account?{" "}
              </span>
              <Link
                href="/auth/signup"
                className="text-[var(--color-primary)] hover:underline font-medium"
              >
                Sign up
              </Link>
            </div>
          </div>

          {/* Back link */}
          <p className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


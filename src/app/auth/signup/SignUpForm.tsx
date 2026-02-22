"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Code2, Eye, EyeOff, Check } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { OAuthButtons, AuthDivider } from "@/components/auth";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/authStore";

export function SignUpForm() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
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

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mx-auto mb-6">
              <Check className="h-8 w-8 text-[var(--color-success)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              Check your email
            </h1>
            <p className="text-[var(--color-text-secondary)] mb-8">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>. 
              Click the link in the email to activate your account.
            </p>
            <Link href="/auth/login">
              <Button variant="outline">Back to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    );
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
              Create an account
            </h1>
            <p className="text-[var(--color-text-secondary)] text-center mb-8">
              Start mastering SQL performance today
            </p>

            {/* OAuth Buttons */}
            <OAuthButtons />

            <AuthDivider text="or sign up with email" />

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
                  autoComplete="new-password"
                  hint="At least 8 characters"
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

              <Input
                label="Confirm Password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />

              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Create Account
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-[var(--color-text-secondary)]">
                Already have an account?{" "}
              </span>
              <Link
                href="/auth/login"
                className="text-[var(--color-primary)] hover:underline font-medium"
              >
                Sign in
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


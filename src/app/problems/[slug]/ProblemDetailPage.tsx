"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Code, Clock } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { Button, Badge } from "@/components/ui";
import { useProblem } from "@/lib/hooks/useProblems";
import { useAuthStore } from "@/stores/authStore";

interface ProblemDetailPageProps {
  params: Promise<{ slug: string }>;
}

const difficultyVariants = {
  easy: "easy" as const,
  medium: "medium" as const,
  hard: "hard" as const,
};

export function ProblemDetailPage({ params }: ProblemDetailPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading, isPremium } = useAuthStore();
  
  const { data: problem, isLoading, error } = useProblem(slug);

  // Show loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  // Handle auth required
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <Lock className="h-12 w-12 text-[var(--color-primary)] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              Sign in Required
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-6">
              You need to sign in to view problem details and submit solutions.
            </p>
            <div className="flex gap-4 justify-center">
              <Button variant="outline" onClick={() => router.push("/problems")}>
                Back to Problems
              </Button>
              <Button onClick={() => router.push("/auth/login")}>
                Sign In
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Handle error
  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
              {(error as Error).message.includes("403") ? "Premium Required" : "Problem Not Found"}
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-6">
              {(error as Error).message.includes("403")
                ? "This problem is only available to premium users."
                : "The problem you're looking for doesn't exist."}
            </p>
            <Button variant="outline" onClick={() => router.push("/problems")}>
              Back to Problems
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!problem) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
      <TopNav />
      
      <main className="flex-1 py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          {/* Back button */}
          <button
            onClick={() => router.push("/problems")}
            className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Problems
          </button>

          {/* Problem header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant={difficultyVariants[problem.difficulty]}>
                {problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)}
              </Badge>
              <Badge variant="default">{problem.topic}</Badge>
              {problem.is_premium_only && (
                <Badge variant="premium">
                  <Lock className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
              {problem.title}
            </h1>
          </div>

          {/* Problem content */}
          <div className="bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Description
            </h2>
            <div className="prose prose-sm max-w-none text-[var(--color-text-secondary)]">
              <p>{problem.description}</p>
            </div>
          </div>

          {/* Starter code */}
          {problem.starter_code && (
            <div className="bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-xl p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Code className="h-5 w-5 text-[var(--color-primary)]" />
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  Starter Code
                </h2>
              </div>
              <pre className="bg-[var(--color-surface)] rounded-lg p-4 overflow-x-auto">
                <code className="text-sm font-mono text-[var(--color-text-primary)]">
                  {problem.starter_code}
                </code>
              </pre>
            </div>
          )}

          {/* Editor placeholder */}
          <div className="bg-[var(--color-surface)] border-2 border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
            <Clock className="h-12 w-12 text-[var(--color-text-tertiary)] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
              Editor Coming Soon
            </h3>
            <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
              The SQL editor with live execution and grading will be available in Phase 2.
              For now, you can view problem descriptions and starter code.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}


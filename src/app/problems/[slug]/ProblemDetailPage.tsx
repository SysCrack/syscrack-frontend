"use client";

import { use, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/ui";
import { ProblemPanel } from "@/components/problem/ProblemPanel";
import { EditorCanvas } from "@/components/editor";
import { ResultsPanel } from "@/components/results";
import { useProblem } from "@/lib/hooks/useProblems";
import { useSubmitSolution } from "@/lib/hooks/useSubmissions";
import { useAuthStore } from "@/stores/authStore";

interface ProblemDetailPageProps {
  params: Promise<{ slug: string }>;
}

type SubmissionStatus = "accepted" | "suboptimal" | "wrong" | "timeout" | "error";

interface SubmissionResult {
  id: number;
  status: SubmissionStatus;
  score: number;
  execution_time_ms: number;
  feedback: {
    messages?: string[];
    issues?: Array<{
      issue_type: string;
      severity: string;
      message: string;
    }>;
  };
}

export function ProblemDetailPage({ params }: ProblemDetailPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  // Fetch problem data
  const { data: apiProblem, isLoading, error } = useProblem(slug, {
    enabled: !authLoading && !!user,
  });

  // Transform API data to UI model
  const problem = apiProblem ? {
    ...apiProblem,
    // Map API requirements to UI format
    // Fallback to empty arrays if data is missing or not in expected format
    definition: {
      example: (apiProblem.requirements?.example as any) || { input: "", output: "" },
      functional_requirements: (apiProblem.requirements?.functional as any[])?.map(
        r => typeof r === 'string' ? r : r.text
      ) || [],
      non_functional_requirements: (apiProblem.requirements?.non_functional as any[])?.map(
        r => typeof r === 'string' ? r : r.text
      ) || [],
      assumptions: (apiProblem.requirements?.assumptions as string[]) || [],
      estimated_usage: (apiProblem.requirements?.estimated_usage as any[]) || [],
    },
  } : null;

  // Submission state
  const submitMutation = useSubmitSolution();
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [lastResult, setLastResult] = useState<SubmissionResult | null>(null);

  // Handle submit
  const handleSubmit = useCallback(
    async (code: string) => {
      if (!problem) return;

      try {
        const result = await submitMutation.mutateAsync({
          problemId: problem.id,
          code,
        });

        // Transform the result to match our expected type
        const submissionResult: SubmissionResult = {
          id: result.id,
          status: result.status as SubmissionStatus,
          score: result.score,
          execution_time_ms: result.execution_time_ms,
          feedback: result.feedback || { messages: [], issues: [] },
        };

        setLastResult(submissionResult);
        setIsResultsOpen(true);
      } catch (err) {
        // Error is handled by the mutation
        console.error("Submission failed:", err);
      }
    },
    [problem, submitMutation]
  );

  // Handle close results
  const handleCloseResults = useCallback(() => {
    setIsResultsOpen(false);
  }, []);

  // Handle try again
  const handleTryAgain = useCallback(() => {
    setIsResultsOpen(false);
  }, []);

  // Handle next problem (placeholder for now)
  const handleNextProblem = useCallback(() => {
    router.push("/");
  }, [router]);

  // Show loading while auth is initializing
  if (authLoading) {
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
              <Button variant="outline" onClick={() => router.push("/")}>
                Back to Home
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

  // Show loading while fetching problem
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
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
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!problem) return null;

  return (
    <div className="h-screen flex flex-col bg-[var(--color-canvas-bg)] overflow-hidden">
      <TopNav />

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Problem Panel - Left Side */}
        <div className="w-[40%] min-w-[450px] max-w-[600px] flex-shrink-0 hidden lg:block border-r border-[var(--color-border)]">
          <ProblemPanel problem={problem} className="h-full border-none" />
        </div>

        {/* Editor Canvas - Right Side */}
        <div className="flex-1 min-w-0">
          <EditorCanvas
            problemId={problem.id}
            starterCode={problem.starter_code || "-- Write your SQL query here\n"}
            onSubmit={handleSubmit}
            isSubmitting={submitMutation.isPending}
          />
        </div>
      </div>

      {/* Results Panel - Slide Up from Bottom */}
      <ResultsPanel
        result={lastResult}
        isOpen={isResultsOpen}
        onClose={handleCloseResults}
        onTryAgain={handleTryAgain}
        onNextProblem={lastResult?.status === "accepted" ? handleNextProblem : undefined}
      />

      {/* Mobile: Problem panel toggle (future enhancement) */}
      <div className="lg:hidden fixed bottom-20 right-4 z-30">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Toggle mobile problem panel - future feature
          }}
          className="shadow-lg"
        >
          View Problem
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useCallback } from "react";
import { X, Clock, RotateCcw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";
import { StatusBadge } from "./StatusBadge";
import { FeedbackList } from "./FeedbackList";
import { cn } from "@/lib/utils/cn";

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

interface ResultsPanelProps {
  result: SubmissionResult | null;
  isOpen: boolean;
  onClose: () => void;
  onTryAgain?: () => void;
  onNextProblem?: () => void;
}

export function ResultsPanel({
  result,
  isOpen,
  onClose,
  onTryAgain,
  onNextProblem,
}: ResultsPanelProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!result) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-canvas-bg)] border-t-2 border-[var(--color-border)] shadow-lg",
        "transform transition-transform duration-300 ease-out",
        isOpen ? "translate-y-0" : "translate-y-full"
      )}
      style={{ height: "40vh", minHeight: "250px", maxHeight: "60vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <StatusBadge status={result.status} score={result.score} />
          
          {/* Execution time */}
          <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
            <Clock className="h-4 w-4" />
            <span>{result.execution_time_ms}ms</span>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
          aria-label="Close results"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto" style={{ height: "calc(100% - 130px)" }}>
        <FeedbackList
          messages={result.feedback?.messages}
          issues={result.feedback?.issues}
        />

        {/* Empty state if no feedback */}
        {(!result.feedback?.messages?.length && !result.feedback?.issues?.length) && (
          <p className="text-[var(--color-text-tertiary)] text-sm">
            No additional feedback available.
          </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-canvas-bg)]">
        {onTryAgain && (
          <Button variant="outline" onClick={onTryAgain}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
        
        {result.status === "accepted" && onNextProblem && (
          <Button onClick={onNextProblem}>
            Next Problem
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

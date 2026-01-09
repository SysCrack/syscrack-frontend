"use client";

import { ProblemCard } from "./ProblemCard";
import { ProblemCardSkeleton } from "./ProblemCardSkeleton";
import type { ProblemListItem } from "@/lib/api/problems";

interface ProblemListProps {
  problems?: ProblemListItem[];
  isLoading?: boolean;
  error?: Error | null;
}

export function ProblemList({ problems, isLoading, error }: ProblemListProps) {
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-error)] mb-2">Failed to load problems</p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {error.message}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProblemCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!problems || problems.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-secondary)]">
          No problems found. Try changing your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {problems.map((problem) => (
        <ProblemCard key={problem.id} problem={problem} />
      ))}
    </div>
  );
}


"use client";

import { Card, CardContent } from "@/components/ui";

export function ProblemCardSkeleton() {
  return (
    <Card className="h-full">
      <CardContent className="pt-5">
        {/* Badge skeleton */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-14 rounded-full bg-[var(--color-surface)] animate-pulse" />
        </div>

        {/* Title skeleton */}
        <div className="space-y-2 mb-2">
          <div className="h-5 w-3/4 rounded bg-[var(--color-surface)] animate-pulse" />
          <div className="h-5 w-1/2 rounded bg-[var(--color-surface)] animate-pulse" />
        </div>

        {/* Topic skeleton */}
        <div className="h-6 w-20 rounded-md bg-[var(--color-surface)] animate-pulse" />

        {/* Footer skeleton */}
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="h-4 w-24 rounded bg-[var(--color-surface)] animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}


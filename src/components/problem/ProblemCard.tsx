"use client";

import Link from "next/link";
import { Lock, Users } from "lucide-react";
import { Card, CardContent, Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { ProblemListItem } from "@/lib/api/problems";
import { useAuthStore } from "@/stores/authStore";

interface ProblemCardProps {
  problem: ProblemListItem;
}

const difficultyVariants = {
  easy: "easy" as const,
  medium: "medium" as const,
  hard: "hard" as const,
};

export function ProblemCard({ problem }: ProblemCardProps) {
  const { isPremium, user } = useAuthStore();
  const isLocked = problem.is_premium_only && !isPremium;

  // Link to system design canvas
  return (
    <Link href={`/design/${problem.slug}`}>
      <Card variant="interactive" className="h-full relative group">
        {/* Premium lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--color-canvas-bg)]/80 backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
            <Lock className="h-8 w-8 text-[var(--color-premium)] mb-2" />
            <span className="text-sm font-medium text-[var(--color-premium)]">
              Premium Only
            </span>
          </div>
        )}

        <CardContent className="pt-5">
          {/* Header with badges */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Badge variant={difficultyVariants[problem.difficulty]}>
                {problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)}
              </Badge>
              {problem.is_premium_only && (
                <Badge variant="premium">
                  <Lock className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className={cn(
            "text-lg font-semibold text-[var(--color-text-primary)] mb-2 line-clamp-2",
            isLocked && "opacity-60"
          )}>
            {problem.title}
          </h3>

          {/* Topic tag */}
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-md bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
              {problem.topic}
            </span>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center text-xs text-[var(--color-text-tertiary)]">
            <Users className="h-3.5 w-3.5 mr-1" />
            <span>Problem #{problem.id}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}


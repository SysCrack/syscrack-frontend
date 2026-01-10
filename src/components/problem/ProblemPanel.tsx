"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Lock, Code } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

interface Problem {
  id: number;
  title: string;
  slug: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  description: string;
  starter_code?: string;
  is_premium_only: boolean;
}

interface ProblemPanelProps {
  problem: Problem;
  className?: string;
}

const difficultyVariants = {
  easy: "easy" as const,
  medium: "medium" as const,
  hard: "hard" as const,
};

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-6 py-3 text-left hover:bg-[var(--color-surface)] transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        )}
        {icon}
        <span className="font-medium text-sm text-[var(--color-text-primary)]">
          {title}
        </span>
      </button>
      
      {isOpen && (
        <div className="px-6 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function ProblemPanel({ problem, className }: ProblemPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[var(--color-panel-bg)] border-r border-[var(--color-border)]",
        className
      )}
    >
      {/* Header - Fixed */}
      <div className="flex-shrink-0 p-6 border-b border-[var(--color-border)]">
        {/* Badges */}
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
        
        {/* Title */}
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] leading-tight">
          {problem.title}
        </h1>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Description */}
        <CollapsibleSection title="Description" defaultOpen={true}>
          <div className="prose prose-sm max-w-none text-[var(--color-text-secondary)]">
            <p className="whitespace-pre-wrap">{problem.description}</p>
          </div>
        </CollapsibleSection>

        {/* Starter Code */}
        {problem.starter_code && (
          <CollapsibleSection
            title="Starter Code"
            icon={<Code className="h-4 w-4 text-[var(--color-primary)]" />}
            defaultOpen={false}
          >
            <pre className="bg-[var(--color-surface)] rounded-lg p-4 overflow-x-auto text-sm">
              <code className="font-mono text-[var(--color-text-primary)]">
                {problem.starter_code}
              </code>
            </pre>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

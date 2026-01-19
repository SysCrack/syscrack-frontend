"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { SystemDesignProblem } from "@/lib/data/mockProblems";

interface ProblemPanelProps {
  problem: SystemDesignProblem;
  className?: string;
}

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const difficultyVariants = {
  easy: "easy" as const,
  medium: "medium" as const,
  hard: "hard" as const,
};

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
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-[var(--color-surface)] transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)] flex-shrink-0" />
        )}
        {icon}
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">{title}</span>
      </button>

      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-[var(--color-text-secondary)] ml-1">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2">
          <span className="text-[var(--color-text-tertiary)] mt-1">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProblemPanel({ problem, className }: ProblemPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[var(--color-panel-bg)] border-r border-[var(--color-border)] overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-4 border-b border-[var(--color-border)]">
        {/* Title */}
        <h1 className="text-lg font-bold text-[var(--color-text-primary)] leading-tight mb-2">
          {problem.title}
        </h1>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={difficultyVariants[problem.difficulty]}>
            {problem.difficulty.charAt(0).toUpperCase() +
              problem.difficulty.slice(1)}
          </Badge>
          {problem.is_premium_only && (
            <Badge variant="premium">
              <Lock className="h-3 w-3 mr-1" />
              Premium
            </Badge>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Description */}
        <CollapsibleSection title="Description" defaultOpen={true}>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            {problem.description}
          </p>
        </CollapsibleSection>

        {/* Example */}
        <CollapsibleSection title="Example" defaultOpen={true}>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-[var(--color-text-primary)]">Input: </span>
              <span className="text-[var(--color-primary)]">{problem.example.input}</span>
            </div>
            <div>
              <span className="font-medium text-[var(--color-text-primary)]">Output: </span>
              <span className="text-[var(--color-primary)]">{problem.example.output}</span>
            </div>
          </div>
        </CollapsibleSection>

        {/* Functional Requirements */}
        <CollapsibleSection title="Functional Requirements" defaultOpen={true}>
          <ul className="space-y-1.5 text-sm text-[var(--color-text-secondary)] ml-1">
            {problem.functionalRequirements.map((req, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-[var(--color-text-tertiary)] mt-1">•</span>
                {req.isLink ? (
                  <span className="text-[var(--color-primary)] underline cursor-pointer hover:opacity-80">
                    {req.text}
                  </span>
                ) : (
                  <span>{req.text}</span>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        {/* Nonfunctional Requirements */}
        <CollapsibleSection title="Nonfunctional Requirements" defaultOpen={true}>
          <BulletList
            items={problem.nonfunctionalRequirements.map(r => r.text)}
          />
        </CollapsibleSection>

        {/* Assumptions */}
        <CollapsibleSection title="Assumptions" defaultOpen={true}>
          <BulletList items={problem.assumptions} />
        </CollapsibleSection>

        {/* Estimated Usage */}
        <CollapsibleSection title="Estimated Usage" defaultOpen={true}>
          <ul className="space-y-1.5 text-sm text-[var(--color-text-secondary)] ml-1">
            {problem.estimatedUsage.map((usage, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-[var(--color-text-tertiary)] mt-1">•</span>
                <span>
                  {usage.label}
                  {usage.value && (
                    <span className="font-medium text-[var(--color-text-primary)]">
                      : {usage.value}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </div>
    </div>
  );
}

export default ProblemPanel;

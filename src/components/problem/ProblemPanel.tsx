"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Lock, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { SystemDesignProblemDetail, ProblemDefinition } from "@/lib/types/design";

interface ProblemPanelProps {
  problem: SystemDesignProblemDetail;
  className?: string;
  onClose?: () => void;
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

export function ProblemPanel({ problem, className, onClose }: ProblemPanelProps) {
  const definition = problem.definition;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[var(--color-panel-bg)] border-r border-[var(--color-border)] overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-2 mb-2">
          {/* Title */}
          <h1 className="text-lg font-bold text-[var(--color-text-primary)] leading-tight">
            {problem.title}
          </h1>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-[var(--color-bg-secondary)] rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              title="Collapse Panel"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={difficultyVariants[problem.difficulty as keyof typeof difficultyVariants] || "medium"}>
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
        {definition?.example && (
          <CollapsibleSection title="Example" defaultOpen={true}>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-[var(--color-text-primary)]">Input: </span>
                <span className="text-[var(--color-primary)]">{definition.example.input}</span>
              </div>
              <div>
                <span className="font-medium text-[var(--color-text-primary)]">Output: </span>
                <span className="text-[var(--color-primary)]">{definition.example.output}</span>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Functional Requirements */}
        {definition?.functional_requirements && definition.functional_requirements.length > 0 && (
          <CollapsibleSection title="Functional Requirements" defaultOpen={true}>
            <BulletList items={definition.functional_requirements} />
          </CollapsibleSection>
        )}

        {/* Nonfunctional Requirements */}
        {definition?.non_functional_requirements && definition.non_functional_requirements.length > 0 && (
          <CollapsibleSection title="Nonfunctional Requirements" defaultOpen={true}>
            <BulletList items={definition.non_functional_requirements} />
          </CollapsibleSection>
        )}

        {/* Assumptions */}
        {definition?.assumptions && definition.assumptions.length > 0 && (
          <CollapsibleSection title="Assumptions" defaultOpen={true}>
            <BulletList items={definition.assumptions} />
          </CollapsibleSection>
        )}

        {/* Estimated Usage */}
        {definition?.estimated_usage && definition.estimated_usage.length > 0 && (
          <CollapsibleSection title="Estimated Usage" defaultOpen={true}>
            <ul className="space-y-1.5 text-sm text-[var(--color-text-secondary)] ml-1">
              {definition.estimated_usage.map((usage, index) => (
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
        )}
      </div>
    </div>
  );
}

export default ProblemPanel;


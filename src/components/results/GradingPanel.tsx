"use client";

import { useState } from "react";
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Info,
    ChevronDown,
    ChevronUp,
    Target,
    Scale,
    Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type {
    ConceptGradingResponse,
    ConceptFeedbackItem,
    OptimalComponentComparison,
} from "@/lib/types/design";

interface GradingPanelProps {
    grading: ConceptGradingResponse | null;
    isLoading?: boolean;
    className?: string;
}

const SEVERITY_CONFIG = {
    critical: { icon: XCircle, color: "text-red-600", bg: "bg-red-500/10" },
    error: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
    warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
    info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10" },
};

const RESULT_CONFIG = {
    match: { icon: CheckCircle, color: "text-green-500", label: "Optimal" },
    acceptable: { icon: CheckCircle, color: "text-blue-500", label: "Acceptable" },
    suboptimal: { icon: AlertTriangle, color: "text-amber-500", label: "Suboptimal" },
    incorrect: { icon: XCircle, color: "text-red-500", label: "Incorrect" },
};

export function GradingPanel({ grading, isLoading, className }: GradingPanelProps) {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(["feedback"])
    );

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    };

    if (isLoading) {
        return (
            <div className={cn("p-6 space-y-4", className)}>
                <div className="animate-pulse space-y-3">
                    <div className="h-8 bg-[var(--color-surface)] rounded w-1/3" />
                    <div className="h-4 bg-[var(--color-surface)] rounded w-2/3" />
                    <div className="h-4 bg-[var(--color-surface)] rounded w-1/2" />
                </div>
            </div>
        );
    }

    if (!grading) {
        return null;
    }

    // Group feedback by category
    const feedbackByCategory = grading.concept_feedback.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, ConceptFeedbackItem[]>);

    return (
        <div className={cn("space-y-6", className)}>
            {/* Score Header */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--color-surface)]">
                <div>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                        Design Grade
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        {grading.summary_feedback}
                    </p>
                </div>
                <div
                    className={cn(
                        "text-3xl font-bold",
                        grading.total_score >= 80
                            ? "text-green-500"
                            : grading.total_score >= 60
                                ? "text-amber-500"
                                : "text-red-500"
                    )}
                >
                    {grading.total_score}
                    <span className="text-lg text-[var(--color-text-tertiary)]">/100</span>
                </div>
            </div>

            {/* Concept Feedback Section */}
            <Section
                title="Concept Feedback"
                icon={Lightbulb}
                isExpanded={expandedSections.has("feedback")}
                onToggle={() => toggleSection("feedback")}
                badge={grading.concept_feedback.length}
            >
                <div className="space-y-4">
                    {Object.entries(feedbackByCategory).map(([category, items]) => (
                        <div key={category}>
                            <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2 capitalize">
                                {category.replace(/_/g, " ")}
                            </h4>
                            <div className="space-y-2">
                                {items.map((item, idx) => {
                                    const config = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.info;
                                    const Icon = config.icon;
                                    return (
                                        <div
                                            key={`${item.rule_id}-${idx}`}
                                            className={cn(
                                                "flex items-start gap-3 p-3 rounded-lg",
                                                config.bg
                                            )}
                                        >
                                            <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.color)} />
                                            <div className="flex-1">
                                                <p className="text-sm text-[var(--color-text-primary)]">
                                                    {item.message}
                                                </p>
                                                {item.penalty > 0 && (
                                                    <span className="text-xs text-[var(--color-text-tertiary)]">
                                                        -{item.penalty} points
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* Optimal Comparison Section */}
            {grading.optimal_comparison && (
                <Section
                    title="Comparison to Optimal"
                    icon={Target}
                    isExpanded={expandedSections.has("optimal")}
                    onToggle={() => toggleSection("optimal")}
                    badge={`${grading.optimal_comparison.match_percentage}%`}
                >
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            {grading.optimal_comparison.summary}
                        </p>
                        <div className="space-y-2">
                            {grading.optimal_comparison.components.map((comp, idx) => (
                                <ComponentComparisonRow key={idx} comparison={comp} />
                            ))}
                        </div>
                    </div>
                </Section>
            )}

            {/* Trade-off Analysis Section */}
            {grading.trade_off_analysis && (
                <Section
                    title="Trade-off Analysis"
                    icon={Scale}
                    isExpanded={expandedSections.has("tradeoffs")}
                    onToggle={() => toggleSection("tradeoffs")}
                    badge={
                        grading.trade_off_analysis.score_bonus > 0
                            ? `+${grading.trade_off_analysis.score_bonus}`
                            : undefined
                    }
                >
                    <div className="space-y-3">
                        {grading.trade_off_analysis.score_bonus > 0 && (
                            <div className="flex items-center gap-2 text-green-500 text-sm">
                                <CheckCircle className="h-4 w-4" />
                                <span>+{grading.trade_off_analysis.score_bonus} bonus points for trade-off justifications</span>
                            </div>
                        )}
                        {grading.trade_off_analysis.issues.map((issue, idx) => (
                            <div
                                key={idx}
                                className="p-3 rounded-lg bg-amber-500/10 space-y-1"
                            >
                                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                                    {issue.component}
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    {issue.issue}
                                </p>
                                <p className="text-xs text-[var(--color-text-tertiary)]">
                                    💡 {issue.suggestion}
                                </p>
                            </div>
                        ))}
                        {grading.trade_off_analysis.issues.length === 0 && (
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                No trade-off issues detected.
                            </p>
                        )}
                    </div>
                </Section>
            )}
        </div>
    );
}

// Section wrapper component
function Section({
    title,
    icon: Icon,
    isExpanded,
    onToggle,
    badge,
    children,
}: {
    title: string;
    icon: React.ElementType;
    isExpanded: boolean;
    onToggle: () => void;
    badge?: string | number;
    children: React.ReactNode;
}) {
    return (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-[var(--color-text-secondary)]" />
                    <span className="font-medium text-[var(--color-text-primary)]">{title}</span>
                    {badge && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                            {badge}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                ) : (
                    <ChevronDown className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                )}
            </button>
            {isExpanded && <div className="p-4 bg-[var(--color-canvas-bg)]">{children}</div>}
        </div>
    );
}

// Component comparison row
function ComponentComparisonRow({
    comparison,
}: {
    comparison: OptimalComponentComparison;
}) {
    const config = RESULT_CONFIG[comparison.result] || RESULT_CONFIG.suboptimal;
    const Icon = config.icon;

    return (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-surface)]">
            <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", config.color)} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-[var(--color-text-primary)] capitalize">
                        {comparison.component.replace(/_/g, " ")}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded", config.color)}>
                        {config.label}
                    </span>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    Your choice: <strong>{comparison.user_choice}</strong>
                    {comparison.result !== "match" && (
                        <span className="text-[var(--color-text-tertiary)]">
                            {" "}→ Optimal: <strong>{comparison.optimal_choice}</strong>
                        </span>
                    )}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                    {comparison.explanation}
                </p>
            </div>
        </div>
    );
}

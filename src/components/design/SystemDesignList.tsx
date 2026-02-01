'use client';

import Link from "next/link";
import { ArrowRight, Lock, CheckCircle2 } from "lucide-react";
import type { SystemDesignProblemList } from "@/lib/types/design";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface SystemDesignListProps {
    problems?: SystemDesignProblemList[];
    isLoading: boolean;
    error: Error | null;
}

export function SystemDesignList({ problems, isLoading, error }: SystemDesignListProps) {
    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-red-400">Failed to load problems. Please try again.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <Card key={i} className="h-48 animate-pulse bg-[var(--color-surface)] border-[var(--color-border)]" />
                ))}
            </div>
        );
    }

    if (!problems?.length) {
        return (
            <div className="text-center py-12">
                <p className="text-[var(--color-text-secondary)]">No system design problems found.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {problems.map((problem) => (
                <SystemDesignCard key={problem.id} problem={problem} />
            ))}
        </div>
    );
}

function SystemDesignCard({ problem }: { problem: SystemDesignProblemList }) {
    const difficultyColors = {
        easy: "bg-green-500/10 text-green-500",
        medium: "bg-yellow-500/10 text-yellow-500",
        hard: "bg-red-500/10 text-red-500",
    };

    return (
        <Link
            href={`/design/${problem.slug || problem.id}`}
            className="group block h-full transition-transform hover:-translate-y-1 duration-200"
        >
            <div className="h-full bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-xl p-6 hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-primary/5 transition-all relative overflow-hidden">
                {/* Glow effect */}
                <div className="absolute top-0 right-0 p-32 bg-[var(--color-primary)] opacity-0 group-hover:opacity-5 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2 transition-opacity" />

                <div className="flex justify-between items-start mb-4">
                    <Badge
                        className={`capitalize border-0 ${difficultyColors[problem.difficulty as keyof typeof difficultyColors] || 'bg-gray-500/10 text-gray-500'}`}
                    >
                        {problem.difficulty}
                    </Badge>

                    {problem.is_premium_only && (
                        <div className="bg-gradient-to-r from-amber-200 to-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            PRO
                        </div>
                    )}
                </div>

                <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-2 group-hover:text-[var(--color-primary)] transition-colors">
                    {problem.title}
                </h3>

                <div className="flex items-center text-sm text-[var(--color-text-tertiary)] mt-4">
                    <span className="flex items-center gap-1 group-hover:gap-2 transition-all text-[var(--color-primary)] font-medium">
                        Start Design <ArrowRight className="w-4 h-4" />
                    </span>
                </div>
            </div>
        </Link>
    );
}

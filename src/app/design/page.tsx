'use client';

import { useState } from "react";
import { Filter, Layers } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { SystemDesignList } from "@/components/design/SystemDesignList";
import { useQuery } from "@tanstack/react-query";
import { fetchSystemDesignProblems } from "@/lib/api/problems";
import { cn } from "@/lib/utils/cn";

type Difficulty = "easy" | "medium" | "hard" | undefined;

const difficultyFilters: { label: string; value: Difficulty }[] = [
    { label: "All", value: undefined },
    { label: "Easy", value: "easy" },
    { label: "Medium", value: "medium" },
    { label: "Hard", value: "hard" },
];

export default function SystemDesignListingPage() {
    const [difficulty, setDifficulty] = useState<Difficulty>(undefined);

    const { data: problems, isLoading, error } = useQuery({
        queryKey: ['system-design-problems'],
        queryFn: fetchSystemDesignProblems
    });

    const filteredProblems = problems?.filter(p => !difficulty || p.difficulty === difficulty);

    return (
        <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
            <TopNav />

            <main className="flex-1 py-8 sm:py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-purple-500/10 rounded-lg">
                                    <Layers className="h-6 w-6 text-purple-400" />
                                </div>
                                <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)]">
                                    System Design
                                </h1>
                            </div>
                            <p className="mt-2 text-[var(--color-text-secondary)]">
                                Design scalable architectures for real-world scenarios
                            </p>
                        </div>

                        {/* Filter chips */}
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                            {difficultyFilters.map((filter) => (
                                <button
                                    key={filter.label}
                                    onClick={() => setDifficulty(filter.value)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                        difficulty === filter.value
                                            ? "bg-[var(--color-primary)] text-white"
                                            : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                                    )}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Problem grid */}
                    <SystemDesignList
                        problems={filteredProblems}
                        isLoading={isLoading}
                        error={error as Error | null}
                    />
                </div>
            </main>
        </div>
    );
}

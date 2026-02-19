"use client";

import Link from "next/link";
import { Database, Layers, ArrowRight, Code2, FlaskConical } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { Footer } from "@/components/layout/Footer";
import { useAuthStore } from "@/stores/authStore";

export function Dashboard() {
    const { user } = useAuthStore();
    const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

    return (
        <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
            <TopNav />
            <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
                <div className="max-w-4xl w-full space-y-12">

                    <div className="text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-text-primary)]">
                            Welcome back, <span className="text-[var(--color-primary)]">{firstName}</span>
                        </h1>
                        <p className="text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto">
                            What would you like to practice today?
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
                        {/* SQL Problems Card */}
                        <Link
                            href="/problems"
                            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 transition-all hover:border-[var(--color-primary)] hover:shadow-2xl hover:shadow-[var(--color-primary)]/10"
                        >
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform duration-300">
                                    <Database className="h-8 w-8" />
                                </div>

                                <h2 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
                                    SQL Optimization
                                </h2>
                                <p className="mb-8 text-[var(--color-text-secondary)] leading-relaxed flex-grow">
                                    Master database performance tuning with real-world query optimization challenges.
                                </p>

                                <div className="flex items-center text-blue-500 font-semibold group-hover:gap-2 gap-1 transition-all">
                                    Browse Problems <ArrowRight className="h-5 w-5" />
                                </div>
                            </div>
                            <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl group-hover:bg-blue-500/10 transition-colors" />
                        </Link>

                        {/* System Design Card */}
                        <Link
                            href="/design"
                            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 transition-all hover:border-purple-500 hover:shadow-2xl hover:shadow-purple-500/10"
                        >
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform duration-300">
                                    <Layers className="h-8 w-8" />
                                </div>

                                <h2 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
                                    System Design
                                </h2>
                                <p className="mb-8 text-[var(--color-text-secondary)] leading-relaxed flex-grow">
                                    Design components, define data flows, and simulate traffic to find bottlenecks.
                                </p>

                                <div className="flex items-center text-purple-500 font-semibold group-hover:gap-2 gap-1 transition-all">
                                    Start Designing <ArrowRight className="h-5 w-5" />
                                </div>
                            </div>
                            <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-purple-500/5 blur-3xl group-hover:bg-purple-500/10 transition-colors" />
                        </Link>

                        {/* Sandbox Card */}
                        <Link
                            href="/sandbox"
                            className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 transition-all hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10"
                        >
                            <div className="relative z-10 flex flex-col h-full">
                                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform duration-300">
                                    <FlaskConical className="h-8 w-8" />
                                </div>

                                <h2 className="mb-3 text-2xl font-bold text-[var(--color-text-primary)]">
                                    Sandbox
                                </h2>
                                <p className="mb-8 text-[var(--color-text-secondary)] leading-relaxed flex-grow">
                                    Free-form canvas to design and experiment with system architectures.
                                </p>

                                <div className="flex items-center text-emerald-500 font-semibold group-hover:gap-2 gap-1 transition-all">
                                    Open Sandbox <ArrowRight className="h-5 w-5" />
                                </div>
                            </div>
                            <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
                        </Link>
                    </div>

                </div>
            </main>
            <Footer />
        </div>
    );
}

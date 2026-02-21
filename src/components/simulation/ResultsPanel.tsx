'use client';

import { useState } from 'react';
import {
    X, CheckCircle, XCircle, AlertTriangle, TrendingUp, Activity,
    DollarSign, Clock, ChevronUp, ChevronDown, Lightbulb, RotateCcw,
    Crown, ArrowRight, Zap
} from 'lucide-react';
import { useSimulationStore } from '@/stores/simulationStore';
import { useFlowAnimation } from '@/lib/hooks/useFlowAnimation';
import { useDesignStore } from '@/stores/designStore';
import { SimulationStatus } from '@/lib/types/design';
import type { ScenarioResult, EstimationComparison, MetricComparison } from '@/lib/types/design';
import { isSystemComponent, isSystemConnection } from '@/lib/types/components';
import { useEffect } from 'react';

interface FeedbackItem {
    type: 'success' | 'warning' | 'error' | 'suggestion';
    text: string;
}

/**
 * Parse feedback text to categorize it
 */
function parseFeedback(feedback: string[]): FeedbackItem[] {
    return feedback.map(fb => {
        if (fb.startsWith('✓') || fb.startsWith('✅') || fb.toLowerCase().includes('no bottleneck')) {
            return { type: 'success', text: fb };
        } else if (fb.startsWith('⚠') || fb.startsWith('⚠️') || fb.toLowerCase().includes('warning')) {
            return { type: 'warning', text: fb };
        } else if (fb.startsWith('✗') || fb.startsWith('❌') || fb.toLowerCase().includes('fail')) {
            return { type: 'error', text: fb };
        } else if (fb.startsWith('💡') || fb.toLowerCase().includes('consider') || fb.toLowerCase().includes('suggest')) {
            return { type: 'suggestion', text: fb };
        } else {
            return { type: 'warning', text: fb };
        }
    });
}

/**
 * Get score color class
 */
function getScoreColorClass(score: number): string {
    if (score >= 75) return 'bg-green-500/10 text-green-500 border-green-500/30';
    if (score >= 60) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    return 'bg-red-500/10 text-red-500 border-red-500/30';
}

/**
 * Get scenario status icon
 */
function ScenarioStatusIcon({ result }: { result: ScenarioResult }) {
    const hasBottleneck = (result.metrics.bottlenecks && result.metrics.bottlenecks.length > 0);
    const passPercent = (result.score / result.max_score) * 100;

    // If the scenario explicitly failed or has a critical bottleneck, it's a fail
    if (!result.passed || hasBottleneck) {
        return <XCircle className="h-5 w-5 text-red-500" />;
    }

    if (passPercent >= 90) {
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (passPercent >= 50) {
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    } else {
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
}

/**
 * Detailed comparison for a single metric
 */
function ComparisonRow({ label, comparison, unit }: { label: string, comparison: MetricComparison, unit: string }) {
    const getAccuracyInfo = (accuracy: string, diff: number) => {
        const isOver = diff > 0;
        const absDiff = Math.abs(diff).toFixed(1);

        switch (accuracy.toLowerCase()) {
            case 'excellent':
                return {
                    color: 'text-green-500 bg-green-500/10',
                    label: '✓ Great estimate!',
                    barColor: 'bg-green-500'
                };
            case 'good':
                return {
                    color: 'text-blue-500 bg-blue-500/10',
                    label: 'Close!',
                    barColor: 'bg-blue-500'
                };
            case 'fair':
                return {
                    color: 'text-yellow-600 bg-yellow-500/10',
                    label: `${absDiff}% ${isOver ? 'over' : 'under'}bound`,
                    barColor: 'bg-yellow-500'
                };
            case 'poor':
                return {
                    color: 'text-red-500 bg-red-500/10',
                    label: `⚠️ ${absDiff}% off`,
                    barColor: 'bg-red-500'
                };
            default:
                return {
                    color: 'text-[var(--color-text-tertiary)] bg-[var(--color-surface)]',
                    label: accuracy,
                    barColor: 'bg-[var(--color-primary)]'
                };
        }
    };

    const info = getAccuracyInfo(comparison.accuracy, comparison.difference_percent);

    // Calculate bar widths - cap at 100% for the larger one
    const maxVal = Math.max(comparison.estimated, comparison.actual, 1);
    const estWidth = (comparison.estimated / maxVal) * 100;
    const actWidth = (comparison.actual / maxVal) * 100;

    return (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]/50 shadow-sm transition-all hover:border-[var(--color-border)]">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-[0.1em]">{label}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${info.color}`}>
                    {info.label}
                </span>
            </div>

            {/* Split Values */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                    <div className="text-[9px] text-[var(--color-text-tertiary)] uppercase font-semibold mb-0.5">Estimated</div>
                    <div className="text-sm font-bold text-[var(--color-text-primary)]">
                        {label.includes('Cost') || label.includes('Monthly') ? '$' : ''}
                        {comparison.estimated.toLocaleString()}
                        {(!label.includes('Cost') && !label.includes('Monthly')) ? unit : ''}
                    </div>
                </div>

                <div className="flex-1 text-right">
                    <div className="text-[9px] text-[var(--color-text-tertiary)] uppercase font-semibold mb-0.5">Actual</div>
                    <div className="text-sm font-bold text-[var(--color-text-primary)]">
                        {label.includes('Cost') || label.includes('Monthly') ? '$' : ''}
                        {comparison.actual.toLocaleString()}
                        {(!label.includes('Cost') && !label.includes('Monthly')) ? unit : ''}
                    </div>
                </div>
            </div>

            {/* Overlapping Visual Bar */}
            <div className="relative h-2 w-full bg-[var(--color-border)]/30 rounded-full overflow-hidden">
                {/* Actual Bar (Background-ish) */}
                <div
                    className="absolute inset-y-0 left-0 bg-[var(--color-text-tertiary)]/20 rounded-full transition-all duration-1000"
                    style={{ width: `${actWidth}%` }}
                />
                {/* Estimate Bar (Foreground) */}
                <div
                    className={`absolute inset-y-0 left-0 ${info.barColor} opacity-80 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
                    style={{ width: `${estWidth}%` }}
                />
            </div>

            <div className={`text-[10px] flex items-center justify-center gap-1.5 opacity-80 ${Math.abs(comparison.difference_percent) < 10 ? 'text-green-500' : 'text-[var(--color-text-tertiary)]'}`}>
                <div className={`h-1.5 w-1.5 rounded-full ${info.barColor}`} />
                <span>Estimate is {Math.abs(comparison.difference_percent).toFixed(1)}% {comparison.difference_percent > 0 ? 'higher' : 'lower'} than actual</span>
            </div>
        </div>
    );
}

/**
 * Metrics display component
 */
function MetricsTable({ metrics }: { metrics: ScenarioResult['metrics'] }) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Throughput</span>
                </div>
                <div className="font-bold text-[var(--color-text-primary)]">
                    {metrics.throughput_qps.toLocaleString()} QPS
                </div>
            </div>

            <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] text-xs mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>P99 Latency</span>
                </div>
                <div className="font-bold text-[var(--color-text-primary)]">
                    {Math.round(metrics.p99_latency_ms)}ms
                </div>
            </div>

            <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] text-xs mb-1">
                    <Activity className="h-3.5 w-3.5" />
                    <span>Error Rate</span>
                </div>
                <div className="font-bold text-[var(--color-text-primary)]">
                    {(metrics.error_rate * 100).toFixed(2)}%
                </div>
            </div>

            <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] text-xs mb-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>Est. Cost</span>
                </div>
                <div className="font-bold text-[var(--color-text-primary)]">
                    ${metrics.estimated_cost_monthly.toLocaleString()}/mo
                </div>
            </div>
        </div>
    );
}

/**
 * Feedback list component with color-coded items
 */
function FeedbackList({ feedback }: { feedback: string[] }) {
    const items = parseFeedback(feedback);

    const iconMap = {
        success: <CheckCircle className="h-4 w-4 text-green-500" />,
        warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
        error: <XCircle className="h-4 w-4 text-red-500" />,
        suggestion: <Lightbulb className="h-4 w-4 text-blue-500" />,
    };

    const colorMap = {
        success: 'text-green-500 bg-green-500/5',
        warning: 'text-yellow-500 bg-yellow-500/5',
        error: 'text-red-500 bg-red-500/5',
        suggestion: 'text-blue-500 bg-blue-500/5',
    };

    return (
        <ul className="space-y-1.5 mt-3">
            {items.map((item, i) => (
                <li
                    key={i}
                    className={`flex items-start gap-2 text-sm p-2 rounded-lg ${colorMap[item.type]}`}
                >
                    <span className="flex-shrink-0 mt-0.5">{iconMap[item.type]}</span>
                    <span>{item.text}</span>
                </li>
            ))}
        </ul>
    );
}

/**
 * Bottleneck visualization component
 */
function BottleneckDisplay({ bottlenecks, spof }: { bottlenecks: string[]; spof: string[] }) {
    if (bottlenecks.length === 0 && spof.length === 0) return null;

    return (
        <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20 mt-4">
            <h4 className="text-sm font-semibold text-red-500 mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Issues Detected
            </h4>

            {bottlenecks.length > 0 && (
                <div className="mb-3">
                    <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Bottlenecks</p>
                    <div className="flex flex-wrap gap-2">
                        {bottlenecks.map((b, i) => (
                            <span key={i} className="px-2 py-1 bg-red-500/10 text-red-500 text-xs rounded-md font-medium">
                                {b}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {spof.length > 0 && (
                <div>
                    <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">Single Points of Failure</p>
                    <div className="flex flex-wrap gap-2">
                        {spof.map((s, i) => (
                            <span key={i} className="px-2 py-1 bg-orange-500/10 text-orange-500 text-xs rounded-md font-medium">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function ResultsPanel() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [expandedScenario, setExpandedScenario] = useState<number | null>(0);

    const isResultsPanelOpen = useSimulationStore((state) => state.isResultsPanelOpen);
    const closeResultsPanel = useSimulationStore((state) => state.closeResultsPanel);
    const reset = useSimulationStore((state) => state.reset);
    const results = useSimulationStore((state) => state.results);
    const totalScore = useSimulationStore((state) => state.totalScore);
    const gradingResult = useSimulationStore((state) => state.gradingResult);
    const estimationComparison = useSimulationStore((state) => state.estimationComparison);
    const status = useSimulationStore((state) => state.status);
    const progress = useSimulationStore((state) => state.progress);
    const currentScenario = useSimulationStore((state) => state.currentScenario);
    const error = useSimulationStore((state) => state.error);

    const setBottlenecks = useFlowAnimation((state) => state.setBottlenecks);
    const setConnectionHealth = useFlowAnimation((state) => state.setConnectionHealth);
    const setConnectionReasons = useFlowAnimation((state) => state.setConnectionReasons);

    useEffect(() => {
        if (status === SimulationStatus.COMPLETED && results && results.length > 0) {
            const allBottlenecks = results.flatMap(r => r.metrics.bottlenecks || []);
            const allSpof = results.flatMap(r => r.metrics.single_points_of_failure || []);
            const issues = new Set([...allBottlenecks, ...allSpof]);
            const reasonsMap: Record<string, string> = {};

            // Map bottlenecks to their descriptions if any
            allBottlenecks.forEach(b => {
                reasonsMap[b] = `Bottleneck detected at ${b}`;
            });
            allSpof.forEach(s => {
                reasonsMap[s] = `Single point of failure: ${s}`;
            });

            setBottlenecks(Array.from(issues));

            // Also check grading results for failed requirements to highlight source/client
            if (gradingResult) {
                gradingResult.checks.forEach(check => {
                    if (!check.passed) {
                        const req = check.requirement.toLowerCase();
                        const reason = `Requirement Failed: ${check.requirement}. ${check.details || ''}`;

                        // If any load/qps/latency/error requirement fails, the Client is usually a good culprit to highlight red
                        if (req.includes('qps') || req.includes('throughput') || req.includes('load') || req.includes('latency') || req.includes('error')) {
                            issues.add('Client');
                            reasonsMap['Client'] = reason;
                            issues.add('client');
                            reasonsMap['client'] = reason;
                            issues.add('User');
                            reasonsMap['User'] = reason;
                            issues.add('user');
                            reasonsMap['user'] = reason;
                            issues.add('App Server');
                            reasonsMap['App Server'] = reason;
                        }

                        // If requirement names a specific component, add it
                        const words = check.requirement.split(' ');
                        words.forEach(word => {
                            if (word.length > 3) {
                                issues.add(word);
                                if (!reasonsMap[word]) reasonsMap[word] = reason;
                            }
                        });
                    }
                });
            }

            // Heuristic to color connections
            const api = (window as any).excalidrawAPI;
            const elements = api ? api.getSceneElements() : useDesignStore.getState().elements;
            const healthMap: Record<string, 'good' | 'stressed' | 'failed'> = {};

            // We only care about arrows (connections)
            const arrows = elements.filter((el: any) => (el as any).type === 'arrow' || isSystemConnection(el as any));

            const getComponentIssue = (id: string | undefined): string | null => {
                if (!id) return null;
                if (issues.has(id)) return id;

                const el = elements.find((e: any) => e.id === id);
                if (!el) return null;

                // Helper to clean names (strip icons, lower case)
                const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();

                // Check by name (bound text)
                const boundTextId = (el as any).boundElements?.find((b: any) => b.type === 'text')?.id;
                if (boundTextId) {
                    const textEl = elements.find((e: any) => e.id === boundTextId);
                    const text = (textEl as any)?.text;
                    if (text) {
                        const cleanedText = clean(text);
                        // Check if any issue name matches
                        for (const issue of issues) {
                            const cleanedIssue = clean(issue);
                            if (cleanedText.includes(cleanedIssue) || cleanedIssue.includes(cleanedText)) return issue;
                        }
                    }
                }

                // Check by component type
                if (isSystemComponent(el as any)) {
                    const type = (el as any).customData?.componentType;
                    if (type) {
                        const cleanedType = clean(type);
                        for (const issue of issues) {
                            const cleanedIssue = clean(issue);
                            if (cleanedIssue === cleanedType || cleanedIssue.includes(cleanedType) || cleanedType.includes(cleanedIssue)) return issue;
                        }
                    }

                    // Explicitly check for client type if client-related requirements failed
                    if ((el as any).customData?.componentType === 'client' && (issues.has('Client') || issues.has('client'))) {
                        return issues.has('Client') ? 'Client' : 'client';
                    }
                }

                return null;
            };

            const connectionReasons: Record<string, string> = {};

            arrows.forEach((arrow: any) => {
                const startId = (arrow as any).startBinding?.elementId;
                const endId = (arrow as any).endBinding?.elementId;

                const arrowIssue = issues.has(arrow.id) ? arrow.id : null;
                const startIssue = getComponentIssue(startId);
                const endIssue = getComponentIssue(endId);

                if (arrowIssue || startIssue || endIssue) {
                    healthMap[arrow.id] = 'failed';
                    const matchedIssue = arrowIssue || startIssue || endIssue;
                    const reason = reasonsMap[matchedIssue!] || "System issue detected";
                    connectionReasons[arrow.id] = reason;
                } else {
                    healthMap[arrow.id] = 'good';
                }
            });

            setConnectionHealth(healthMap);
            setConnectionReasons(connectionReasons);
        } else if (status === SimulationStatus.PENDING || status === null) {
            setBottlenecks([]);
            setConnectionHealth({});
            setConnectionReasons({});
        }
    }, [results, status, gradingResult, setBottlenecks, setConnectionHealth, setConnectionReasons]);

    if (!isResultsPanelOpen) return null;

    // Collect all bottlenecks and SPOFs from results
    const allBottlenecks = results?.flatMap(r => r.metrics.bottlenecks || []) || [];
    const allSpof = results?.flatMap(r => r.metrics.single_points_of_failure || []) || [];
    const uniqueBottlenecks = [...new Set(allBottlenecks)];
    const uniqueSpof = [...new Set(allSpof)];

    // Loading State
    if (status === SimulationStatus.RUNNING || status === SimulationStatus.PENDING) {
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-panel-bg)] border-t border-[var(--color-border)] shadow-2xl z-[70] transition-all duration-300">
                <div className="p-8 flex flex-col items-center justify-center">
                    <div className="relative w-20 h-20 mb-4">
                        <div className="absolute inset-0 border-4 border-t-[var(--color-primary)] border-[var(--color-border)] rounded-full animate-spin"></div>
                        <div className="absolute inset-2 border-4 border-b-[var(--color-primary-light)] border-[var(--color-border)] rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                    </div>
                    <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">Running Simulation...</h3>
                    <p className="text-[var(--color-text-secondary)] mb-4">
                        {currentScenario ? `Testing: ${currentScenario}` : 'Preparing scenarios...'}
                    </p>
                    <div className="w-64 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{progress}% complete</p>
                </div>
            </div>
        );
    }

    // Error State
    if (status === SimulationStatus.FAILED || error) {
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-panel-bg)] border-t border-red-500/30 shadow-2xl z-[70] p-6 transition-all duration-300">
                <div className="max-w-4xl mx-auto">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-500/10 rounded-full">
                                <XCircle className="h-6 w-6 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">Simulation Failed</h3>
                                <p className="text-[var(--color-text-secondary)] text-sm">{error || 'Unknown error occurred'}</p>
                            </div>
                        </div>
                        <button onClick={closeResultsPanel} className="p-2 hover:bg-[var(--color-surface)] rounded-full transition-colors">
                            <X className="h-5 w-5 text-[var(--color-text-secondary)]" />
                        </button>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => { reset(); closeResultsPanel(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }


    // Collapsed state: compact pill at bottom-center so it doesn't block the entire bottom
    if (isCollapsed) {
        return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-auto max-w-sm h-12 flex items-center bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-full shadow-lg z-[70] transition-all duration-300">
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="w-full h-full px-5 py-2 flex items-center justify-between gap-3 hover:bg-[var(--color-surface)] rounded-full transition-colors"
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <h2 className="text-sm font-bold text-[var(--color-text-primary)] truncate">Simulation Results</h2>
                        {totalScore !== null && (
                            <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold border ${(gradingResult?.checks.some(c => !c.passed))
                                ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                : getScoreColorClass(totalScore)
                                }`}>
                                Score: {totalScore}/100
                            </span>
                        )}
                    </div>
                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                </button>
            </div>
        );
    }

    // Full Results State
    return (
        <div className="fixed bottom-0 left-0 right-0 h-[85vh] md:h-[520px] bg-[var(--color-panel-bg)] border-t border-[var(--color-border)] shadow-2xl z-[70] flex flex-col transition-all duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Simulation Results</h2>
                    {totalScore !== null && (
                        <span className={`px-3 py-1 rounded-full text-sm font-bold border ${(gradingResult?.checks.some(c => !c.passed))
                            ? 'bg-red-500/10 text-red-500 border-red-500/30'
                            : getScoreColorClass(totalScore)
                            }`}>
                            Score: {totalScore}/100
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsCollapsed(true)}
                        className="p-2 hover:bg-[var(--color-bg-secondary)] rounded-full transition-colors"
                        title="Collapse"
                    >
                        <ChevronDown className="h-5 w-5 text-[var(--color-text-secondary)]" />
                    </button>
                    <button
                        onClick={closeResultsPanel}
                        className="p-2 hover:bg-[var(--color-bg-secondary)] rounded-full transition-colors"
                        title="Close"
                    >
                        <X className="h-5 w-5 text-[var(--color-text-secondary)]" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left Column: Scenarios */}
                    <div className="lg:col-span-2 space-y-4">
                        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Scenarios</h3>

                        {results?.map((res, idx) => (
                            <div
                                key={idx}
                                className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] overflow-hidden"
                            >
                                {/* Scenario Header */}
                                <button
                                    onClick={() => setExpandedScenario(expandedScenario === idx ? null : idx)}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface)] transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <ScenarioStatusIcon result={res} />
                                        <h4 className="font-medium text-[var(--color-text-primary)]">
                                            {res.scenario.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </h4>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-mono text-[var(--color-text-tertiary)]">
                                            {res.score}/{res.max_score} pts
                                        </span>
                                        {expandedScenario === idx ? (
                                            <ChevronUp className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                                        )}
                                    </div>
                                </button>

                                {/* Expanded Content */}
                                {expandedScenario === idx && (
                                    <div className="px-4 pb-4 border-t border-[var(--color-border)]">
                                        <MetricsTable metrics={res.metrics} />
                                        {res.feedback && res.feedback.length > 0 && (
                                            <FeedbackList feedback={res.feedback} />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Bottlenecks & SPOFs */}
                        <BottleneckDisplay bottlenecks={uniqueBottlenecks} spof={uniqueSpof} />
                    </div>

                    {/* Right Column: Grading & Actions */}
                    <div className="space-y-4">
                        {/* Requirements Grading */}
                        {gradingResult && (
                            <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-[var(--color-border)]">
                                <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                                    Requirements Check
                                </h3>
                                <div className="space-y-2">
                                    {gradingResult.checks.map((check, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-sm p-2 rounded hover:bg-[var(--color-surface)] transition-colors">
                                            <span className="text-[var(--color-text-primary)] truncate mr-2" title={check.details}>{check.requirement}</span>
                                            {check.passed ? (
                                                <span className="text-green-500 flex items-center gap-1 text-xs font-medium bg-green-500/10 px-2 py-0.5 rounded flex-shrink-0">
                                                    <CheckCircle className="h-3 w-3" /> Pass
                                                </span>
                                            ) : (
                                                <span className="text-red-500 flex items-center gap-1 text-xs font-medium bg-red-500/10 px-2 py-0.5 rounded flex-shrink-0">
                                                    <XCircle className="h-3 w-3" /> Fail
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Estimation Accuracy */}
                        {estimationComparison && (
                            <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-[var(--color-border)]">
                                <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                                    Estimation Accuracy
                                </h3>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-bold text-[var(--color-primary)]">
                                            {estimationComparison.accuracy_score}%
                                        </span>
                                        <span className="text-xs text-[var(--color-text-tertiary)] uppercase font-bold letter-spacing-[0.05em]">Accuracy Score</span>
                                    </div>

                                    {estimationComparison.bonus_points > 0 && (
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-full border border-amber-500/20 animate-pulse">
                                            <Crown className="h-4 w-4" />
                                            <span className="text-xs font-bold">+{estimationComparison.bonus_points} Bonus Points</span>
                                        </div>
                                    )}
                                </div>
                                <div className="h-2 w-full bg-[var(--color-border)] rounded-full overflow-hidden mb-6">
                                    <div
                                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] rounded-full transition-all duration-1000"
                                        style={{ width: `${estimationComparison.accuracy_score}%` }}
                                    />
                                </div>

                                <div className="mt-6 space-y-4">
                                    <ComparisonRow
                                        label="Throughput"
                                        comparison={estimationComparison.throughput}
                                        unit=" QPS"
                                    />
                                    <ComparisonRow
                                        label="P99 Latency"
                                        comparison={estimationComparison.latency}
                                        unit="ms"
                                    />
                                    <ComparisonRow
                                        label="Monthly Cost"
                                        comparison={estimationComparison.cost}
                                        unit="$"
                                    />
                                </div>

                                {estimationComparison.bonus_points > 0 && (
                                    <p className="text-xs text-green-500 mt-4 text-center font-medium bg-green-500/10 py-1 rounded-full">
                                        +{estimationComparison.bonus_points} bonus points awarded!
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="space-y-2">
                            <button
                                onClick={() => { reset(); closeResultsPanel(); }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors font-medium"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Try Again
                            </button>

                            <button
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
                                title="Available with Premium"
                            >
                                <Crown className="h-4 w-4" />
                                View Optimal Solution
                            </button>

                            <button
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors font-medium"
                            >
                                Next Problem
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

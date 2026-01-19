'use client';

import { X, CheckCircle, XCircle, AlertTriangle, TrendingUp, Activity, DollarSign, Clock } from 'lucide-react';
import { useSimulationStore } from '@/stores/simulationStore';
import { SimulationStatus } from '@/lib/types/design';

export function ResultsPanel() {
    const isResultsPanelOpen = useSimulationStore((state) => state.isResultsPanelOpen);
    const closeResultsPanel = useSimulationStore((state) => state.closeResultsPanel);
    const results = useSimulationStore((state) => state.results);
    const totalScore = useSimulationStore((state) => state.totalScore);
    const gradingResult = useSimulationStore((state) => state.gradingResult);
    const estimationComparison = useSimulationStore((state) => state.estimationComparison);
    const status = useSimulationStore((state) => state.status);
    const error = useSimulationStore((state) => state.error);

    if (!isResultsPanelOpen) return null;

    // Loading State
    if (status === SimulationStatus.RUNNING || status === SimulationStatus.PENDING) {
        return (
            <div className="fixed bottom-0 left-0 right-0 h-96 bg-[var(--color-panel-bg)] border-t border-[var(--color-border)] shadow-2xl z-[70] flex flex-col items-center justify-center p-8 transition-transform duration-300 transform translate-y-0">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-t-[var(--color-primary)] border-[var(--color-border)] rounded-full animate-spin"></div>
                    <h3 className="text-xl font-semibold text-[var(--color-text-primary)]">Running Simulation...</h3>
                    <p className="text-[var(--color-text-secondary)]">Testing your system design against various scenarios</p>
                </div>
            </div>
        );
    }

    // Error State
    if (status === SimulationStatus.FAILED || error) {
        return (
            <div className="fixed bottom-0 left-0 right-0 h-auto min-h-[200px] bg-[var(--color-panel-bg)] border-t border-red-500/20 shadow-2xl z-[70] p-6 transition-transform duration-300">
                <div className="max-w-4xl mx-auto">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2 text-red-500">
                            <XCircle className="h-6 w-6" />
                            <h3 className="text-xl font-semibold">Simulation Failed</h3>
                        </div>
                        <button onClick={closeResultsPanel} className="p-1 hover:bg-[var(--color-surface)] rounded-full transition-colors">
                            <X className="h-5 w-5 text-[var(--color-text-secondary)]" />
                        </button>
                    </div>
                    <p className="text-[var(--color-text-primary)]">{error || 'Unknown error occurred during simulation.'}</p>
                </div>
            </div>
        );
    }

    // Results State
    return (
        <div className="fixed bottom-0 left-0 right-0 h-[500px] bg-[var(--color-panel-bg)] border-t border-[var(--color-border)] shadow-2xl z-[70] flex flex-col transition-transform duration-300 transform translate-y-0">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Simulation Results</h2>
                    {totalScore !== null && (
                        <span className={`
                            px-3 py-1 rounded-full text-sm font-bold
                            ${totalScore >= 90 ? 'bg-green-500/10 text-green-500' :
                                totalScore >= 70 ? 'bg-yellow-500/10 text-yellow-500' :
                                    'bg-red-500/10 text-red-500'}
                        `}>
                            Score: {totalScore}/100
                        </span>
                    )}
                </div>
                <button onClick={closeResultsPanel} className="p-2 hover:bg-[var(--color-bg-secondary)] rounded-full transition-colors">
                    <X className="h-5 w-5 text-[var(--color-text-secondary)]" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Left Column: Scenarios & Grading */}
                    <div className="space-y-6">
                        {/* Scenarios List */}
                        <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-[var(--color-border)]">
                            <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3 uppercase tracking-wider">Scenarios</h3>
                            <div className="space-y-3">
                                {results?.map((res, idx) => (
                                    <div key={idx} className="flex items-start gap-3 p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                                        {res.passed ? (
                                            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                        ) : (
                                            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <h4 className="font-medium text-[var(--color-text-primary)]">{res.scenario}</h4>
                                                <span className="text-xs font-mono text-[var(--color-text-tertiary)]">{res.score}/{res.max_score} pts</span>
                                            </div>
                                            {/* Metrics Mini-Grid */}
                                            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-secondary)] mt-2 bg-[var(--color-bg-secondary)]/50 p-2 rounded">
                                                <div className="flex items-center gap-1">
                                                    <TrendingUp className="h-3 w-3" /> QPS: {res.metrics.throughput_qps.toLocaleString()}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> Latency: {Math.round(res.metrics.p95_latency_ms)}ms (P95)
                                                </div>
                                            </div>
                                            {/* Feedback */}
                                            {res.feedback && res.feedback.length > 0 && (
                                                <ul className="mt-2 text-xs text-amber-500/80 list-disc list-inside">
                                                    {res.feedback.map((fb, i) => <li key={i}>{fb}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Grading & Estimates */}
                    <div className="space-y-6">
                        {/* Requirements Grading */}
                        {gradingResult && (
                            <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-[var(--color-border)]">
                                <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3 uppercase tracking-wider">Requirements Check</h3>
                                <div className="space-y-2">
                                    {gradingResult.checks.map((check, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-sm p-2 rounded hover:bg-[var(--color-surface)] transition-colors">
                                            <span className="text-[var(--color-text-primary)]">{check.requirement}</span>
                                            {check.passed ? (
                                                <span className="text-green-500 flex items-center gap-1 text-xs font-medium bg-green-500/10 px-2 py-0.5 rounded">
                                                    <CheckCircle className="h-3 w-3" /> Pass
                                                </span>
                                            ) : (
                                                <span className="text-red-500 flex items-center gap-1 text-xs font-medium bg-red-500/10 px-2 py-0.5 rounded">
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
                                <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] mb-3 uppercase tracking-wider">Estimation Accuracy</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-[var(--color-text-secondary)]">Accuracy Score</span>
                                        <span className="font-bold text-[var(--color-primary)]">{estimationComparison.accuracy_score}/100</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-[var(--color-border)] rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-[var(--color-primary)] rounded-full"
                                            style={{ width: `${estimationComparison.accuracy_score}%` }}
                                        />
                                    </div>
                                    {/* Detailed breakdown could go here */}
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

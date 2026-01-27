'use client';

import { useState } from 'react';
import { X, TrendingUp, Clock, DollarSign, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { UserEstimates } from '@/lib/types/design';

interface EstimationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (estimates: UserEstimates | null) => void;
}

export function EstimationModal({ isOpen, onClose, onConfirm }: EstimationModalProps) {
    const [qps, setQps] = useState<string>('');
    const [latency, setLatency] = useState<string>('');
    const [cost, setCost] = useState<string>('');

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm({
            max_throughput_qps: parseFloat(qps) || 0,
            expected_p99_latency_ms: parseFloat(latency) || 0,
            estimated_cost_monthly: parseFloat(cost) || 0,
        });
    };

    const handleSkip = () => {
        onConfirm(null);
    };

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div className="bg-[var(--color-surface-elevated)] w-full max-w-md rounded-2xl border border-[var(--color-border)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Performance Estimation</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-text-primary)] text-sm shadow-inner">
                        <Info className="h-5 w-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                        <p className="leading-relaxed opacity-90">
                            Predict how your system will perform under load. We'll compare your estimates with actual results to grade your intuition.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Input
                            label="Max Throughput (QPS)"
                            type="number"
                            value={qps}
                            onChange={(e) => setQps(e.target.value)}
                            placeholder="e.g. 5000"
                            className="bg-[var(--color-canvas-bg)]"
                            id="est-qps"
                        />

                        <Input
                            label="Expected P99 Latency (ms)"
                            type="number"
                            value={latency}
                            onChange={(e) => setLatency(e.target.value)}
                            placeholder="e.g. 200"
                            className="bg-[var(--color-canvas-bg)]"
                            id="est-latency"
                        />

                        <Input
                            label="Estimated Monthly Cost ($)"
                            type="number"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                            placeholder="e.g. 1500"
                            className="bg-[var(--color-canvas-bg)]"
                            id="est-cost"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[var(--color-panel-bg)]/50 border-t border-[var(--color-border)] flex items-center justify-between gap-3">
                    <button
                        onClick={handleSkip}
                        className="text-sm font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                        Skip for now
                    </button>
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={!qps && !latency && !cost}
                        >
                            Run Simulation
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

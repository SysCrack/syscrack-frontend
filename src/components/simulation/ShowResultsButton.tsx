'use client';

import { BarChart2 } from 'lucide-react';
import { useSimulationStore } from '@/stores/simulationStore';
import { SimulationStatus } from '@/lib/types/design';

export function ShowResultsButton() {
    const status = useSimulationStore((state) => state.status);
    const openResultsPanel = useSimulationStore((state) => state.openResultsPanel);
    const isResultsPanelOpen = useSimulationStore((state) => state.isResultsPanelOpen);

    // Only show if completed and panel is currently closed
    if (status !== SimulationStatus.COMPLETED || isResultsPanelOpen) {
        return null;
    }

    return (
        <button
            onClick={openResultsPanel}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary)] transition-all shadow-sm cursor-pointer"
        >
            <BarChart2 className="h-4 w-4" />
            Results
        </button>
    );
}

import { NextResponse } from 'next/server';
import { captureBaseline } from '@/lib/simulation/baselineCapture';

/**
 * GET /api/baseline-capture
 *
 * Runs S1-S10 scenarios with the current flat trace model and returns
 * the baseline JSON. Use before implementing DAG model, then compare
 * after implementation to verify no regressions.
 */
export async function GET() {
    try {
        const baseline = captureBaseline();
        return NextResponse.json(baseline, {
            headers: {
                'Content-Disposition': 'attachment; filename="baseline-traces.json"',
            },
        });
    } catch (err) {
        console.error('Baseline capture failed:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Baseline capture failed' },
            { status: 500 },
        );
    }
}

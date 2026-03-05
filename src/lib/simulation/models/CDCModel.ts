import type { CanvasNode } from '@/lib/types/canvas';

export class CDCModel {
    public changeEventsCaptured = 0;
    public changeEventsEmitted = 0;

    constructor(private node: CanvasNode) {}

    getCaptureLatencyMs(): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        return (c.captureLatencyMs as number) ?? 200;
    }

    getCaptureMode(): string {
        const c = this.node.specificConfig as Record<string, unknown>;
        return (c.captureMode as string) ?? 'log-tail';
    }

    getWriteOverheadMultiplier(): number {
        switch (this.getCaptureMode()) {
            case 'trigger-based':
                return 1.1;
            case 'timestamp-polling':
                return 1.02;
            default:
                return 1.0;
        }
    }

    includesDeletes(): boolean {
        const c = this.node.specificConfig as Record<string, unknown>;
        return (c.includeDeletes as boolean) ?? true;
    }

    recordCapture(count: number): void {
        this.changeEventsCaptured += count;
    }

    recordEmit(count: number): void {
        this.changeEventsEmitted += count;
    }
}

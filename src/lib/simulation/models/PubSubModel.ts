import type { CanvasNode } from '@/lib/types/canvas';

export class PubSubModel {
    public messagesPublished = 0;
    public totalFanOutDeliveries = 0;

    constructor(private node: CanvasNode) {}

    getSubscriberGroupCount(): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        const raw = (c.subscriberGroupCount as number) ?? 2;
        return Math.max(1, raw);
    }

    getPublishLatencyMs(): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        const engine = (c.engine as string) ?? 'kafka';
        const base: Record<string, number> = {
            kafka: 2,
            'google-pubsub': 3,
            'sns-sqs': 5,
        };
        return base[engine] ?? 3;
    }

    getThroughputMultiplier(): number {
        const c = this.node.specificConfig as Record<string, unknown>;
        return (c.orderingEnabled as boolean) ? 0.5 : 1.0;
    }

    recordPublish(fanOutCount: number): void {
        this.messagesPublished += 1;
        this.totalFanOutDeliveries += Math.max(0, fanOutCount);
    }
}


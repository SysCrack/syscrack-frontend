import { ComponentType } from '@/lib/types/design';

/**
 * Calculates the monthly cost for a single component based on its configuration
 */
export function calculateComponentCost(type: string, config: Record<string, any>): number {
    switch (type) {
        case ComponentType.LOAD_BALANCER:
            // Base $50 + extra for L7 routing
            return 50 + (config.layer === 'L7' ? 25 : 0);

        case ComponentType.DATABASE:
            // Base cost per instance type + storage cost
            const dbInstanceCosts: Record<string, number> = {
                'db.t3.medium': 100,
                'db.m5.large': 500,
                'db.m5.xlarge': 1000,
                'postgres': 400, // Default fallback
                'mysql': 350,
                'mongodb': 550,
                'cassandra': 750,
                'elasticsearch': 800,
                'timescaledb': 500
            };
            const engine = (config.engine as string) || 'postgres';
            const baseDbCost = dbInstanceCosts[engine] || 400;
            const storageCost = (config.storage_gb || 100) * 0.10;
            const replicas = (config.read_replicas || 0);
            return (baseDbCost + storageCost) * (1 + replicas);

        case ComponentType.CACHE:
            // $12.50 per GB
            const memoryCost = (config.memory_gb || 16) * 12.50;
            const clusterMultiplier = config.cluster_mode ? 1.5 : 1.0;
            return memoryCost * clusterMultiplier;

        case ComponentType.APP_SERVER:
            // $80 per instance + CPU multiplier
            const instances = (config.instances || 1);
            const cpuMultiplier = (config.cpu_cores || 2) / 2; // 1 core = 0.5x, 2 core = 1x, etc.
            return (instances * 80) * cpuMultiplier;

        case ComponentType.MESSAGE_QUEUE:
            // Base $300 + partition cost for Kafka
            const baseMqCost = 300;
            const partitionCost = config.type === 'kafka' ? (config.partitions || 1) * 10 : 0;
            return baseMqCost + partitionCost;

        case ComponentType.CDN:
            // Usage based estimate (~$0.08/GB) - modeling as fixed for dashboard
            const edgeMultiplier = config.origin_shield ? 1.2 : 1.0;
            return 100 * edgeMultiplier; // Simplified estimate

        case ComponentType.OBJECT_STORAGE:
            // Usage based (~$0.023/GB) - modeling as fixed
            const storageGb = config.storage_gb || 1000; // Default 1TB
            return storageGb * 0.023;

        case ComponentType.CLIENT:
            return 0; // Browsers are free :)

        default:
            return 0;
    }
}

/**
 * Calculates total cost of all components in a scene
 */
export function calculateTotalDesignCost(elements: any[]): number {
    return elements.reduce((total, el) => {
        if (el.customData?.isSystemComponent) {
            return total + calculateComponentCost(
                el.customData.componentType,
                el.customData.componentConfig || {}
            );
        }
        return total;
    }, 0);
}

/**
 * Formats a number as a USD monthly cost
 */
export function formatCost(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount) + '/mo';
}

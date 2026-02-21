/**
 * ComponentModel — abstract base class for all simulation component models.
 *
 * Ported from Python `simulation/components/base.py`.
 * Each model calculates performance metrics based on incoming load.
 */
import type { SimulationState } from './types';
import { defaultState } from './types';
import type { CanvasNode } from '@/lib/types/canvas';

export abstract class ComponentModel {
    readonly node: CanvasNode;
    state: SimulationState;

    constructor(node: CanvasNode) {
        this.node = node;
        this.state = defaultState();
    }

    /** Calculate new state based on incoming load. */
    abstract processRequest(loadQps: number, concurrentConnections: number): SimulationState;

    /** Estimate the maximum QPS this component can handle. */
    abstract maxCapacityQps(): number;

    /** Human-readable name for diagnostics. */
    get name(): string {
        return this.node.name;
    }

    /** Component type string. */
    get type(): string {
        return this.node.type;
    }
}

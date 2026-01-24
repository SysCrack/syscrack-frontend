/**
 * Scene Parser - Converts Excalidraw elements to API format
 * 
 * This module extracts system design components and connections
 * from Excalidraw canvas elements based on customData markers.
 */
import { v4 as uuidv4 } from 'uuid';
import type {
    ComponentCreate,
    ConnectionCreate,
    ComponentType,
    Protocol,
} from '@/lib/types/design';

// Type for Excalidraw element (simplified)
interface ExcalidrawElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    customData?: Record<string, unknown>;
    boundElements?: readonly { type: string; id: string }[] | null;
    startBinding?: { elementId: string } | null;
    endBinding?: { elementId: string } | null;
}

// Custom data structure for system components
export interface SystemComponentData {
    isSystemComponent: true;
    componentType: ComponentType;
    componentConfig: Record<string, unknown>;
}

// Custom data structure for system connections
export interface SystemConnectionData {
    isSystemConnection: true;
    protocol: Protocol;
    throughput_qps?: number;
}

/**
 * Check if an element is a system component
 */
export function isSystemComponent(element: ExcalidrawElement): boolean {
    return element.customData?.isSystemComponent === true;
}

/**
 * Check if an element is a system connection (arrow)
 */
export function isSystemConnection(element: ExcalidrawElement): boolean {
    return (
        element.type === 'arrow' &&
        element.customData?.isSystemConnection === true
    );
}

/**
 * Extract component name from bound text elements
 */
export function extractComponentName(
    element: ExcalidrawElement,
    allElements: readonly ExcalidrawElement[]
): string {
    // Look for bound text elements
    const boundText = element.boundElements?.find(b => b.type === 'text');
    if (boundText) {
        const textElement = allElements.find(e => e.id === boundText.id);
        if (textElement && 'text' in textElement) {
            return (textElement as { text: string }).text;
        }
    }

    // Fallback: use component type as name
    const data = element.customData as SystemComponentData | undefined;
    return data?.componentType || 'Component';
}

/**
 * Parse result structure
 */
export interface ParsedDesign {
    components: ComponentCreate[];
    connections: ConnectionCreate[];
    canvas_data: {
        elements: readonly ExcalidrawElement[];
        appState?: Record<string, unknown>;
    };
    warnings: string[];
}

/**
 * Parse Excalidraw scene to extract system design
 */
export function parseExcalidrawScene(
    elements: readonly ExcalidrawElement[],
    appState?: Record<string, unknown>
): ParsedDesign {
    const components: ComponentCreate[] = [];
    const connections: ConnectionCreate[] = [];
    const warnings: string[] = [];

    // Map Excalidraw ID -> Backend UUID
    const idMapping = new Map<string, string>();

    // First pass: Create UUIDs for valid system components
    for (const element of elements) {
        if (isSystemComponent(element)) {
            // Generate a deterministic UUID if possible, or just a new one?
            // For saving/loading to work, we might want to be careful.
            // If we load from backend, we get UUIDs. If we send them back, they are UUIDs.
            // If we create new ones in Excalidraw, they are short strings.

            // Check if element.id is already a UUID (from a previous load)
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(element.id);
            const backendId = isUUID ? element.id : uuidv4();

            idMapping.set(element.id, backendId);
        }
    }

    // Extract components
    for (const element of elements) {
        if (isSystemComponent(element)) {
            const data = element.customData as unknown as SystemComponentData;
            const backendId = idMapping.get(element.id)!;

            components.push({
                id: backendId, // Send valid UUID
                type: data.componentType,
                name: extractComponentName(element, elements),
                config: data.componentConfig || {},
                position: { x: element.x, y: element.y },
            });
        }
    }

    // Extract connections (arrows between components)
    for (const element of elements) {
        if (element.type === 'arrow') {
            const sourceExcalidrawId = element.startBinding?.elementId;
            const targetExcalidrawId = element.endBinding?.elementId;

            // Check if arrow connects two system components
            if (sourceExcalidrawId && targetExcalidrawId &&
                idMapping.has(sourceExcalidrawId) && idMapping.has(targetExcalidrawId)) {

                const connData = element.customData as SystemConnectionData | undefined;

                // Also ensure connection ID is UUID if provided (though backend generates it usually)
                // We'll let backend generate connection IDs for new ones

                connections.push({
                    // id: element.id, // Don't send Excalidraw ID for connection likely
                    source_id: idMapping.get(sourceExcalidrawId)!,
                    target_id: idMapping.get(targetExcalidrawId)!,
                    protocol: connData?.protocol || 'http',
                    throughput_qps: connData?.throughput_qps,
                });
            } else if (sourceExcalidrawId || targetExcalidrawId) {
                // ... waring logic
                if (element.customData?.isSystemConnection) {
                    warnings.push(`Connection ${element.id} is not fully connected`);
                }
            }
        }
    }

    // Add warnings for orphaned components (using backend IDs logic matches excalidraw logic implicitly)
    const connectedComponents = new Set<string>();
    for (const conn of connections) {
        connectedComponents.add(conn.source_id);
        connectedComponents.add(conn.target_id);
    }

    for (const comp of components) {
        if (!connectedComponents.has(comp.id!) && comp.type !== 'client') {
            warnings.push(`Component "${comp.name}" is not connected to any other component`);
        }
    }

    return {
        components,
        connections,
        canvas_data: { elements, appState },
        warnings,
    };
}

/**
 * Create customData for a new system component
 */
export function createComponentCustomData(
    componentType: ComponentType,
    config: Record<string, unknown> = {}
): SystemComponentData {
    return {
        isSystemComponent: true,
        componentType,
        componentConfig: config,
    };
}

/**
 * Create customData for a new system connection
 */
export function createConnectionCustomData(
    protocol: Protocol = 'http',
    throughput_qps?: number
): SystemConnectionData {
    return {
        isSystemConnection: true,
        protocol,
        throughput_qps,
    };
}

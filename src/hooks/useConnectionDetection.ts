'use client';

import { useCallback, useRef, useEffect } from 'react';
import { isSystemComponent } from '@/lib/utils/sceneParser';

// Simplified types matching Excalidraw structure
interface ExcalidrawElement {
    id: string;
    type: string;
    x: number;
    y: number;
    isDeleted?: boolean;
    customData?: Record<string, unknown>;
    startBinding?: { elementId: string } | null;
    endBinding?: { elementId: string } | null;
}

export interface NewConnectionInfo {
    arrowId: string;
    sourceId: string;
    targetId: string;
    sourceElement: ExcalidrawElement;
    targetElement: ExcalidrawElement;
}

interface UseConnectionDetectionOptions {
    elements: readonly ExcalidrawElement[];
    onNewConnection?: (connection: NewConnectionInfo) => void;
}

/**
 * Hook to detect newly created connections between system components.
 * Triggers a callback when an arrow is drawn between two components
 * and hasn't been configured yet.
 */
export function useConnectionDetection({
    elements,
    onNewConnection
}: UseConnectionDetectionOptions) {
    // Track which arrows we've already processed
    const processedArrowsRef = useRef<Set<string>>(new Set());

    // Track elements for lookup
    const elementsMapRef = useRef<Map<string, ExcalidrawElement>>(new Map());

    // Update elements map whenever elements change
    useEffect(() => {
        const map = new Map<string, ExcalidrawElement>();
        for (const el of elements) {
            if (!el.isDeleted) {
                map.set(el.id, el);
            }
        }
        elementsMapRef.current = map;
    }, [elements]);

    // Detect new connections
    const checkForNewConnections = useCallback(() => {
        const elementsMap = elementsMapRef.current;

        for (const element of elements) {
            // Skip non-arrows and deleted elements
            if (element.type !== 'arrow' || element.isDeleted) {
                continue;
            }

            // Skip already processed arrows
            if (processedArrowsRef.current.has(element.id)) {
                continue;
            }

            // Skip arrows that are already configured
            if (element.customData?.isSystemConnection) {
                processedArrowsRef.current.add(element.id);
                continue;
            }

            // Check if arrow has bindings on both ends
            const sourceId = element.startBinding?.elementId;
            const targetId = element.endBinding?.elementId;

            if (!sourceId || !targetId) {
                continue; // Arrow not fully connected yet
            }

            // Check if both ends are system components
            const sourceElement = elementsMap.get(sourceId);
            const targetElement = elementsMap.get(targetId);

            if (!sourceElement || !targetElement) {
                continue;
            }

            if (!isSystemComponent(sourceElement) || !isSystemComponent(targetElement)) {
                continue; // Not connecting two system components
            }

            // This is a new connection between system components!
            processedArrowsRef.current.add(element.id);

            if (onNewConnection) {
                onNewConnection({
                    arrowId: element.id,
                    sourceId,
                    targetId,
                    sourceElement,
                    targetElement
                });
            }
        }
    }, [elements, onNewConnection]);

    // Run detection whenever elements change
    useEffect(() => {
        checkForNewConnections();
    }, [checkForNewConnections]);

    // Clean up deleted arrows from processed set
    useEffect(() => {
        const currentArrowIds = new Set(
            elements
                .filter(el => el.type === 'arrow' && !el.isDeleted)
                .map(el => el.id)
        );

        // Remove deleted arrows from processed set
        for (const id of processedArrowsRef.current) {
            if (!currentArrowIds.has(id)) {
                processedArrowsRef.current.delete(id);
            }
        }
    }, [elements]);

    return {
        /** Manually trigger connection check (useful after scene updates) */
        checkForNewConnections,
        /** Reset processed arrows (useful when loading a new design) */
        resetProcessedArrows: useCallback(() => {
            processedArrowsRef.current.clear();
        }, [])
    };
}

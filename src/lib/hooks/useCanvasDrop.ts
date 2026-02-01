'use client';

/**
 * useCanvasDrop - Hook to handle dropping components onto the Excalidraw canvas
 * 
 * Creates Excalidraw elements with customData when components are dropped.
 */
import { useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ComponentType } from '@/lib/types/design';
import {
    COMPONENT_TEMPLATES,
    getLighterColor,
    type ComponentTemplate
} from '@/lib/templates/componentTemplates';
import { createComponentCustomData } from '@/lib/utils/sceneParser';

// Excalidraw API type (simplified - using any for element types due to complex Excalidraw internals)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ExcalidrawAPI {
    getSceneElements(): readonly any[];
    updateScene(opts: { elements: any[] }): void;
    getAppState(): { scrollX: number; scrollY: number; zoom: { value: number } };
}

interface UseCanvasDropOptions {
    excalidrawAPI: ExcalidrawAPI | null;
    containerRef: React.RefObject<HTMLDivElement>;
}

interface DropData {
    type: ComponentType;
    label: string;
    icon: string;
    color: string;
    defaultConfig: Record<string, unknown>;
}

/**
 * Creates Excalidraw rectangle element for a system component
 */
function createComponentElements(
    dropData: DropData,
    canvasX: number,
    canvasY: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
    const componentId = uuidv4();
    const textId = uuidv4();

    // Rectangle element
    const rectangle = {
        id: componentId,
        type: 'rectangle',
        x: canvasX,
        y: canvasY,
        width: 140,
        height: 70,
        angle: 0,
        strokeColor: dropData.color,
        backgroundColor: getLighterColor(dropData.color, 0.2),
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: [{ type: 'text', id: textId }],
        updated: Date.now(),
        link: null,
        locked: false,
        customData: createComponentCustomData(dropData.type, dropData.defaultConfig),
    };

    // Text element (label)
    // 2024-05-21: Fixed logic to center text correctly.
    // x = rect.x + (rect.width - text.width) / 2
    // y = rect.y + (rect.height - text.height) / 2
    // rect: 140x70, text: 120x25
    const text = {
        id: textId,
        type: 'text',
        x: canvasX + 10,  // (140 - 120) / 2 = 10
        y: canvasY + 22.5, // (70 - 25) / 2 = 22.5
        width: 120,
        height: 25,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: `${dropData.icon} ${dropData.label}`,
        fontSize: 14,
        fontFamily: 1, // Virgil
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: componentId,
        originalText: `${dropData.icon} ${dropData.label}`,
        lineHeight: 1.25,
    };

    return [rectangle, text];
}

export function useCanvasDrop({ excalidrawAPI, containerRef }: UseCanvasDropOptions) {
    const handleDrop = useCallback((e: DragEvent) => {
        e.preventDefault();

        if (!excalidrawAPI || !containerRef.current) return;

        // Get drop data
        const dataStr = e.dataTransfer?.getData('application/syscrack-component');
        if (!dataStr) return;

        let dropData: DropData;
        try {
            dropData = JSON.parse(dataStr);
        } catch {
            console.error('Invalid drop data');
            return;
        }

        // Convert screen coordinates to canvas coordinates
        const rect = containerRef.current.getBoundingClientRect();
        const appState = excalidrawAPI.getAppState();

        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Account for scroll and zoom
        const canvasX = (screenX / appState.zoom.value) - appState.scrollX;
        const canvasY = (screenY / appState.zoom.value) - appState.scrollY;

        // Create elements
        const newElements = createComponentElements(dropData, canvasX, canvasY);

        // Add to scene
        const existingElements = excalidrawAPI.getSceneElements();
        excalidrawAPI.updateScene({
            elements: [...existingElements, ...newElements],
        });

        console.log(`Added ${dropData.label} component at (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)})`);
    }, [excalidrawAPI, containerRef]);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
    }, []);

    // Attach event listeners
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragover', handleDragOver);

        return () => {
            container.removeEventListener('drop', handleDrop);
            container.removeEventListener('dragover', handleDragOver);
        };
    }, [containerRef, handleDrop, handleDragOver]);
}

export default useCanvasDrop;

'use client';

import { useCallback, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useCanvasDrop } from '@/lib/hooks/useCanvasDrop';
import { useUIStore } from '@/stores/uiStore';
import { useDesignStore } from '@/stores/designStore';
import * as designsApi from '@/lib/api/designs';
import { parseExcalidrawScene, isSystemConnection, SystemConnectionData } from '@/lib/utils/sceneParser';
import { DataFlowOverlay } from '@/components/canvas/DataFlowOverlay';
import { DebugTraceOverlay } from '@/components/canvas/DebugTraceOverlay';
import { DebugTraceControls } from '@/components/canvas/DebugTraceControls';
import { useSimulationStore } from '@/stores/simulationStore';
import { useFlowAnimation } from '@/lib/hooks/useFlowAnimation';
import { SimulationStatus } from '@/lib/types/design';

// Use inline type extraction from Excalidraw's API
// Use inline type extraction from Excalidraw's API
type ExcalidrawImperativeAPI = Parameters<NonNullable<Parameters<typeof Excalidraw>[0]['excalidrawAPI']>>[0];
export type ExcalidrawElement = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>[number];

interface SystemDesignCanvasProps {
    problemId: string;
    onSelectionChange?: (element: ExcalidrawElement | null) => void;
}

export interface SystemDesignCanvasHandle {
    getElements: () => readonly ExcalidrawElement[];
    updateScene: (elements: ExcalidrawElement[]) => void;
    getSelectedElement: () => ExcalidrawElement | null;
    getExcalidrawAPI: () => ExcalidrawImperativeAPI | null;
    triggerSave: () => Promise<void>;
}

const SystemDesignCanvas = forwardRef<SystemDesignCanvasHandle, SystemDesignCanvasProps>(
    function SystemDesignCanvas({ problemId, onSelectionChange }, ref) {
        const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const [isReady, setIsReady] = useState(false);
        const theme = useUIStore((state) => state.theme);

        const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

        const isSavingRef = useRef(false);  // Lock to prevent concurrent saves

        // Animation Overlay State
        const [overlayConnections, setOverlayConnections] = useState<any[]>([]);
        const [viewport, setViewport] = useState({ scrollX: 0, scrollY: 0, zoom: 1 });
        const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

        // Update dimensions on resize
        useEffect(() => {
            if (!containerRef.current) return;
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    setDimensions({
                        width: entry.contentRect.width,
                        height: entry.contentRect.height
                    });
                }
            });
            observer.observe(containerRef.current);
            return () => observer.disconnect();
        }, []);

        // Store actions
        const setDesignId = useDesignStore((state) => state.setDesignId);
        const setProblemId = useDesignStore((state) => state.setProblemId);
        const setElements = useDesignStore((state) => state.setElements);
        const markDirty = useDesignStore((state) => state.markDirty);
        const startSaving = useDesignStore((state) => state.startSaving);
        const markSaved = useDesignStore((state) => state.markSaved);
        const setSaveError = useDesignStore((state) => state.setSaveError);

        // Animation state
        const play = useFlowAnimation(state => state.play);
        const pause = useFlowAnimation(state => state.pause);
        const isSimulationRunning = useSimulationStore(state => state.isRunning);
        const isSimulationCompleted = useSimulationStore(state => state.status === SimulationStatus.COMPLETED);

        // Sync animation with simulation
        useEffect(() => {
            if (isSimulationRunning || isSimulationCompleted) {
                play();
            } else {
                pause();
            }
        }, [isSimulationRunning, isSimulationCompleted, play, pause]);

        // Delay mounting Excalidraw slightly
        useEffect(() => {
            const timer = setTimeout(() => setIsReady(true), 200);
            return () => clearTimeout(timer);
        }, []);

        // Initialize drop handler for component palette
        useCanvasDrop({
            excalidrawAPI: excalidrawAPIRef.current ? {
                getSceneElements: () => excalidrawAPIRef.current?.getSceneElements() ?? [],
                updateScene: (opts) => excalidrawAPIRef.current?.updateScene(opts),
                getAppState: () => excalidrawAPIRef.current?.getAppState() ?? { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
            } : null,
            containerRef: containerRef as React.RefObject<HTMLDivElement>,
        });

        // Load design on mount
        useEffect(() => {
            if (!isReady) return;

            const pId = parseInt(problemId);
            if (isNaN(pId)) return;

            setProblemId(pId);

            async function loadDesign() {
                try {
                    // List designs for this problem
                    const designs = await designsApi.listDesigns(pId);
                    if (designs.length > 0) {
                        // Load the most recent one (first one)
                        const designId = designs[0].id;
                        const detail = await designsApi.getDesign(designId);

                        setDesignId(designId);

                        // Update canvas if data exists
                        if (detail.canvas_data &&
                            typeof detail.canvas_data === 'object' &&
                            'elements' in detail.canvas_data) {

                            const savedAppState = (detail.canvas_data as any).appState || {};
                            // Excalidraw expects collaborators to be a Map, but JSON makes it an object.
                            // We don't need collaborators for this use case, so we remove it to avoid "forEach is not a function" error.
                            const { collaborators, ...cleanAppState } = savedAppState;

                            excalidrawAPIRef.current?.updateScene({
                                elements: (detail.canvas_data as any).elements,
                                appState: cleanAppState
                            });
                        }
                    }
                } catch (err) {
                    console.error('Failed to load design:', err);
                }
            }

            loadDesign();
        }, [isReady, problemId, setDesignId, setProblemId]);

        // Save function
        const triggerSave = useCallback(async () => {
            const api = excalidrawAPIRef.current;
            if (!api) return;

            const elements = api.getSceneElements();
            const appState = api.getAppState();
            const parsed = parseExcalidrawScene(elements as any, appState);
            const pId = parseInt(problemId);

            // Don't auto-create empty designs
            const designId = useDesignStore.getState().currentDesignId;
            if (!designId && parsed.components.length === 0) {
                console.log('Skipping save: Empty new design');
                return;
            }

            // Prevent concurrent saves (race condition)
            if (isSavingRef.current) {
                console.log('Skipping save: Already saving');
                return;
            }
            isSavingRef.current = true;

            startSaving();

            try {
                const payload = {
                    problem_id: pId,
                    canvas_data: parsed.canvas_data,
                    components: parsed.components,
                    connections: parsed.connections
                };

                if (designId) {
                    await designsApi.updateDesign(designId, payload);
                } else {
                    const newDesign = await designsApi.createDesign(payload);
                    setDesignId(newDesign.id);
                }
                markSaved();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Save failed';
                // Don't spam console if backend is down
                if (message !== 'Failed to fetch') {
                    console.error('Save failed:', err);
                }
                setSaveError(message === 'Failed to fetch' ? 'Backend Unavailable' : message);
            } finally {
                isSavingRef.current = false;
            }
        }, [problemId, setDesignId, startSaving, markSaved, setSaveError]);



        // Track previous selection to avoid unnecessary updates
        const prevSelectionIdRef = useRef<string | null>(null);


        // ... existing handleChange ...
        const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: any) => {
            // Mark as dirty
            markDirty();

            // Support Animation Overlay
            setViewport({
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
                zoom: appState.zoom.value
            });

            // Parse connections for animation overlay
            const connections = elements
                .filter(el => (el.type === 'arrow' || (el.customData as any)?.isSystemConnection) && !el.isDeleted)
                .map(el => {
                    const data = (el.customData as any) || {};
                    // Use bound elements to find start/end if protocol logic needed later
                    const points = (el as any).points || [[0, 0], [0, 0]];
                    return {
                        id: el.id,
                        protocol: data.protocol || 'http',
                        startX: el.x,
                        startY: el.y,
                        points: points,
                        throughputQps: data.throughput_qps
                    };
                });
            setOverlayConnections(connections);

            // Handle Selection Change
            const selectedIds = Object.keys(appState.selectedElementIds || {});
            const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null;

            if (singleSelectedId !== prevSelectionIdRef.current) {
                prevSelectionIdRef.current = singleSelectedId;
                if (onSelectionChange) {
                    const el = elements.find(e => e.id === singleSelectedId);
                    onSelectionChange(el || null);
                }
            }
        }, [markDirty, onSelectionChange]);

        // Sync initial connections when API is ready
        useEffect(() => {
            if (excalidrawAPIRef.current) {
                const elements = excalidrawAPIRef.current.getSceneElements();
                const appState = excalidrawAPIRef.current.getAppState();

                // Trigger an initial "change" to populate overlay
                handleChange(elements as any, appState);
            }
        }, [isReady, handleChange]);


        const handlePointerUpdate = useCallback(() => { }, []);

        const handleExcalidrawMount = useCallback((api: ExcalidrawImperativeAPI) => {
            excalidrawAPIRef.current = api;
            (window as any).excalidrawAPI = api;
            console.log('Excalidraw mounted for problem:', problemId);
        }, [problemId]);

        useImperativeHandle(ref, () => ({
            getElements: () => excalidrawAPIRef.current?.getSceneElements() ?? [],
            updateScene: (elements: ExcalidrawElement[]) => {
                excalidrawAPIRef.current?.updateScene({ elements });
            },
            getSelectedElement: () => {
                const appState = excalidrawAPIRef.current?.getAppState();
                const elements = excalidrawAPIRef.current?.getSceneElements();
                if (!appState || !elements) return null;
                const selectedIds = Object.keys(appState.selectedElementIds);
                if (selectedIds.length === 1) {
                    return elements.find((el) => el.id === selectedIds[0]) ?? null;
                }
                return null;
            },
            getExcalidrawAPI: () => excalidrawAPIRef.current,
            triggerSave: async () => {
                await triggerSave();
            },
        }), [triggerSave]);

        if (!isReady) {
            return (
                <div className="flex items-center justify-center h-full bg-[var(--color-canvas-bg)]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]"></div>
                </div>
            );
        }

        // Set background color based on theme
        const backgroundColor = theme === 'dark' ? '#1a1a2e' : '#f8f9fa';

        return (
            <div ref={containerRef} className="w-full h-full relative overflow-hidden">
                {/* Custom Styles to hide unwanted Excalidraw UI elements */}
                <style>{`
                    /* Hide aggressive external links in Excalidraw menu */
                    a[href*="github.com/excalidraw"],
                    a[href*="discord.gg"],
                    a[href*="twitter.com"],
                    a[href*="plus.excalidraw.com"],
                    .dropdown-menu-item__link {
                        display: none !important;
                    }
                    
                    /* Hide the 'Excalidraw links' separator/header */
                    /* Targeted approach for standard Excalidraw DOM structure */
                    .dropdown-menu-group-header,
                    .dropdown-menu-item-separator {
                         display: none !important;
                    }
                    
                    /* Hide empty groups to prevent extra spacing */
                    .dropdown-menu-group:empty {
                        display: none !important;
                    }
                `}</style>

                {/* Excalidraw Canvas */}
                <Excalidraw
                    excalidrawAPI={handleExcalidrawMount}
                    onChange={handleChange}
                    onPointerUpdate={handlePointerUpdate}
                    theme={theme}
                    initialData={{
                        appState: {
                            viewBackgroundColor: backgroundColor,
                            currentItemRoughness: 1,
                        },
                    }}
                    UIOptions={{
                        canvasActions: {
                            loadScene: false,
                            export: false,
                            saveAsImage: false,
                            saveToActiveFile: false,
                        },
                    }}
                />

                {/* Animation Overlay - Must be AFTER Excalidraw to sit on top of canvas */}
                <DataFlowOverlay
                    connections={overlayConnections}
                    viewportTransform={viewport}
                    width={dimensions.width}
                    height={dimensions.height}
                />

                {/* Debug Trace Overlay for step-by-step request visualization */}
                <DebugTraceOverlay
                    viewportTransform={viewport}
                    width={dimensions.width}
                    height={dimensions.height}
                />

                {/* Debug Trace Controls */}
                <DebugTraceControls />
            </div>
        );
    }
);

export default SystemDesignCanvas;

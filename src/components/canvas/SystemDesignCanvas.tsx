'use client';

import { useCallback, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ComponentPalette } from '@/components/palette/ComponentPalette';
import { useCanvasDrop } from '@/lib/hooks/useCanvasDrop';
import { useUIStore } from '@/stores/uiStore';
import { useDesignStore } from '@/stores/designStore';
import * as designsApi from '@/lib/api/designs';
import { parseExcalidrawScene } from '@/lib/utils/sceneParser';

// Use inline type extraction from Excalidraw's API
type ExcalidrawImperativeAPI = Parameters<NonNullable<Parameters<typeof Excalidraw>[0]['excalidrawAPI']>>[0];
type ExcalidrawElement = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>[number];

interface SystemDesignCanvasProps {
    problemId: string;
}

export interface SystemDesignCanvasHandle {
    getElements: () => readonly ExcalidrawElement[];
    updateScene: (elements: ExcalidrawElement[]) => void;
    getSelectedElement: () => ExcalidrawElement | null;
    getExcalidrawAPI: () => ExcalidrawImperativeAPI | null;
}

const SystemDesignCanvas = forwardRef<SystemDesignCanvasHandle, SystemDesignCanvasProps>(
    function SystemDesignCanvas({ problemId }, ref) {
        const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const [isReady, setIsReady] = useState(false);
        const theme = useUIStore((state) => state.theme);

        const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

        // Store actions
        const setDesignId = useDesignStore((state) => state.setDesignId);
        const setProblemId = useDesignStore((state) => state.setProblemId);
        const markDirty = useDesignStore((state) => state.markDirty);
        const startSaving = useDesignStore((state) => state.startSaving);
        const markSaved = useDesignStore((state) => state.markSaved);
        const setSaveError = useDesignStore((state) => state.setSaveError);

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
                            excalidrawAPIRef.current?.updateScene({
                                elements: (detail.canvas_data as any).elements,
                                appState: (detail.canvas_data as any).appState
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

            startSaving();

            try {
                // Use current ID from store
                const designId = useDesignStore.getState().currentDesignId;

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
                console.error('Save failed:', err);
                setSaveError(err instanceof Error ? err.message : 'Save failed');
            }
        }, [problemId, setDesignId, startSaving, markSaved, setSaveError]);

        const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: any) => {
            // Auto-save logic
            markDirty();
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(triggerSave, 2000);

        }, [markDirty, triggerSave]);

        const handlePointerUpdate = useCallback(() => { }, []);

        const handleExcalidrawMount = useCallback((api: ExcalidrawImperativeAPI) => {
            excalidrawAPIRef.current = api;
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
        }), []);

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

                {/* Component Palette */}
                <ComponentPalette />

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
            </div>
        );
    }
);

export default SystemDesignCanvas;

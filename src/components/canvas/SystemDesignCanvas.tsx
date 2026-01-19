'use client';

import { useCallback, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { ComponentPalette } from '@/components/palette/ComponentPalette';
import { useCanvasDrop } from '@/lib/hooks/useCanvasDrop';
import { useUIStore } from '@/stores/uiStore';

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

        const [isMenuOpen, setIsMenuOpen] = useState(false);

        // ... existing useEffects ...

        const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: any) => {
            // Track menu state to shift palette
            // openMenu can be "dropdown" | "canvas" | null
            const menuOpen = !!appState?.openMenu;
            if (menuOpen !== isMenuOpen) {
                setIsMenuOpen(menuOpen);
            }

            // Track changes for auto-save (will be added in Phase 3)
            // console.log(`Canvas updated: ${elements.length} elements`);
        }, [isMenuOpen]);

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
                <ComponentPalette isMenuOpen={isMenuOpen} />

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

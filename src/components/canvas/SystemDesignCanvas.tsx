'use client';

import { useCallback, useRef, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
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
        const [isReady, setIsReady] = useState(false);
        const theme = useUIStore((state) => state.theme);

        // Delay mounting Excalidraw slightly
        useEffect(() => {
            const timer = setTimeout(() => setIsReady(true), 200);
            return () => clearTimeout(timer);
        }, []);

        const handleChange = useCallback((elements: readonly ExcalidrawElement[]) => {
            console.log(`Canvas updated: ${elements.length} elements`);
        }, []);

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
            <div
                className="w-full h-full relative overflow-hidden"
                style={{ transform: 'translate3d(0, 0, 0)' }}
            >
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

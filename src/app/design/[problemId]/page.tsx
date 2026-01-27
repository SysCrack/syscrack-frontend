'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Info, MessageSquare, Code2, Sun, Moon, User, LogOut } from 'lucide-react';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import type { SystemDesignCanvasHandle } from '@/components/canvas/SystemDesignCanvas';
import { ProblemPanel } from '@/components/problem/ProblemPanel';
import { ComponentPalette } from '@/components/palette/ComponentPalette';
// Mock data import removed - using backend API only
import { fetchSystemDesignProblem, fetchSystemDesignProblemBySlug } from '@/lib/api/problems';
import type { SystemDesignProblemDetail } from '@/lib/types/design';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useDesignStore } from '@/stores/designStore';
import { RunSimulationButton } from '@/components/simulation/RunSimulationButton';
import { ResultsPanel } from '@/components/simulation/ResultsPanel';
import { useSimulationStore } from '@/stores/simulationStore';
import { useSimulationStream } from '@/lib/api/simulationSocket';
import { FlowControls } from '@/components/canvas/FlowControls';
import { SaveDesignButton } from '@/components/canvas/SaveDesignButton';
import { ShowResultsButton } from '@/components/simulation/ShowResultsButton';

// Dynamically import the canvas to avoid SSR issues with Excalidraw
const SystemDesignCanvas = dynamic(
    () => import('@/components/canvas/SystemDesignCanvas'),
    { ssr: false, loading: () => <CanvasLoading /> }
);

function CanvasLoading() {
    return (
        <div className="flex items-center justify-center h-full bg-[var(--color-canvas-bg)]">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto mb-4"></div>
                <p className="text-[var(--color-text-secondary)]">Loading design canvas...</p>
            </div>
        </div>
    );
}

function SaveStatus() {
    const isSaving = useDesignStore((state) => state.isSaving);
    const isDirty = useDesignStore((state) => state.isDirty);
    const saveError = useDesignStore((state) => state.saveError);
    const lastSavedAt = useDesignStore((state) => state.lastSavedAt);

    let statusText = 'Saved';
    let statusColor = 'text-[var(--color-text-tertiary)]';

    if (isSaving) {
        statusText = 'Saving...';
        statusColor = 'text-[var(--color-primary)]';
    } else if (saveError) {
        statusText = 'Save Failed';
        statusColor = 'text-red-500';
    } else if (isDirty) {
        statusText = 'Unsaved changes';
        statusColor = 'text-[var(--color-text-tertiary)] italic';
    } else if (lastSavedAt) {
        statusText = `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    return (
        <div className={`flex items-center gap-2 text-xs font-medium ${statusColor}`}>
            {isSaving && <div className="animate-spin h-3 w-3 border-b-2 border-current rounded-full" />}
            {statusText}
        </div>
    );
}



export default function DesignPage() {
    const params = useParams();
    const problemId = params.problemId as string;
    const [showProblemPanel, setShowProblemPanel] = useState(true);
    const theme = useUIStore((state) => state.theme);
    const toggleTheme = useUIStore((state) => state.toggleTheme);
    const { user, signOut } = useAuthStore();

    // Canvas State
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const canvasRef = useRef<SystemDesignCanvasHandle>(null);

    // Simulation Real-time Stream
    const currentJobId = useSimulationStore((state) => state.currentJobId);
    useSimulationStream(currentJobId);

    // Manual Save Handler
    const handleManualSave = useCallback(async () => {
        if (canvasRef.current) {
            await canvasRef.current.triggerSave();
        }
    }, []);

    // Problem data from API
    const [problem, setProblem] = useState<SystemDesignProblemDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch problem data from API
    useEffect(() => {
        async function loadProblem() {
            setIsLoading(true);
            setError(null);
            try {
                // Try to parse as number first, otherwise use slug
                const id = parseInt(problemId);
                let data: SystemDesignProblemDetail;
                if (!isNaN(id)) {
                    data = await fetchSystemDesignProblem(id);
                } else {
                    data = await fetchSystemDesignProblemBySlug(problemId);
                }
                setProblem(data);
            } catch (err) {
                console.error('Failed to load problem from API:', err);
                setError(err instanceof Error ? err.message : 'Failed to load problem');
            } finally {
                setIsLoading(false);
            }
        }
        loadProblem();
    }, [problemId]);

    const handleSelectionChange = useCallback((element: any) => {
        setSelectedElement(element);
    }, []);

    const handleConfigUpdate = useCallback((elementId: string, newConfig: Record<string, unknown>) => {
        const api = canvasRef.current?.getExcalidrawAPI();
        if (!api) return;

        const elements = api.getSceneElements();
        const element = elements.find(el => el.id === elementId);

        if (element) {
            // Update customData
            const updatedElement = {
                ...element,
                customData: {
                    ...element.customData,
                    componentConfig: newConfig
                }
            };

            // Push update to scene
            // Note: Excalidraw updates by ID
            api.updateScene({
                elements: elements.map(el => el.id === elementId ? updatedElement : el)
            });

            // Update local state to reflect changes immediately in Inspector if needed
            setSelectedElement(updatedElement);
        }
    }, []);

    // Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth >= 300 && newWidth <= 800) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[var(--color-bg)]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto mb-4"></div>
                    <p className="text-[var(--color-text-secondary)]">Loading problem...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                <div className="text-xl font-semibold mb-2 text-red-500">Error Loading Problem</div>
                <p>{error}</p>
                <Link
                    href="/problems"
                    className="mt-4 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)]"
                >
                    Back to Problems
                </Link>
            </div>
        );
    }

    if (!problem) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
                <div className="text-xl font-semibold mb-2">Problem Not Found</div>
                <p>Could not find problem with ID: {problemId}</p>
                <Link
                    href="/problems"
                    className="mt-4 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)]"
                >
                    Back to Problems
                </Link>
            </div>
        );
    }

    return (
        <div
            className={`h-screen flex flex-col overflow-hidden bg-[var(--color-canvas-bg)] ${isResizing ? 'cursor-col-resize select-none' : ''}`}
        >
            {/* Header ... */}
            <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-panel-bg)] flex items-center px-4 justify-between flex-shrink-0">
                {/* ... existing header content ... */}
                <div className="flex items-center gap-4">
                    {/* Syscrack Logo */}
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-[var(--color-text-primary)] hover:text-[var(--color-primary)] transition-colors"
                    >
                        <Code2 className="h-6 w-6 text-[var(--color-primary)]" />
                        <span className="text-lg font-semibold">Syscrack</span>
                    </Link>

                    <div className="h-6 w-px bg-[var(--color-border)]" />

                    {/* Info toggle button */}
                    <button
                        onClick={() => setShowProblemPanel(!showProblemPanel)}
                        className={`
                            flex items-center gap-1.5 px-3 py-1.5
                            text-sm font-medium rounded-full
                            transition-colors
                            ${showProblemPanel
                                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'}
                        `}
                    >
                        <Info className="h-4 w-4" />
                        Info
                    </button>

                    {/* Node mode indicator */}
                    <span className="px-3 py-1.5 bg-purple-500/10 text-purple-400 text-sm font-medium rounded-full">
                        🔮 Node
                    </span>
                </div>

                {/* Center: Problem title */}
                <div className="absolute left-1/2 transform -translate-x-1/2 text-sm font-medium text-[var(--color-text-secondary)]">
                    {problem?.title || `Problem: ${problemId}`}
                </div>

                {/* Right: Theme toggle and user */}
                <div className="flex items-center gap-4">
                    {/* Save Status Indicator */}
                    <SaveStatus />

                    <div className="h-6 w-px bg-[var(--color-border)] opacity-50" />

                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                    >
                        {theme === 'light' ? (
                            <Moon className="h-5 w-5" />
                        ) : (
                            <Sun className="h-5 w-5" />
                        )}
                    </button>

                    {/* User/Profile */}
                    {user ? (
                        <div className="flex items-center gap-2">
                            <Link
                                href="/profile"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                            >
                                <User className="h-4 w-4" />
                                <span className="hidden sm:inline">Profile</span>
                            </Link>
                            <button
                                onClick={signOut}
                                className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-red-500 hover:bg-[var(--color-surface)] transition-colors"
                                aria-label="Sign out"
                            >
                                <LogOut className="h-5 w-5" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/auth/login"
                            className="px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-surface)] rounded-lg transition-colors"
                        >
                            Sign in
                        </Link>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel - Problem Description */}
                {showProblemPanel && problem && (
                    <aside
                        ref={sidebarRef}
                        className="flex-shrink-0 overflow-hidden relative group border-r border-[var(--color-border)] flex flex-col bg-[var(--color-panel-bg)]"
                        style={{ width: sidebarWidth }}
                    >
                        <div className="flex-1 overflow-y-auto">
                            <ProblemPanel problem={problem} className="h-full border-r-0" />
                        </div>
                    </aside>
                )}

                {/* Drag Handle */}
                {showProblemPanel && (
                    <div
                        className="w-1 cursor-col-resize hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)] transition-colors bg-[var(--color-border)] flex-shrink-0 z-50"
                        onMouseDown={startResizing}
                    />
                )}

                {/* Right Panel - Canvas Area */}
                <main className="flex-1 relative overflow-hidden isolate">
                    {/* Excalidraw Canvas - contained with isolation */}
                    <div className="absolute inset-0 overflow-hidden">
                        <SystemDesignCanvas
                            ref={canvasRef}
                            problemId={problem ? problem.id.toString() : '0'}
                            onSelectionChange={handleSelectionChange}
                        />
                    </div>

                    {/* Inspector Panel */}
                    <InspectorPanel
                        element={selectedElement}
                        onUpdate={handleConfigUpdate}
                        onClose={() => setSelectedElement(null)}
                    />

                    {/* Flow Controls - Bottom Center */}
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
                        <FlowControls />
                    </div>

                    {/* Right Side Panel - Component Palette & Action Buttons */}
                    <div className="absolute right-4 bottom-4 z-[60] flex flex-col items-end gap-3">
                        {/* Component Palette - Always visible, collapsible */}
                        <ComponentPalette floating={true} />

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            <ShowResultsButton />
                            <SaveDesignButton onSave={handleManualSave} />
                            <RunSimulationButton />
                        </div>
                    </div>
                </main>
            </div>

            {/* Results Panel Overlay */}
            <ResultsPanel />
        </div>
    );
}

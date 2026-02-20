/**
 * SystemCanvas — the main react-konva canvas orchestrator.
 * 
 * Renders all nodes and connections, handles pan/zoom, drag-and-drop
 * from palette, keyboard shortcuts, and connection drawing.
 * Uses an Excalidraw-inspired dark theme.
 */
'use client';

import { Stage, Layer, Line } from 'react-konva';
import { useRef, useCallback, useEffect, useState } from 'react';
import type Konva from 'konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCanvasSimulationStore, useCurrentResult } from '@/stores/canvasSimulationStore';
import ComponentNode from './ComponentNode';
import Connection from './Connection';
import type { CanvasComponentType } from '@/lib/types/canvas';

// ============ Props ============

interface SystemCanvasProps {
    className?: string;
}

// ============ Component ============

export default function SystemCanvas({ className }: SystemCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);
    const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

    // Store selectors
    const nodes = useCanvasStore((s) => s.nodes);
    const connections = useCanvasStore((s) => s.connections);
    const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
    const selectedConnectionId = useCanvasStore((s) => s.selectedConnectionId);
    const viewport = useCanvasStore((s) => s.viewport);
    const connectingFrom = useCanvasStore((s) => s.connectingFrom);
    const connectingToPoint = useCanvasStore((s) => s.connectingToPoint);

    // Simulation overlay data
    const simStatus = useCanvasSimulationStore((s) => s.status);
    const simOutput = useCanvasSimulationStore((s) => s.output);
    const currentResult = useCurrentResult();
    const particles = useCanvasSimulationStore((s) => s.particles);
    const liveMetrics = useCanvasSimulationStore((s) => s.liveMetrics);

    // Sim is active when running, paused, or completed
    const simActive = (simStatus === 'running' || simStatus === 'paused' || simStatus === 'completed') && !!(currentResult || liveMetrics);

    // Use live nodeMetrics when running, static when completed
    const nodeMetrics = (simStatus === 'running' || simStatus === 'paused')
        ? (liveMetrics?.nodeMetrics ?? {})
        : (currentResult?.nodeMetrics ?? {});
    const spofSet = new Set(
        (simOutput?.spofDiagnostics ?? []).map((d) => d.componentId),
    );

    // Group particles by connection ID for efficient lookup
    const particlesByConnection = new Map<string, typeof particles>();
    for (const p of particles) {
        const arr = particlesByConnection.get(p.connectionId);
        if (arr) arr.push(p);
        else particlesByConnection.set(p.connectionId, [p]);
    }

    // ── Resize observer ──
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setStageSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // ── Keyboard shortcuts ──
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case 'Delete':
                case 'Backspace':
                    e.preventDefault();
                    useCanvasStore.getState().deleteSelected();
                    break;
                case 'Escape':
                    useCanvasStore.getState().cancelConnecting();
                    useCanvasStore.getState().clearSelection();
                    break;
                case 'a':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        useCanvasStore.getState().selectAll();
                    }
                    break;
                case '=':
                case '+':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        useCanvasStore.getState().zoomIn();
                    }
                    break;
                case '-':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        useCanvasStore.getState().zoomOut();
                    }
                    break;
                case '0':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        useCanvasStore.getState().resetZoom();
                    }
                    break;
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ── Wheel zoom ──
    const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const scaleBy = 1.08;
        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
        const clampedScale = Math.min(Math.max(newScale, 0.2), 3);

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const newPos = {
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
        };

        useCanvasStore.getState().setViewport({
            x: newPos.x,
            y: newPos.y,
            scale: clampedScale,
        });
    }, []);

    // ── Stage click (deselect) ──
    const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
        if (e.target === e.target.getStage()) {
            const state = useCanvasStore.getState();
            if (state.connectingFrom) {
                state.cancelConnecting();
            } else {
                state.clearSelection();
            }
        }
    }, []);

    const handleStageTap = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
        if (e.target === e.target.getStage()) {
            const state = useCanvasStore.getState();
            if (state.connectingFrom) {
                state.cancelConnecting();
            } else {
                state.clearSelection();
            }
        }
    }, []);

    // ── Mouse move for connection preview line ──
    const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
        const state = useCanvasStore.getState();
        if (!state.connectingFrom) return;
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getRelativePointerPosition();
        if (pointer) {
            state.updateConnectingPoint({ x: pointer.x, y: pointer.y });
        }
    }, []);

    // ── Drag-and-drop from palette ──
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const componentType = e.dataTransfer.getData('application/syscrack-component') as CanvasComponentType;
        if (!componentType) return;

        const stage = stageRef.current;
        if (!stage) return;

        const stageBox = stage.container().getBoundingClientRect();
        const x = (e.clientX - stageBox.left - viewport.x) / viewport.scale;
        const y = (e.clientY - stageBox.top - viewport.y) / viewport.scale;

        useCanvasStore.getState().addNode(componentType, x - 80, y - 40);
    }, [viewport]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    // ── Node callbacks ──
    const handleNodeSelect = useCallback((id: string, multi: boolean) => {
        useCanvasStore.getState().selectNode(id, multi);
    }, []);

    const handleNodeDragEnd = useCallback((id: string, x: number, y: number) => {
        useCanvasStore.getState().moveNode(id, x, y);
    }, []);

    const handlePortClick = useCallback((nodeId: string) => {
        const state = useCanvasStore.getState();
        if (state.connectingFrom) {
            state.finishConnecting(nodeId);
        } else {
            state.startConnecting(nodeId);
        }
    }, []);

    const handleConnectionSelect = useCallback((id: string) => {
        useCanvasStore.getState().selectConnection(id);
    }, []);

    // Node lookup for connections
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Source node for connection preview
    const connectingSourceNode = connectingFrom ? nodeMap.get(connectingFrom) : null;

    return (
        <div
            ref={containerRef}
            className={className}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                background: '#121826',
                position: 'relative',
            }}
        >
            {/* Dot grid — Excalidraw style */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'radial-gradient(circle, #2a3244 1px, transparent 1px)',
                    backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
                    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                    pointerEvents: 'none',
                    opacity: 0.5,
                }}
            />

            <Stage
                ref={stageRef}
                width={stageSize.width}
                height={stageSize.height}
                scaleX={viewport.scale}
                scaleY={viewport.scale}
                x={viewport.x}
                y={viewport.y}
                draggable
                onWheel={handleWheel}
                onClick={handleStageClick}
                onTap={handleStageTap}
                onMouseMove={handleMouseMove}
                onDragEnd={(e) => {
                    if (e.target === stageRef.current) {
                        useCanvasStore.getState().setViewport({
                            x: e.target.x(),
                            y: e.target.y(),
                        });
                    }
                }}
            >
                <Layer>
                    {/* Connections (behind nodes) */}
                    {connections.map((conn) => {
                        const source = nodeMap.get(conn.sourceId);
                        const target = nodeMap.get(conn.targetId);
                        if (!source || !target) return null;
                        return (
                            <Connection
                                key={conn.id}
                                connection={conn}
                                sourceNode={source}
                                targetNode={target}
                                isSelected={selectedConnectionId === conn.id}
                                onSelect={handleConnectionSelect}
                                simActive={simActive}
                                simHealthy={
                                    simActive
                                        ? (nodeMetrics[conn.targetId]?.avgErrorRate ?? 0) < 0.01
                                        : undefined
                                }
                                particles={particlesByConnection.get(conn.id)}
                            />
                        );
                    })}

                    {/* Connection preview line (while dragging from a port) */}
                    {connectingSourceNode && connectingToPoint && (
                        <Line
                            points={[
                                connectingSourceNode.x + connectingSourceNode.width / 2,
                                connectingSourceNode.y + connectingSourceNode.height / 2,
                                connectingToPoint.x,
                                connectingToPoint.y,
                            ]}
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dash={[6, 4]}
                            opacity={0.6}
                            listening={false}
                        />
                    )}

                    {/* Nodes */}
                    {nodes.map((node) => (
                        <ComponentNode
                            key={node.id}
                            node={node}
                            isSelected={selectedNodeIds.includes(node.id)}
                            onSelect={handleNodeSelect}
                            onDragEnd={handleNodeDragEnd}
                            onPortClick={handlePortClick}
                            isConnecting={!!connectingFrom}
                            simState={simActive ? nodeMetrics[node.id] : undefined}
                            isSpof={simActive ? spofSet.has(node.id) : false}
                        />
                    ))}
                </Layer>
            </Stage>

            {/* Connection mode indicator */}
            {connectingFrom && (
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        background: '#1e3a5f',
                        border: '1px solid #3b82f6',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: 12,
                        color: '#60a5fa',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontWeight: 600,
                        animation: 'pulse 2s infinite',
                    }}
                >
                    🔗 Click a target port to connect · Esc to cancel
                </div>
            )}

            {/* Zoom indicator */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    background: '#1e293b',
                    border: '1px solid #2a3244',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    color: '#64748b',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    pointerEvents: 'none',
                }}
            >
                {Math.round(viewport.scale * 100)}%
            </div>
        </div>
    );
}

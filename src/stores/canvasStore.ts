/**
 * Zustand store for the react-konva canvas.
 * 
 * Manages canvas nodes, connections, selection, viewport, and
 * interaction mode. Separate from the existing designStore which
 * handles Excalidraw state.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
    CanvasNode,
    CanvasConnection,
    Viewport,
    CanvasComponentType,
    ConnectionProtocol,
    SharedConfig,
    ComponentSpecificConfig,
} from '@/lib/types/canvas';
import { createNode, createConnection } from '@/lib/types/canvas';
import { getCatalogEntry } from '@/lib/data/componentCatalog';
import { validateConnection, getDefaultProtocol } from '@/lib/connectionRules';

// ============ Interaction Modes ============

export type InteractionMode = 'select' | 'pan' | 'connect';

// ============ Store Interface ============

interface CanvasStore {
    // ── State ──
    nodes: CanvasNode[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    selectedConnectionId: string | null;
    viewport: Viewport;
    mode: InteractionMode;
    isDirty: boolean;

    // Connection drawing state
    connectingFrom: string | null;
    connectingToPoint: { x: number; y: number } | null;
    connectionValidationError: string | null;

    // ── Node Actions ──
    addNode: (type: CanvasComponentType, x: number, y: number) => CanvasNode | null;
    removeNode: (id: string) => void;
    moveNode: (id: string, x: number, y: number) => void;
    updateNodeName: (id: string, name: string) => void;
    updateNodeSharedConfig: (id: string, config: Partial<SharedConfig>) => void;
    updateNodeSpecificConfig: (id: string, config: Partial<ComponentSpecificConfig>) => void;

    // ── Connection Actions ──
    addConnection: (sourceId: string, targetId: string, protocol?: ConnectionProtocol) => CanvasConnection;
    removeConnection: (id: string) => void;
    updateConnection: (id: string, updates: Partial<Pick<CanvasConnection, 'protocol' | 'bidirectional' | 'label'>>) => void;

    // ── Selection ──
    selectNode: (id: string, multi?: boolean) => void;
    selectConnection: (id: string) => void;
    clearSelection: () => void;
    selectAll: () => void;

    // ── Viewport ──
    setViewport: (v: Partial<Viewport>) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;

    // ── Mode ──
    setMode: (mode: InteractionMode) => void;

    // ── Connection Drawing ──
    startConnecting: (nodeId: string) => void;
    updateConnectingPoint: (point: { x: number; y: number }) => void;
    finishConnecting: (targetNodeId: string) => void;
    cancelConnecting: () => void;

    // ── Bulk ──
    deleteSelected: () => void;
    loadDesign: (nodes: CanvasNode[], connections: CanvasConnection[]) => void;
    reset: () => void;
}

// ============ Store Implementation ============

export const useCanvasStore = create<CanvasStore>()(
    immer((set, get) => ({
        // Initial state
        nodes: [],
        connections: [],
        selectedNodeIds: [],
        selectedConnectionId: null,
        viewport: { x: 0, y: 0, scale: 1 },
        mode: 'select',
        isDirty: false,
        connectingFrom: null,
        connectingToPoint: null,
        connectionValidationError: null,

        // ── Node Actions ──

        addNode: (type, x, y) => {
            const catalog = getCatalogEntry(type);
            if (!catalog) return null;
            const node = createNode(type, x, y, catalog);
            set((s) => {
                s.nodes.push(node);
                s.isDirty = true;
            });
            return node;
        },

        removeNode: (id) =>
            set((s) => {
                s.nodes = s.nodes.filter((n) => n.id !== id);
                s.connections = s.connections.filter(
                    (c) => c.sourceId !== id && c.targetId !== id,
                );
                s.selectedNodeIds = s.selectedNodeIds.filter((sid) => sid !== id);
                s.isDirty = true;
            }),

        moveNode: (id, x, y) =>
            set((s) => {
                const node = s.nodes.find((n) => n.id === id);
                if (node) {
                    node.x = x;
                    node.y = y;
                    s.isDirty = true;
                }
            }),

        updateNodeName: (id, name) =>
            set((s) => {
                const node = s.nodes.find((n) => n.id === id);
                if (node) {
                    node.name = name;
                    s.isDirty = true;
                }
            }),

        updateNodeSharedConfig: (id, config) =>
            set((s) => {
                const node = s.nodes.find((n) => n.id === id);
                if (node) {
                    node.sharedConfig = { ...node.sharedConfig, ...config } as SharedConfig;
                    s.isDirty = true;
                }
            }),

        updateNodeSpecificConfig: (id, config) =>
            set((s) => {
                const node = s.nodes.find((n) => n.id === id);
                if (node) {
                    node.specificConfig = { ...node.specificConfig, ...config };
                    s.isDirty = true;
                }
            }),

        // ── Connection Actions ──

        addConnection: (sourceId, targetId, protocol = 'http') => {
            const conn = createConnection(sourceId, targetId, protocol);
            set((s) => {
                s.connections.push(conn);
                s.isDirty = true;
            });
            return conn;
        },

        removeConnection: (id) =>
            set((s) => {
                s.connections = s.connections.filter((c) => c.id !== id);
                if (s.selectedConnectionId === id) s.selectedConnectionId = null;
                s.isDirty = true;
            }),

        updateConnection: (id, updates) =>
            set((s) => {
                const conn = s.connections.find((c) => c.id === id);
                if (conn) {
                    Object.assign(conn, updates);
                    s.isDirty = true;
                }
            }),

        // ── Selection ──

        selectNode: (id, multi = false) =>
            set((s) => {
                s.selectedConnectionId = null;
                if (multi) {
                    const idx = s.selectedNodeIds.indexOf(id);
                    if (idx >= 0) {
                        s.selectedNodeIds.splice(idx, 1);
                    } else {
                        s.selectedNodeIds.push(id);
                    }
                } else {
                    s.selectedNodeIds = [id];
                }
            }),

        selectConnection: (id) =>
            set((s) => {
                s.selectedNodeIds = [];
                s.selectedConnectionId = id;
            }),

        clearSelection: () =>
            set((s) => {
                s.selectedNodeIds = [];
                s.selectedConnectionId = null;
            }),

        selectAll: () =>
            set((s) => {
                s.selectedNodeIds = s.nodes.map((n) => n.id);
                s.selectedConnectionId = null;
            }),

        // ── Viewport ──

        setViewport: (v) =>
            set((s) => {
                Object.assign(s.viewport, v);
            }),

        zoomIn: () =>
            set((s) => {
                s.viewport.scale = Math.min(s.viewport.scale * 1.2, 3);
            }),

        zoomOut: () =>
            set((s) => {
                s.viewport.scale = Math.max(s.viewport.scale / 1.2, 0.2);
            }),

        resetZoom: () =>
            set((s) => {
                s.viewport = { x: 0, y: 0, scale: 1 };
            }),

        // ── Mode ──

        setMode: (mode) => set({ mode }),

        // ── Connection Drawing ──

        startConnecting: (nodeId) =>
            set((s) => {
                s.connectingFrom = nodeId;
                s.connectionValidationError = null;
                s.mode = 'connect';
            }),

        updateConnectingPoint: (point) =>
            set((s) => {
                s.connectingToPoint = point;
            }),

        finishConnecting: (targetNodeId) => {
            const { connectingFrom, nodes, addConnection } = get();
            if (!connectingFrom || connectingFrom === targetNodeId) {
                set((s) => {
                    s.connectingFrom = null;
                    s.connectingToPoint = null;
                    s.mode = 'select';
                    s.connectionValidationError = null;
                });
                return;
            }
            const source = nodes.find((n) => n.id === connectingFrom);
            const target = nodes.find((n) => n.id === targetNodeId);
            if (source && target) {
                const result = validateConnection(source.type, target.type);
                if (!result.valid) {
                    set((s) => {
                        s.connectionValidationError = `${result.message}. ${result.suggestion ?? ''}`;
                    });
                    return;
                }
            }
            set((s) => {
                s.connectionValidationError = null;
            });
            const protocol =
                source && target ? getDefaultProtocol(source.type, target.type) : 'http';
            addConnection(connectingFrom, targetNodeId, protocol);
            set((s) => {
                s.connectingFrom = null;
                s.connectingToPoint = null;
                s.mode = 'select';
            });
        },

        cancelConnecting: () =>
            set((s) => {
                s.connectingFrom = null;
                s.connectingToPoint = null;
                s.connectionValidationError = null;
                s.mode = 'select';
            }),

        // ── Bulk ──

        deleteSelected: () => {
            const { selectedNodeIds, selectedConnectionId, removeNode, removeConnection } = get();
            if (selectedConnectionId) {
                removeConnection(selectedConnectionId);
            }
            selectedNodeIds.forEach((id) => removeNode(id));
            set((s) => {
                s.selectedNodeIds = [];
                s.selectedConnectionId = null;
            });
        },

        loadDesign: (nodes, connections) =>
            set((s) => {
                s.nodes = nodes;
                s.connections = connections;
                s.selectedNodeIds = [];
                s.selectedConnectionId = null;
                s.isDirty = false;
            }),

        reset: () =>
            set((s) => {
                s.nodes = [];
                s.connections = [];
                s.selectedNodeIds = [];
                s.selectedConnectionId = null;
                s.viewport = { x: 0, y: 0, scale: 1 };
                s.mode = 'select';
                s.isDirty = false;
                s.connectingFrom = null;
                s.connectingToPoint = null;
            }),
    })),
);

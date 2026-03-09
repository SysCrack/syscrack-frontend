/**
 * Export current canvas state to a DeploymentDesign (topology only, no positions).
 * Used when sending a design to the Cloud/Go backend for deployment.
 */
import type { CanvasNode, CanvasConnection } from '@/lib/types/canvas';
import type {
  TemplateType,
  WorkloadArchetype,
  DeploymentDesign,
  DeploymentNode,
  DeploymentConnection,
} from './design';

const STORAGE_TYPES = new Set<string>(['cache', 'database_sql', 'database_nosql', 'object_store']);

export function exportDesignJSON(
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  template: Exclude<TemplateType, null>,
  archetype: Exclude<WorkloadArchetype, null>,
): DeploymentDesign {
  const nodeMap = new Map<string, CanvasNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const hasStorage = nodes.some((n) => STORAGE_TYPES.has(n.type));
  if (!hasStorage) {
    throw new Error('Design must contain at least one storage component');
  }

  for (const c of connections) {
    if (!nodeMap.has(c.sourceId)) {
      throw new Error(`Connection references unknown node id: ${c.sourceId}`);
    }
    if (!nodeMap.has(c.targetId)) {
      throw new Error(`Connection references unknown node id: ${c.targetId}`);
    }
  }

  const deploymentNodes: DeploymentNode[] = nodes.map((node) => {
    const config: Record<string, unknown> = {
      ...(node.sharedConfig as unknown as Record<string, unknown>),
      ...(node.specificConfig as unknown as Record<string, unknown>),
    };
    return {
      id: node.id,
      type: node.type,
      name: node.name,
      config,
    };
  });

  const deploymentConnections: DeploymentConnection[] = connections.map((c) => ({
    sourceId: c.sourceId,
    targetId: c.targetId,
    protocol: c.protocol,
  }));

  return {
    version: '1.0',
    template,
    archetype,
    nodes: deploymentNodes,
    connections: deploymentConnections,
  };
}

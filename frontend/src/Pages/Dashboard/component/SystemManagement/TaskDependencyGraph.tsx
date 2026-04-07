import React, { useMemo } from 'react';
import { FaEdit, FaLink, FaPlus, FaProjectDiagram, FaTrash } from 'react-icons/fa';

export interface MissionNodeReward {
    experience?: Array<{ name: string; value: number }>;
    coins?: number;
    items?: Array<{ itemKey: string; quantity: number }>;
    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
}

export interface MissionNode {
    nodeId: string;
    parentNodeId: string | null;
    prerequisiteNodeIds?: string[];
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: MissionNodeReward;
    childrenNodeIds: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface TaskDependencyGraphProps {
    taskTree: MissionNode[];
    rootNodeId: string | null | undefined;
    onNodeClick: (nodeId: string) => void;
    onPhantomClick: (parentId: string | null) => void;
    onNodeDelete?: (nodeId: string) => void;
}

type EdgeKind = 'primary' | 'prerequisite';

type GraphEdge = {
    from: string;
    to: string;
    kind: EdgeKind;
};

type NodeLayout = {
    depth: number;
    x: number;
    y: number;
};

const NODE_WIDTH = 248;
const NODE_HEIGHT = 148;
const H_GAP = 160;
const V_GAP = 60;
const PADDING_X = 72;
const PADDING_Y = 72;

const statusColors: Record<MissionNode['status'], string> = {
    pending: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
    in_progress: 'bg-blue-50 text-blue-600 border-blue-400 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-500',
    completed: 'bg-green-50 text-green-600 border-green-400 dark:bg-green-900/40 dark:text-green-300 dark:border-green-500',
    failed: 'bg-red-50 text-red-600 border-red-400 dark:bg-red-900/40 dark:text-red-300 dark:border-red-500',
};

const statusLabels: Record<MissionNode['status'], string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
};

const dedupeIds = (ids: Array<string | null | undefined>) => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const id of ids) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }

    return result;
};

const getIncomingIds = (node: MissionNode) =>
    dedupeIds([node.parentNodeId, ...(node.prerequisiteNodeIds || [])]);

const buildEdgePath = (from: NodeLayout, to: NodeLayout) => {
    const startX = from.x + NODE_WIDTH;
    const startY = from.y + NODE_HEIGHT / 2;
    const endX = to.x;
    const endY = to.y + NODE_HEIGHT / 2;
    const controlOffset = Math.max(52, (endX - startX) * 0.42);

    return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
};

const buildGraph = (nodes: MissionNode[], rootNodeId?: string | null) => {
    const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
    const edges: GraphEdge[] = [];
    const incomingMap = new Map<string, string[]>();
    const outgoingPrimaryMap = new Map<string, string[]>();

    for (const node of nodes) {
        const incoming = getIncomingIds(node).filter((id) => nodesById.has(id));
        incomingMap.set(node.nodeId, incoming);

        const primaryChildren = (node.childrenNodeIds || []).filter((childId) => nodesById.has(childId));
        outgoingPrimaryMap.set(node.nodeId, primaryChildren);

        if (node.parentNodeId && nodesById.has(node.parentNodeId)) {
            edges.push({ from: node.parentNodeId, to: node.nodeId, kind: 'primary' });
        }

        for (const prerequisiteId of node.prerequisiteNodeIds || []) {
            if (!prerequisiteId || prerequisiteId === node.parentNodeId || !nodesById.has(prerequisiteId)) continue;
            edges.push({ from: prerequisiteId, to: node.nodeId, kind: 'prerequisite' });
        }
    }

    const depthMemo = new Map<string, number>();
    const getDepth = (nodeId: string, trail = new Set<string>()): number => {
        if (depthMemo.has(nodeId)) return depthMemo.get(nodeId)!;
        if (trail.has(nodeId)) return 0;

        trail.add(nodeId);
        const incoming = incomingMap.get(nodeId) || [];
        const depth = incoming.length
            ? Math.max(...incoming.map((sourceId) => getDepth(sourceId, new Set(trail)))) + 1
            : 0;
        depthMemo.set(nodeId, depth);
        return depth;
    };

    const roots = nodes
        .filter((node) => (incomingMap.get(node.nodeId) || []).length === 0)
        .sort((a, b) => {
            if (rootNodeId && a.nodeId === rootNodeId) return -1;
            if (rootNodeId && b.nodeId === rootNodeId) return 1;
            return a.title.localeCompare(b.title);
        });

    const columns = new Map<number, MissionNode[]>();
    for (const node of nodes) {
        const depth = getDepth(node.nodeId);
        const bucket = columns.get(depth) || [];
        bucket.push(node);
        columns.set(depth, bucket);
    }

    const rowOrder = new Map<string, number>();
    for (const [depth, bucket] of columns.entries()) {
        bucket.sort((a, b) => {
            if (depth === 0) {
                const aRootIndex = roots.findIndex((node) => node.nodeId === a.nodeId);
                const bRootIndex = roots.findIndex((node) => node.nodeId === b.nodeId);
                if (aRootIndex !== bRootIndex) return aRootIndex - bRootIndex;
            }

            const incomingA = incomingMap.get(a.nodeId) || [];
            const incomingB = incomingMap.get(b.nodeId) || [];

            const avgA = incomingA.length
                ? incomingA.reduce((sum, sourceId) => sum + (rowOrder.get(sourceId) ?? 0), 0) / incomingA.length
                : Number.MAX_SAFE_INTEGER;
            const avgB = incomingB.length
                ? incomingB.reduce((sum, sourceId) => sum + (rowOrder.get(sourceId) ?? 0), 0) / incomingB.length
                : Number.MAX_SAFE_INTEGER;

            if (avgA !== avgB) return avgA - avgB;
            return a.title.localeCompare(b.title);
        });

        bucket.forEach((node, index) => rowOrder.set(node.nodeId, index));
    }

    const layouts = new Map<string, NodeLayout>();
    let maxDepth = 0;
    let maxRows = 0;

    for (const [depth, bucket] of columns.entries()) {
        maxDepth = Math.max(maxDepth, depth);
        maxRows = Math.max(maxRows, bucket.length);

        bucket.forEach((node, rowIndex) => {
            layouts.set(node.nodeId, {
                depth,
                x: PADDING_X + depth * (NODE_WIDTH + H_GAP),
                y: PADDING_Y + rowIndex * (NODE_HEIGHT + V_GAP),
            });
        });
    }

    return {
        nodes: [...nodes].sort((a, b) => {
            const layoutA = layouts.get(a.nodeId);
            const layoutB = layouts.get(b.nodeId);
            if (!layoutA || !layoutB) return 0;
            if (layoutA.depth !== layoutB.depth) return layoutA.depth - layoutB.depth;
            return layoutA.y - layoutB.y;
        }),
        edges,
        incomingMap,
        outgoingPrimaryMap,
        layouts,
        width: Math.max(920, PADDING_X * 2 + (maxDepth + 1) * NODE_WIDTH + maxDepth * H_GAP),
        height: Math.max(560, PADDING_Y * 2 + maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * V_GAP),
    };
};

const TaskDependencyGraph: React.FC<TaskDependencyGraphProps> = ({
    taskTree,
    rootNodeId,
    onNodeClick,
    onPhantomClick,
    onNodeDelete,
}) => {
    const graph = useMemo(() => buildGraph(taskTree, rootNodeId), [taskTree, rootNodeId]);

    if (taskTree.length === 0) {
        return (
            <div className="w-full h-full min-h-[500px] overflow-auto bg-white/40 dark:bg-black/40 rounded-xl">
                <div className="min-w-max min-h-full p-8 flex flex-col items-center justify-center gap-4">
                    <p className="text-gray-500 dark:text-white/40 font-bold tracking-widest">
                        No task nodes yet. Create the first root task to start your workflow.
                    </p>
                    <button
                        onClick={() => onPhantomClick(null)}
                        className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white px-6 py-2 rounded-lg font-bold transition-colors"
                    >
                        <FaPlus /> Create Root Task
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[500px] overflow-auto bg-white/40 dark:bg-black/40 rounded-xl">
            <div className="min-w-max min-h-full p-6">
                <div className="flex items-center justify-between gap-4 px-3 pb-4 text-xs text-gray-500 dark:text-white/40">
                    <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-2">
                            <span className="h-0.5 w-8 bg-indigo-400 dark:bg-indigo-300" />
                            Primary parent
                        </span>
                        <span className="inline-flex items-center gap-2">
                            <span className="h-0.5 w-8 border-t-2 border-dashed border-amber-400 dark:border-amber-300" />
                            Shared prerequisite
                        </span>
                    </div>
                    <span className="inline-flex items-center gap-2">
                        <FaProjectDiagram />
                        Merge nodes unlock after all incoming branches finish.
                    </span>
                </div>

                <div
                    className="relative rounded-2xl border border-gray-200/70 bg-gradient-to-br from-white/80 to-slate-50/80 dark:border-white/10 dark:from-black/30 dark:to-slate-900/20"
                    style={{ width: graph.width, height: graph.height }}
                >
                    <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
                        {graph.edges.map((edge) => {
                            const from = graph.layouts.get(edge.from);
                            const to = graph.layouts.get(edge.to);
                            if (!from || !to) return null;

                            return (
                                <path
                                    key={`${edge.kind}-${edge.from}-${edge.to}`}
                                    d={buildEdgePath(from, to)}
                                    fill="none"
                                    stroke={edge.kind === 'primary' ? '#818cf8' : '#f59e0b'}
                                    strokeDasharray={edge.kind === 'primary' ? undefined : '8 6'}
                                    strokeLinecap="round"
                                    strokeWidth={edge.kind === 'primary' ? 3 : 2.5}
                                    opacity={0.92}
                                />
                            );
                        })}
                    </svg>

                    {graph.nodes.map((node) => {
                        const layout = graph.layouts.get(node.nodeId);
                        if (!layout) return null;

                        const incomingIds = graph.incomingMap.get(node.nodeId) || [];
                        const childCount = graph.outgoingPrimaryMap.get(node.nodeId)?.length || 0;

                        return (
                            <div
                                key={node.nodeId}
                                className={`absolute rounded-2xl border-2 shadow-lg shadow-black/5 transition-transform hover:-translate-y-1 hover:shadow-xl dark:shadow-none ${statusColors[node.status]}`}
                                style={{
                                    left: layout.x,
                                    top: layout.y,
                                    width: NODE_WIDTH,
                                    minHeight: NODE_HEIGHT,
                                }}
                            >
                                <div className="flex h-full flex-col p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-black tracking-wide leading-tight">
                                                {node.title}
                                            </p>
                                            <p className="mt-1 text-[11px] uppercase tracking-[0.22em] opacity-70">
                                                {statusLabels[node.status]}
                                            </p>
                                        </div>
                                        {incomingIds.length > 1 && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-100/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-300">
                                                <FaLink className="text-[9px]" />
                                                Merge
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-3 flex-1 space-y-2 text-xs opacity-80">
                                        <div className="rounded-xl bg-white/50 px-3 py-2 dark:bg-black/20">
                                            {node.description?.trim() || 'No description yet.'}
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em]">
                                            <span>{node.timeCostMinutes} min</span>
                                            <span>{childCount}/3 children</span>
                                        </div>
                                        {incomingIds.length > 1 && (
                                            <div className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                                                This task needs every incoming branch to be completed before it unlocks.
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-center justify-center gap-3">
                                        <button
                                            onClick={() => onNodeClick(node.nodeId)}
                                            className="rounded-lg p-2 text-blue-500 transition-colors hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
                                            title="Edit node"
                                        >
                                            <FaEdit />
                                        </button>
                                        <button
                                            onClick={() => onNodeDelete?.(node.nodeId)}
                                            className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                                            title="Delete node"
                                        >
                                            <FaTrash />
                                        </button>
                                        {childCount < 3 && (
                                            <button
                                                onClick={() => onPhantomClick(node.nodeId)}
                                                className="rounded-lg p-2 text-green-500 transition-colors hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200"
                                                title="Add child node"
                                            >
                                                <FaPlus />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TaskDependencyGraph;

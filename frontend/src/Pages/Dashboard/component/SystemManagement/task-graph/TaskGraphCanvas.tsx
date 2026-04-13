import React, { useMemo } from 'react';
import { FaCrown, FaEdit, FaLink, FaPlus, FaProjectDiagram, FaStar, FaTrash } from 'react-icons/fa';

export type TaskGraphStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskGraphNode {
    id: string;
    parentId: string | null;
    prerequisiteIds?: string[];
    title: string;
    description?: string;
    timeCostMinutes?: number;
    childrenIds?: string[];
    status: TaskGraphStatus;
    badgeText?: string;
    isMergeNode?: boolean;
    nodeKind?: 'standard' | 'milestone' | 'boss';
    progressText?: string;
    rewardHint?: string;
}

interface TaskGraphCanvasProps {
    nodes: TaskGraphNode[];
    rootNodeId?: string | null;
    onNodeClick?: (nodeId: string) => void;
    onCreateChild?: (parentId: string | null) => void;
    onDeleteNode?: (nodeId: string) => void;
    readonly?: boolean;
    compact?: boolean;
    className?: string;
    showLegend?: boolean;
    emptyTitle?: string;
    emptyCtaLabel?: string;
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

const statusColors: Record<TaskGraphStatus, string> = {
    pending: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
    in_progress: 'bg-blue-50 text-blue-600 border-blue-400 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-500',
    completed: 'bg-green-50 text-green-600 border-green-400 dark:bg-green-900/40 dark:text-green-300 dark:border-green-500',
    failed: 'bg-red-50 text-red-600 border-red-400 dark:bg-red-900/40 dark:text-red-300 dark:border-red-500',
};

const statusLabels: Record<TaskGraphStatus, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
};

const kindAccentStyles: Record<NonNullable<TaskGraphNode['nodeKind']>, string> = {
    standard: '',
    milestone: 'ring-2 ring-amber-300/80 dark:ring-amber-500/40 bg-gradient-to-br from-amber-50/70 to-white/80 dark:from-amber-500/10 dark:to-black/20',
    boss: 'ring-2 ring-fuchsia-300/80 dark:ring-fuchsia-500/40 bg-gradient-to-br from-fuchsia-50/80 to-white/80 dark:from-fuchsia-500/10 dark:to-black/20',
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

const getIncomingIds = (node: TaskGraphNode) =>
    dedupeIds([node.parentId, ...(node.prerequisiteIds || [])]);

const buildEdgePath = (from: NodeLayout, to: NodeLayout, nodeWidth: number, nodeHeight: number) => {
    const startX = from.x + nodeWidth;
    const startY = from.y + nodeHeight / 2;
    const endX = to.x;
    const endY = to.y + nodeHeight / 2;
    const controlOffset = Math.max(36, (endX - startX) * 0.42);

    return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
};

const buildGraph = (
    nodes: TaskGraphNode[],
    rootNodeId: string | null | undefined,
    nodeWidth: number,
    nodeHeight: number,
    hGap: number,
    vGap: number,
    paddingX: number,
    paddingY: number,
) => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const edges: GraphEdge[] = [];
    const incomingMap = new Map<string, string[]>();
    const outgoingPrimaryMap = new Map<string, string[]>();

    for (const node of nodes) {
        const incoming = getIncomingIds(node).filter((id) => nodesById.has(id));
        incomingMap.set(node.id, incoming);

        const primaryChildren = (node.childrenIds || []).filter((childId) => nodesById.has(childId));
        outgoingPrimaryMap.set(node.id, primaryChildren);

        if (node.parentId && nodesById.has(node.parentId)) {
            edges.push({ from: node.parentId, to: node.id, kind: 'primary' });
        }

        for (const prerequisiteId of node.prerequisiteIds || []) {
            if (!prerequisiteId || prerequisiteId === node.parentId || !nodesById.has(prerequisiteId)) continue;
            edges.push({ from: prerequisiteId, to: node.id, kind: 'prerequisite' });
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
        .filter((node) => (incomingMap.get(node.id) || []).length === 0)
        .sort((a, b) => {
            if (rootNodeId && a.id === rootNodeId) return -1;
            if (rootNodeId && b.id === rootNodeId) return 1;
            return a.title.localeCompare(b.title);
        });

    const columns = new Map<number, TaskGraphNode[]>();
    for (const node of nodes) {
        const depth = getDepth(node.id);
        const bucket = columns.get(depth) || [];
        bucket.push(node);
        columns.set(depth, bucket);
    }

    const rowOrder = new Map<string, number>();
    for (const [depth, bucket] of columns.entries()) {
        bucket.sort((a, b) => {
            if (depth === 0) {
                const aRootIndex = roots.findIndex((node) => node.id === a.id);
                const bRootIndex = roots.findIndex((node) => node.id === b.id);
                if (aRootIndex !== bRootIndex) return aRootIndex - bRootIndex;
            }

            const incomingA = incomingMap.get(a.id) || [];
            const incomingB = incomingMap.get(b.id) || [];

            const avgA = incomingA.length
                ? incomingA.reduce((sum, sourceId) => sum + (rowOrder.get(sourceId) ?? 0), 0) / incomingA.length
                : Number.MAX_SAFE_INTEGER;
            const avgB = incomingB.length
                ? incomingB.reduce((sum, sourceId) => sum + (rowOrder.get(sourceId) ?? 0), 0) / incomingB.length
                : Number.MAX_SAFE_INTEGER;

            if (avgA !== avgB) return avgA - avgB;
            return a.title.localeCompare(b.title);
        });

        bucket.forEach((node, index) => rowOrder.set(node.id, index));
    }

    const layouts = new Map<string, NodeLayout>();
    let maxDepth = 0;
    let maxRows = 0;

    for (const [depth, bucket] of columns.entries()) {
        maxDepth = Math.max(maxDepth, depth);
        maxRows = Math.max(maxRows, bucket.length);

        bucket.forEach((node, rowIndex) => {
            layouts.set(node.id, {
                depth,
                x: paddingX + depth * (nodeWidth + hGap),
                y: paddingY + rowIndex * (nodeHeight + vGap),
            });
        });
    }

    return {
        nodes: [...nodes].sort((a, b) => {
            const layoutA = layouts.get(a.id);
            const layoutB = layouts.get(b.id);
            if (!layoutA || !layoutB) return 0;
            if (layoutA.depth !== layoutB.depth) return layoutA.depth - layoutB.depth;
            return layoutA.y - layoutB.y;
        }),
        edges,
        incomingMap,
        outgoingPrimaryMap,
        layouts,
        width: Math.max(780, paddingX * 2 + (maxDepth + 1) * nodeWidth + maxDepth * hGap),
        height: Math.max(380, paddingY * 2 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * vGap),
    };
};

const TaskGraphCanvas: React.FC<TaskGraphCanvasProps> = ({
    nodes,
    rootNodeId,
    onNodeClick,
    onCreateChild,
    onDeleteNode,
    readonly = false,
    compact = false,
    className = '',
    showLegend = true,
    emptyTitle = 'No task nodes yet. Create the first root task to start your workflow.',
    emptyCtaLabel = 'Create Root Task',
}) => {
    const nodeWidth = compact ? 212 : 248;
    const nodeHeight = compact ? 124 : 148;
    const hGap = compact ? 120 : 160;
    const vGap = compact ? 44 : 60;
    const paddingX = compact ? 48 : 72;
    const paddingY = compact ? 48 : 72;

    const graph = useMemo(
        () => buildGraph(nodes, rootNodeId, nodeWidth, nodeHeight, hGap, vGap, paddingX, paddingY),
        [nodes, rootNodeId, nodeWidth, nodeHeight, hGap, vGap, paddingX, paddingY],
    );

    if (nodes.length === 0) {
        return (
            <div className={`w-full h-full min-h-[320px] overflow-auto rounded-xl ${className}`}>
                <div className="min-w-max min-h-full p-8 flex flex-col items-center justify-center gap-4">
                    <p className="text-gray-500 dark:text-white/40 font-bold tracking-widest text-center">
                        {emptyTitle}
                    </p>
                    {!readonly && onCreateChild && (
                        <button
                            onClick={() => onCreateChild(null)}
                            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white px-6 py-2 rounded-lg font-bold transition-colors"
                        >
                            <FaPlus /> {emptyCtaLabel}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`w-full h-full min-h-[320px] overflow-auto rounded-xl ${className}`}>
            <div className="min-w-max min-h-full p-4">
                {showLegend && (
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
                )}

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
                                    d={buildEdgePath(from, to, nodeWidth, nodeHeight)}
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
                        const layout = graph.layouts.get(node.id);
                        if (!layout) return null;

                        const incomingIds = graph.incomingMap.get(node.id) || [];
                        const childCount = graph.outgoingPrimaryMap.get(node.id)?.length || 0;

                        return (
                            <div
                                key={node.id}
                                className={`absolute rounded-2xl border-2 shadow-lg shadow-black/5 transition-transform hover:-translate-y-1 hover:shadow-xl dark:shadow-none ${statusColors[node.status]}`}
                                style={{
                                    left: layout.x,
                                    top: layout.y,
                                    width: nodeWidth,
                                    minHeight: nodeHeight,
                                }}
                            >
                                <div className="flex h-full flex-col p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className={`${compact ? 'text-xs' : 'text-sm'} font-black tracking-wide leading-tight`}>
                                                {node.title}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <p className="text-[11px] uppercase tracking-[0.22em] opacity-70">
                                                    {statusLabels[node.status]}
                                                </p>
                                                {node.badgeText && (
                                                    <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">
                                                        {node.badgeText}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {node.isMergeNode && (
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                                                node.nodeKind === 'boss'
                                                    ? 'border border-fuchsia-300/80 bg-fuchsia-100/80 text-fuchsia-700 dark:border-fuchsia-400/40 dark:bg-fuchsia-500/10 dark:text-fuchsia-300'
                                                    : 'border border-amber-300/80 bg-amber-100/80 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-300'
                                            }`}>
                                                {node.nodeKind === 'boss' ? <FaCrown className="text-[9px]" /> : <FaStar className="text-[9px]" />}
                                                {node.nodeKind === 'boss' ? 'Boss Merge' : 'Merge'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-3 flex-1 space-y-2 text-xs opacity-80">
                                        <div className={`rounded-xl px-3 py-2 dark:bg-black/20 ${node.nodeKind ? kindAccentStyles[node.nodeKind] : 'bg-white/50'}`}>
                                            {node.description?.trim() || 'No description yet.'}
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em]">
                                            <span>{Math.max(1, node.timeCostMinutes || 0)} min</span>
                                            <span>{childCount}/3 children</span>
                                        </div>
                                        {node.isMergeNode && (
                                            <div className={`rounded-xl px-3 py-2 text-[11px] ${
                                                node.nodeKind === 'boss'
                                                    ? 'border border-fuchsia-300/70 bg-fuchsia-50/80 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200'
                                                    : 'border border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200'
                                            }`}>
                                                <div className="flex items-center gap-1 font-bold uppercase tracking-[0.18em] mb-1">
                                                    <FaLink className="text-[10px]" />
                                                    {node.nodeKind === 'boss' ? 'Boss Gate' : 'Merge Gate'}
                                                </div>
                                                <div>{node.progressText || 'This task needs every incoming branch to be completed before it unlocks.'}</div>
                                                {node.rewardHint && (
                                                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                                                        {node.rewardHint}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {!node.isMergeNode && incomingIds.length > 1 && (
                                            <div className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                                                This task needs every incoming branch to be completed before it unlocks.
                                            </div>
                                        )}
                                        {node.nodeKind === 'boss' && (
                                            <div className="rounded-xl border border-fuchsia-300/60 bg-fuchsia-50/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
                                                Boss milestone: best suited for major rewards and key unlocks.
                                            </div>
                                        )}
                                    </div>

                                    {!readonly && (
                                        <div className="mt-4 flex items-center justify-center gap-3">
                                            {onNodeClick && (
                                                <button
                                                    onClick={() => onNodeClick(node.id)}
                                                    className="rounded-lg p-2 text-blue-500 transition-colors hover:bg-blue-500/10 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
                                                    title="Edit node"
                                                >
                                                    <FaEdit />
                                                </button>
                                            )}
                                            {onDeleteNode && (
                                                <button
                                                    onClick={() => onDeleteNode(node.id)}
                                                    className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                                                    title="Delete node"
                                                >
                                                    <FaTrash />
                                                </button>
                                            )}
                                            {onCreateChild && childCount < 3 && (
                                                <button
                                                    onClick={() => onCreateChild(node.id)}
                                                    className="rounded-lg p-2 text-green-500 transition-colors hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200"
                                                    title="Add child node"
                                                >
                                                    <FaPlus />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TaskGraphCanvas;

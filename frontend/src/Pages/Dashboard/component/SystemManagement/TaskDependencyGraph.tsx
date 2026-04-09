import React from 'react';
import TaskGraphCanvas, { type TaskGraphNode } from './task-graph/TaskGraphCanvas';

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

const TaskDependencyGraph: React.FC<TaskDependencyGraphProps> = ({
    taskTree,
    rootNodeId,
    onNodeClick,
    onPhantomClick,
    onNodeDelete,
}) => {
    const graphNodes: TaskGraphNode[] = taskTree.map((node) => ({
        id: node.nodeId,
        parentId: node.parentNodeId,
        prerequisiteIds: node.prerequisiteNodeIds || [],
        title: node.title,
        description: node.description,
        timeCostMinutes: node.timeCostMinutes,
        childrenIds: node.childrenNodeIds,
        status: node.status,
    }));

    return (
        <TaskGraphCanvas
            nodes={graphNodes}
            rootNodeId={rootNodeId}
            onNodeClick={onNodeClick}
            onCreateChild={onPhantomClick}
            onDeleteNode={onNodeDelete}
            readonly={false}
            compact={false}
            showLegend
            className="bg-white/40 dark:bg-black/40"
        />
    );
};

export default TaskDependencyGraph;

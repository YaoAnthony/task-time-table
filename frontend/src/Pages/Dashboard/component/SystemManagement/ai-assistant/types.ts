export interface ProposalNode {
    tempId: string;
    parentTempId: string | null;
    prerequisiteTempIds?: string[];
    title: string;
    description?: string;
    timeCostMinutes: number;
    rewards?: {
        coins?: number;
        items?: Array<{ itemKey: string; quantity: number }>;
    };
}

export interface Proposal {
    mode?: 'create_new_list' | 'attach_to_existing_list';
    structureType?: 'linear' | 'branched' | 'merge';
    title: string;
    listType: string;
    description: string;
    imageKeywords: string;
    attachTargetMissionListId?: string | null;
    attachTargetMissionListTitle?: string;
    attachTargetNodeId?: string | null;
    attachTargetNodeTitle?: string;
    nodes: ProposalNode[];
}

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    isAction?: boolean;
    preview?: Proposal;
}

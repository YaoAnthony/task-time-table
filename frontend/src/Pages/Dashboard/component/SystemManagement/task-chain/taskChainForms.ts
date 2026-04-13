import type { MissionListType } from '../../../../../Types/System';

export type TaskRewardItemOption = {
    key: string;
    label: string;
    source: 'store' | 'obtainable';
};

export type TaskListFormState = {
    listType: MissionListType;
    title: string;
    image: string;
    description: string;
    unlockType: 'direct' | 'attributeLevel';
    unlockAttributeName: string;
    unlockMinLevel: number;
    failureEnabled: boolean;
    pointPenaltyAttributeName: string;
    pointPenaltyValue: number;
    itemPenaltyItemKey: string;
    itemPenaltyQuantity: number;
};

export const createInitialListForm = (): TaskListFormState => ({
    listType: 'mainline',
    title: '',
    image: '',
    description: '',
    unlockType: 'direct',
    unlockAttributeName: '',
    unlockMinLevel: 0,
    failureEnabled: false,
    pointPenaltyAttributeName: '',
    pointPenaltyValue: 1,
    itemPenaltyItemKey: '',
    itemPenaltyQuantity: 1,
});

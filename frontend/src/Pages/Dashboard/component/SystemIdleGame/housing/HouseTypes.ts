export type HouseDefinitionId = 'greenhouse';

export type HouseStage =
  | 'step0'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'ready_closed'
  | 'ready_open';

export type HouseDoorState = 'closed' | 'open';
export type HouseTenancyStatus = 'vacant' | 'reserved' | 'occupied' | 'evicted';
export type HouseContractStatus = 'draft' | 'offered' | 'signed' | 'cancelled' | 'ended';

export interface HouseRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HouseDefinition {
  id: HouseDefinitionId;
  name: string;
  nameZh: string;
  blueprintItemId: string;
  price: number;
  rentPerDay: number;
  roomTemplateId: string;
  stageDuration: number;
  stageDurations: Record<'step0' | 'step1' | 'step2' | 'step3' | 'step4', number>;
  displaySize: { w: number; h: number };
  footprint: { w: number; h: number };
  collisionBoxes: HouseRect[];
  doorOffset: { x: number; y: number };
}

export interface HouseInstanceSave {
  id: string;
  displayId?: string;
  definitionId: HouseDefinitionId;
  x: number;
  y: number;
  stage: HouseStage;
  doorState: HouseDoorState;
  startedAtTick: number;
  readyAtTick: number;
  roomId: string;
  ownership: {
    ownerPlayerId: string;
    ownerName?: string;
  };
  tenancy: {
    status: HouseTenancyStatus;
    residentNpcId?: string | null;
    residentNpcName?: string | null;
    contractId?: string | null;
    assignedAtTick?: number | null;
    moveInAtTick?: number | null;
  };
  economy: {
    rentPerDay: number;
    lastRentCollectedTick?: number | null;
    totalRentCollected: number;
  };
  access: {
    keyItemInstanceId?: string | null;
    locked: boolean;
    allowedNpcIds: string[];
  };
}

export interface HouseContractSave {
  id: string;
  houseId: string;
  npcId: string;
  npcName: string;
  playerId: string;
  status: HouseContractStatus;
  rentPerDay: number;
  createdAtTick: number;
  signedAtTick?: number | null;
  startsAtTick?: number | null;
  endsAtTick?: number | null;
  terms: {
    canEnterHouse: boolean;
    canDecorate: boolean;
    canUseStorage: boolean;
    rentCollection: 'daily' | 'manual';
  };
}

export interface HouseObservation {
  id: string;
  displayId: string;
  kind: 'house';
  name: string;
  stage: HouseStage;
  ready: boolean;
  doorOpen: boolean;
  ownerName?: string;
  residentNpcName?: string | null;
  contractStatus: HouseContractStatus | 'none';
  rentPerDay: number;
  roomId: string;
  affordances: string[];
  summary: string;
}

export function cloneHouseInstanceSave(house: HouseInstanceSave): HouseInstanceSave {
  return {
    ...house,
    ownership: { ...house.ownership },
    tenancy: { ...house.tenancy },
    economy: { ...house.economy },
    access: {
      ...house.access,
      allowedNpcIds: [...(house.access?.allowedNpcIds ?? [])],
    },
  };
}

export function cloneHouseContractSave(contract: HouseContractSave): HouseContractSave {
  return {
    ...contract,
    terms: { ...contract.terms },
  };
}

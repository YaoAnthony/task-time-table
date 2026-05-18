import type { HouseContractSave, HouseInstanceSave, HouseObservation } from './HouseTypes';

function houseDisplaySequence(displayId: string | undefined, definitionId: string): number {
  const match = String(displayId || '').match(new RegExp(`^${definitionId}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

function formatHouseDisplayId(definitionId: string, sequence: number): string {
  return `${definitionId}-${String(Math.max(1, sequence)).padStart(3, '0')}`;
}

export function getHouseDisplayId(house: Pick<HouseInstanceSave, 'id' | 'definitionId' | 'displayId'>): string {
  if (house.displayId) return house.displayId;
  if (houseDisplaySequence(house.id, house.definitionId) > 0) return house.id;
  return `${house.definitionId}-${house.id.replace(/^house_/, '').slice(0, 8)}`;
}

export function assignHouseDisplayIds(houses: HouseInstanceSave[]): HouseInstanceSave[] {
  const counters = new Map<string, number>();
  return houses.map((house) => {
    const existing = house.displayId || (houseDisplaySequence(house.id, house.definitionId) > 0 ? house.id : '');
    if (existing) {
      counters.set(house.definitionId, Math.max(counters.get(house.definitionId) ?? 0, houseDisplaySequence(existing, house.definitionId)));
      return { ...house, displayId: existing };
    }
    const next = (counters.get(house.definitionId) ?? 0) + 1;
    counters.set(house.definitionId, next);
    return { ...house, displayId: formatHouseDisplayId(house.definitionId, next) };
  });
}

export function buildHouseObservation(
  house: HouseInstanceSave,
  contracts: HouseContractSave[],
): HouseObservation {
  const contract = contracts.find((entry) => entry.id === house.tenancy.contractId)
    ?? contracts.find((entry) => entry.houseId === house.id && ['offered', 'signed'].includes(entry.status));
  const ready = String(house.stage).startsWith('ready');
  const doorOpen = house.doorState === 'open' || house.stage === 'ready_open';
  const affordances = ['inspect_house'];
  if (ready && !doorOpen) affordances.push('open_house');
  if (ready && doorOpen) affordances.push('enter_house', 'close_house');
  if (ready && house.tenancy.status === 'vacant') affordances.push('offer_contract', 'assign_resident');
  if (contract?.status === 'offered') affordances.push('sign_contract');
  if (house.tenancy.status === 'occupied') affordances.push('collect_rent');

  const displayId = getHouseDisplayId(house);
  const summaryParts = [
    displayId,
    `${house.ownership.ownerName || '玩家'}的${ready ? '已完工' : '建造中'}温室小屋`,
    doorOpen ? '门开着' : '门关着',
  ];
  if (house.tenancy.residentNpcName) summaryParts.push(`住户是${house.tenancy.residentNpcName}`);
  if (contract) summaryParts.push(`合同状态 ${contract.status}`);
  summaryParts.push(`租金 ${house.economy.rentPerDay}/天`);

  return {
    id: house.id,
    displayId,
    kind: 'house',
    name: `${displayId} 温室小屋`,
    stage: house.stage,
    ready,
    doorOpen,
    ownerName: house.ownership.ownerName,
    residentNpcName: house.tenancy.residentNpcName,
    contractStatus: contract?.status ?? 'none',
    rentPerDay: house.economy.rentPerDay,
    roomId: house.roomId,
    affordances,
    summary: summaryParts.join('，'),
  };
}

export function buildHouseWorldMeta(house: HouseInstanceSave, contracts: HouseContractSave[]): Record<string, unknown> {
  const observation = buildHouseObservation(house, contracts);
  return {
    type: 'house',
    definitionId: house.definitionId,
    displayId: observation.displayId,
    label: observation.name,
    stage: house.stage,
    ready: observation.ready,
    doorState: house.doorState,
    doorOpen: observation.doorOpen,
    locked: house.access?.locked === true,
    ownerName: house.ownership.ownerName,
    residentNpcId: house.tenancy.residentNpcId,
    residentNpcName: house.tenancy.residentNpcName,
    tenancyStatus: house.tenancy.status,
    contractStatus: observation.contractStatus,
    rentPerDay: house.economy.rentPerDay,
    roomId: house.roomId,
    affordances: observation.affordances,
    summary: observation.summary,
  };
}

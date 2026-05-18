import type { ObjectState, WorldObjectKind } from '../shared/worldStateTypes';

export interface ObservableRoom {
  id: string;
  label: string;
  templateId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  spawn: { x: number; y: number };
}

export interface RoomObservationObject {
  id: string;
  kind: WorldObjectKind;
  x: number;
  y: number;
  blocking?: boolean;
  interactable?: boolean;
  state?: string;
  meta: Record<string, unknown>;
}

type FurnitureDefinition = {
  id: string;
  kind: WorldObjectKind;
  label: string;
  type: string;
  x: number;
  y: number;
  affordances?: string[];
};

function houseIdFromRoomId(roomId: string): string | null {
  return roomId.startsWith('room:') ? roomId.slice('room:'.length) : null;
}

function roomBounds(room: ObservableRoom): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: room.x,
    y1: room.y,
    x2: room.x + room.w,
    y2: room.y + room.h,
  };
}

function roomBaseMeta(room: ObservableRoom): Record<string, unknown> {
  const houseId = houseIdFromRoomId(room.id);
  const displayId = room.label.replace(/\s*室内$/, '');
  return {
    roomId: room.id,
    houseId,
    displayId,
    templateId: room.templateId,
    isInterior: true,
    bounds: roomBounds(room),
    label: room.label,
  };
}

export function getRoomExitPoint(room: ObservableRoom): { x: number; y: number } {
  return {
    x: room.x + room.w / 2,
    y: room.y + room.h - 36,
  };
}

export function buildRoomObservationObjects(room: ObservableRoom): RoomObservationObject[] {
  const baseMeta = roomBaseMeta(room);
  const exit = getRoomExitPoint(room);
  const furniture: FurnitureDefinition[] = [
    {
      id: 'bed-left',
      kind: 'bed',
      label: '左侧卧室的粉色床',
      type: 'bed',
      x: room.x + 139,
      y: room.y + 187,
      affordances: ['sleep', 'inspect_furniture'],
    },
    {
      id: 'bed-right',
      kind: 'bed',
      label: '右侧卧室的蓝色床',
      type: 'bed',
      x: room.x + 565,
      y: room.y + 187,
      affordances: ['sleep', 'inspect_furniture'],
    },
    {
      id: 'sofa-left',
      kind: 'furniture',
      label: '客厅左侧沙发',
      type: 'sofa',
      x: room.x + 262,
      y: room.y + 393,
      affordances: ['sit', 'inspect_furniture'],
    },
    {
      id: 'sofa-right',
      kind: 'furniture',
      label: '客厅右侧沙发',
      type: 'sofa',
      x: room.x + 442,
      y: room.y + 393,
      affordances: ['sit', 'inspect_furniture'],
    },
    {
      id: 'living-table',
      kind: 'furniture',
      label: '客厅茶几',
      type: 'table',
      x: room.x + 366,
      y: room.y + 402,
      affordances: ['inspect_furniture'],
    },
    {
      id: 'bookshelf',
      kind: 'furniture',
      label: '书架',
      type: 'bookshelf',
      x: room.x + 105,
      y: room.y + 367,
      affordances: ['read', 'inspect_furniture'],
    },
    {
      id: 'counter',
      kind: 'furniture',
      label: '靠墙柜台',
      type: 'counter',
      x: room.x + 588,
      y: room.y + 332,
      affordances: ['inspect_furniture'],
    },
    {
      id: 'wardrobe',
      kind: 'furniture',
      label: '衣柜',
      type: 'wardrobe',
      x: room.x + 640,
      y: room.y + 167,
      affordances: ['inspect_furniture'],
    },
  ];

  return [
    {
      id: `room:${room.id}:place`,
      kind: 'room',
      x: room.x + room.w / 2,
      y: room.y + room.h / 2,
      blocking: false,
      interactable: false,
      state: 'inside',
      meta: {
        ...baseMeta,
        type: 'room',
        summary: `这里是${room.label}，有两间卧室和一个客厅。`,
        affordances: ['inspect_room'],
      },
    },
    {
      id: `room:${room.id}:exit`,
      kind: 'room_exit',
      x: exit.x,
      y: exit.y,
      blocking: false,
      interactable: false,
      state: 'open',
      meta: {
        ...baseMeta,
        type: 'room_exit',
        summary: `${room.label}的出口，通往房子外面。`,
        affordances: ['exit_room'],
      },
    },
    ...furniture.map((item) => ({
      id: `room:${room.id}:${item.id}`,
      kind: item.kind,
      x: item.x,
      y: item.y,
      blocking: false,
      interactable: false,
      state: item.type,
      meta: {
        ...baseMeta,
        type: item.type,
        label: item.label,
        summary: `${room.label}里的${item.label}`,
        affordances: item.affordances ?? ['inspect_furniture'],
      },
    })),
  ];
}

export function isRoomObject(objectItem: ObjectState): boolean {
  return objectItem.kind === 'room' || objectItem.meta?.isInterior === true;
}

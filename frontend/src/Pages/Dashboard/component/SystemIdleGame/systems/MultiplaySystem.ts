/**
 * MultiplaySystem — Socket.io client for multiplayer relay.
 * Connects to the backend socket.io server, handles room join/leave,
 * and relays game events (player position, item drops, tree chops) to peers.
 */
import { io, Socket } from 'socket.io-client';
import { gameBus } from '../shared/EventBus';

export type GameEventType =
  | 'player_move'
  | 'item_spawn'
  | 'item_claim'
  | 'tree_chop'
  | 'farm_till'
  | 'farm_water'
  | 'farm_plant'
  | 'farm_harvest'
  | 'creature_state'
  | 'player_sleep'
  | 'npc_say';

export interface RemoteGameEvent {
  type: GameEventType;
  payload: Record<string, unknown>;
  fromUserId: string;
}

export interface MultiplayRoomPlayer {
  userId: string;
  displayName: string;
}

export interface WorldSnapshot {
  choppedTreeIds: string[];
  worldItems: Array<{ itemId: string; x: number; y: number }>;
  /** Farm tiles — new: guest sees host's farm on join */
  farmTiles?: Array<{ tx: number; ty: number; state: string; cropId?: string }>;
  /** Creature states — new: guest sees host's chickens on join */
  creatureStates?: Array<{ creatureId: string; type: string; x: number; y: number; state: string }>;
  /** Host's current player position — used by guest to spawn the host as RemotePlayer */
  hostX?: number;
  hostY?: number;
  hostDisplayName?: string;
  /** Host's gameTick — guest snaps to this so clocks are in sync */
  gameTick?: number;
}

export class MultiplaySystem {
  private socket: Socket | null = null;
  private _roomId: string | null = null;

  connect(token: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = io('', {
        path: '/socket.io',
        auth: { token: token ?? '' },
        reconnectionAttempts: 5,
        timeout: 6000,
      });
      this.socket = socket;

      socket.once('connect', () => {
        console.log('[Multiplay] connected, id=', socket.id);
        resolve();
      });
      socket.once('connect_error', (err: Error) => {
        console.error('[Multiplay] connect error:', err.message);
        reject(err);
      });

      this._setupListeners(socket);
    });
  }

  private _setupListeners(socket: Socket): void {
    socket.on('room_joined', (data: { roomId: string; isHost: boolean; players: MultiplayRoomPlayer[] }) => {
      this._roomId = data.roomId;
      gameBus.emit('mp:room_joined', { isHost: data.isHost, roomId: data.roomId, players: data.players });
    });

    socket.on('peer_joined', (data: { userId: string; displayName: string }) => {
      gameBus.emit('mp:peer_joined', { userId: data.userId, displayName: data.displayName });
    });

    socket.on('peer_left', (data: { userId: string }) => {
      gameBus.emit('mp:peer_left', { userId: data.userId });
    });

    socket.on('game_event', (data: RemoteGameEvent) => {
      gameBus.emit('mp:game_event', data);
    });

    socket.on('room_error', (data: { message: string }) => {
      gameBus.emit('mp:error', { message: data.message });
    });

    socket.on('snapshot_requested', () => {
      gameBus.emit('mp:snapshot_requested', {});
    });

    socket.on('world_snapshot', (data: WorldSnapshot) => {
      gameBus.emit('mp:world_snapshot', data);
    });
  }

  joinRoom(roomId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('join_room', { roomId });
  }

  emit(type: GameEventType, payload: Record<string, unknown>): void {
    if (!this.socket?.connected || !this._roomId) return;
    this.socket.emit('game_event', { type, payload });
  }

  sendSnapshot(snapshot: WorldSnapshot): void {
    if (!this.socket?.connected || !this._roomId) return;
    this.socket.emit('world_snapshot', snapshot);
  }

  requestSnapshot(): void {
    if (!this.socket?.connected || !this._roomId) return;
    this.socket.emit('request_snapshot');
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this._roomId = null;
  }

  get isConnected(): boolean { return this.socket?.connected ?? false; }
  get roomId(): string | null { return this._roomId; }
}

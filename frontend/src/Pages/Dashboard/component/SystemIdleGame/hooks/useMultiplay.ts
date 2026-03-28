/**
 * useMultiplay — 多人联机状态、连接/断开逻辑，以及所有 mp:* gameBus 事件订阅。
 *
 * 订阅的 gameBus 事件：
 *   mp:relay              → 转发 Phaser 事件到 Socket.IO
 *   mp:sleep_state        → 转发睡眠状态
 *   world:item_picked_up  → 转发物品拾取
 *   mp:room_joined        → 加入房间回调
 *   mp:peer_joined        → 对方进入房间
 *   mp:peer_left          → 对方离开房间
 *   mp:game_event         → 应用远端游戏事件
 *   mp:error              → 错误提示
 *   mp:snapshot_requested → 主机发送快照
 *   mp:world_snapshot     → 客机接收快照
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject }       from 'react';
import { gameBus }              from '../shared/EventBus';
import { MultiplaySystem }      from '../systems/MultiplaySystem';
import type { MultiplayStatus } from '../components/MultiplayPanel';
import type { GameScene }       from '../GameScene';

interface UseMultiplayProps {
  sceneRef:         RefObject<GameScene | null>;
  tokenRef:         RefObject<string | null>;
  myDisplayNameRef: RefObject<string>;
  userId:           string | null;
}

export function useMultiplay({
  sceneRef,
  tokenRef,
  myDisplayNameRef,
  userId,
}: UseMultiplayProps) {
  // ── refs（供闭包内部访问）─────────────────────────────────────────────────
  const multiplayRef       = useRef<MultiplaySystem | null>(null);
  const multiplayActiveRef = useRef(false);
  const multiplayRoomIdRef = useRef<string | null>(null);
  const hostDisplayNameRef = useRef<string>('房主');

  // ── UI 状态 ───────────────────────────────────────────────────────────────
  const [multiplayStatus, setMultiplayStatus] = useState<MultiplayStatus>('idle');
  const [multiplayOpen,   setMultiplayOpen  ] = useState(false);
  const [multiplayRoomId, setMultiplayRoomId] = useState<string | null>(null);
  const [multiplayPeer,   setMultiplayPeer  ] = useState<{ displayName: string } | null>(null);
  const [multiplayError,  setMultiplayError ] = useState<string | null>(null);

  // ── gameBus 订阅 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      // Phaser → Socket.IO relay（player_move, tree_chop 等）
      gameBus.on('mp:relay', ({ type, payload }) => {
        if (multiplayActiveRef.current && multiplayRef.current?.isConnected) {
          multiplayRef.current.emit(type as any, payload);
        }
      }),

      // 睡眠状态同步
      gameBus.on('mp:sleep_state', ({ sleeping }) => {
        if (multiplayActiveRef.current && multiplayRef.current?.isConnected) {
          multiplayRef.current.emit('player_sleep', { sleeping });
        }
      }),

      // 物品被拾取 → 通知另一端
      gameBus.on('world:item_picked_up', ({ itemId, x, y }) => {
        if (multiplayActiveRef.current && multiplayRef.current?.isConnected) {
          multiplayRef.current.emit('item_claim', { itemId, x, y });
        }
      }),

      // 成功加入房间
      gameBus.on('mp:room_joined', ({ isHost, roomId, players }) => {
        setMultiplayRoomId(roomId);
        multiplayRoomIdRef.current = roomId;
        setMultiplayStatus(isHost ? 'hosting' : 'connected');
        if (!isHost) {
          const hostPlayer = players.find((p: any) => p.userId === roomId) ?? players[0];
          hostDisplayNameRef.current = hostPlayer?.displayName ?? '房主';
          setTimeout(() => multiplayRef.current?.requestSnapshot(), 500);
        }
      }),

      // 对方进入房间
      gameBus.on('mp:peer_joined', ({ displayName }) => {
        setMultiplayPeer({ displayName });
        setMultiplayStatus('connected');
        const snapshot = sceneRef.current?.getWorldSnapshot(myDisplayNameRef.current);
        if (snapshot) multiplayRef.current?.sendSnapshot(snapshot);
        sceneRef.current?.spawnRemotePlayer(300, 300, displayName);
        multiplayActiveRef.current = true;
      }),

      // 对方离开
      gameBus.on('mp:peer_left', () => {
        setMultiplayPeer(null);
        setMultiplayStatus('hosting');
        sceneRef.current?.removeRemotePlayer();
        multiplayActiveRef.current = false;
      }),

      // 远端游戏事件（位移、砍树等）
      gameBus.on('mp:game_event', (event) => {
        sceneRef.current?.applyRemoteEvent(event.type, event.payload);
      }),

      // 连接错误
      gameBus.on('mp:error', ({ message }) => {
        setMultiplayError(message);
        setMultiplayStatus('error');
      }),

      // 主机被请求发送快照
      gameBus.on('mp:snapshot_requested', () => {
        const snapshot = sceneRef.current?.getWorldSnapshot(myDisplayNameRef.current);
        if (snapshot && multiplayRef.current?.isConnected) {
          multiplayRef.current.sendSnapshot(snapshot);
        }
      }),

      // 客机收到世界快照
      gameBus.on('mp:world_snapshot', (snapshot) => {
        sceneRef.current?.applyWorldSnapshot(snapshot);
        if (snapshot.gameTick != null) sceneRef.current?.setGameTick(snapshot.gameTick);
        const hName = snapshot.hostDisplayName ?? hostDisplayNameRef.current;
        sceneRef.current?.spawnRemotePlayer(snapshot.hostX ?? 300, snapshot.hostY ?? 300, hName);
        multiplayActiveRef.current = true;
      }),
    ];
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 连接/房间操作 ──────────────────────────────────────────────────────────

  /** 懒加载并连接 MultiplaySystem。 */
  const getOrConnectMultiplay = useCallback(async (): Promise<MultiplaySystem> => {
    if (multiplayRef.current?.isConnected) return multiplayRef.current;
    const mp = new MultiplaySystem();
    multiplayRef.current = mp;
    await mp.connect(tokenRef.current);
    return mp;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 以自身 userId 作为 roomId 开房（主机）。 */
  const handleMultiplayHost = useCallback(async () => {
    if (!userId) return;
    setMultiplayStatus('connecting');
    try {
      const mp = await getOrConnectMultiplay();
      mp.joinRoom(userId);
    } catch {
      setMultiplayError('无法连接服务器');
      setMultiplayStatus('error');
    }
  }, [userId, getOrConnectMultiplay]);

  /** 以指定 roomId 加入已有房间（客机）。 */
  const handleMultiplayJoin = useCallback(async (roomId: string) => {
    setMultiplayStatus('connecting');
    try {
      const mp = await getOrConnectMultiplay();
      mp.joinRoom(roomId);
    } catch {
      setMultiplayError('无法连接服务器');
      setMultiplayStatus('error');
    }
  }, [getOrConnectMultiplay]);

  /** 断开连接并重置所有多人状态。 */
  const handleMultiplayDisconnect = useCallback(() => {
    multiplayRef.current?.disconnect();
    multiplayRef.current   = null;
    multiplayActiveRef.current = false;
    setMultiplayStatus('idle');
    setMultiplayRoomId(null);
    setMultiplayPeer(null);
    setMultiplayError(null);
    sceneRef.current?.removeRemotePlayer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // refs（供其他 hook 使用）
    multiplayRef,
    multiplayActiveRef,
    multiplayRoomIdRef,
    hostDisplayNameRef,
    // UI 状态
    multiplayStatus,
    multiplayOpen,
    setMultiplayOpen,
    multiplayRoomId,
    multiplayPeer,
    multiplayError,
    // 操作
    handleMultiplayHost,
    handleMultiplayJoin,
    handleMultiplayDisconnect,
  };
}

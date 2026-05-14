type GameEventMap = {


  // ── Game lifecycle ────────────────────────────────────────────────────────
  /** GameScene.create() finished — safe to access NPC entities. */
  'game:ready':             Record<string, never>;


  /** Fired every frame (throttled to ~1s) with current game time + date. */
  'tick:update':            { gameTick: number; timeStr: string; dateStr: string; dateTimeStr: string };
  
  'ui:show_message':        { text: string };


  
  'npc:speak':              { text: string; npcName: string };
};

type EventKey = keyof GameEventMap;
type Handler<K extends EventKey> = (payload: GameEventMap[K]) => void;
type StoredHandler = (payload: unknown) => void;

class EventBus {
    private listeners = new Map<EventKey, Set<StoredHandler>>();

    on<K extends EventKey>(event: K, handler: Handler<K>): () => void {
        const storedHandler: StoredHandler = (payload) => {
            handler(payload as GameEventMap[K]);
        };

        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        this.listeners.get(event)!.add(storedHandler);

        return () => {
            this.listeners.get(event)?.delete(storedHandler);
        };
    }

    emit<K extends EventKey>(event: K, payload: GameEventMap[K]): void {
        this.listeners.get(event)?.forEach((handler) => {
        handler(payload);
        });
    }

    clear(): void {
        this.listeners.clear();
    }
}

export const gameBus = new EventBus();

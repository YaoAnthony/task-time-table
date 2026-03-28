/**
 * Npc entity — wandering NPC with persistent memory and GPT-driven planning.
 *
 * Every NPC_THINK_INTERVAL real seconds the NPC sends its memory to the
 * backend /profile/npc/think endpoint.  The backend returns a list of
 * planned actions (say / move / idle …) which the NPC executes in order.
 * While no planned actions exist the NPC wanders randomly.
 */

import Phaser from 'phaser';
import type { NpcMemoryEntry, NpcAction } from '../types';
import { NPC_SPEED, NPC_THINK_INTERVAL, NPC_MAX_MEMORY, CHAR_FRAME_W, CHAR_FRAME_H } from '../constants';
import type { Pathfinder } from '../systems/Pathfinder';
import { PathingComponent } from '../shared/PathingComponent';
import { gameBus } from '../shared/EventBus';

export class Npc {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly name:   string;

  memory:         NpcMemoryEntry[] = [];
  plannedActions: NpcAction[]      = [];

  private scene: Phaser.Scene;

  // Sync provider functions (can't use EventBus for sync getters)
  private _getAuthToken:    (() => string | null) | null = null;
  private _getNpcInventory: ((name: string) => Record<string, number>) | null = null;

  // Movement state
  private mode:  'idle' | 'walk' = 'idle';
  private velX   = 0;
  private velY   = 0;
  private timer  = 2;   // seconds until next decision

  // A* pathfinding — delegated to PathingComponent
  private pathing: PathingComponent | null = null;
  private readonly NAV_SPEED  = NPC_SPEED * 1.6;
  private readonly REACH_DIST = 24;

  // Speech state
  private speechTimer   = 0;
  private _isThinking   = false;

  // AI cooldown
  private thinkCooldown = NPC_THINK_INTERVAL;

  // ── Confirmation gate (ask_confirm action pauses the queue) ────────────
  private waitingForConfirm = false;

  // ── World context (set by GameScene after create) ──────────────────────
  private worldCtx: import('../systems/ActionExecutor').WorldContext | null = null;

  // ── Follow mode ────────────────────────────────────────────────────────
  private playerSprite:  Phaser.Physics.Arcade.Sprite | null = null;
  private isFollowing    = false;
  private followCooldown = 0;

  // ── Dispatch mission ───────────────────────────────────────────────────
  private isDispatched = false;

  // Label / bubble text objects (set after construction via init())
  private labelText!: Phaser.GameObjects.Text;
  private bubbleText!: Phaser.GameObjects.Text;

  /** Set the provider for the current auth token (sync getter, can't use bus). */
  setAuthProvider(fn: () => string | null): void {
    this._getAuthToken = fn;
  }

  /** Set the provider for NPC inventory lookup (sync getter, can't use bus). */
  setInventoryProvider(fn: (name: string) => Record<string, number>): void {
    this._getNpcInventory = fn;
  }

  /** Query the NPC's current carried items (via the injected inventory provider). */
  getInventory(name: string): Record<string, number> {
    return this._getNpcInventory?.(name) ?? {};
  }

  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    name: string,
  ) {
    this.scene = scene;
    this.name  = name;

    this.sprite = scene.physics.add.sprite(x, y, 'player', 4);
    this.sprite.setScale(2).setTint(0x88ffaa).setCollideWorldBounds(true);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 10);
    body.setOffset((CHAR_FRAME_W - 16) / 2, CHAR_FRAME_H - 22); // same as player
    this.sprite.play('idle-up');
    this.sprite.setDepth(y + 96);

    this.createLabels(x, y);
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  private createLabels(x: number, y: number): void {
    this.labelText = this.scene.add.text(x, y - 58, this.name, {
      fontSize:        '9px',
      color:           '#ffff88',
      backgroundColor: '#00000099',
      padding:         { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(9998);

    this.bubbleText = this.scene.add.text(x, y - 74, '', {
      fontSize:        '9px',
      color:           '#222222',
      backgroundColor: '#ffffffdd',
      padding:         { x: 6, y: 4 },
      wordWrap:        { width: 120 },
    }).setOrigin(0.5, 1).setDepth(9999).setVisible(false);
  }

  // ── Memory ─────────────────────────────────────────────────────────────────

  /**
   * Seed the local memory cache from the backend on game boot.
   * The backend is the source of truth — this is for local display only.
   */
  loadMemories(entries: NpcMemoryEntry[]): void {
    this.memory = [...entries];
    // Keep only the most recent NPC_MAX_MEMORY for local display
    if (this.memory.length > NPC_MAX_MEMORY) {
      this.memory = this.memory.slice(-NPC_MAX_MEMORY);
    }
  }

  /**
   * Append a memory entry to the local cache (used for immediate speech-bubble
   * display). The backend persists the authoritative copy via /npc/chat.
   */
  addMemory(text: string, source: NpcMemoryEntry['source'], gameTick: number): void {
    const entry: NpcMemoryEntry = {
      id:           `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      gameTick,
      text,
      source,
      importance:   source === 'player' ? 6 : 5,
      keywords:     text.split(/[\s，。！？、]+/).filter(t => t.length >= 2),
      lastAccessed: gameTick,
    };
    this.memory.push(entry);
    if (this.memory.length > NPC_MAX_MEMORY) {
      this.memory.splice(0, this.memory.length - NPC_MAX_MEMORY);
    }
  }

  // ── A* navigation ─────────────────────────────────────────────────────────
  /** Attach the scene's Pathfinder so this NPC can navigate around obstacles. */
  setPathfinder(pf: Pathfinder): void {
    this.pathing = new PathingComponent(this.NAV_SPEED, this.REACH_DIST, pf);
  }

  /** Provide access to the game world (trees, items) for chop/pickup actions. */
  setWorldContext(ctx: import('../systems/ActionExecutor').WorldContext): void {
    this.worldCtx = ctx;
  }

  /** Pass the player sprite so the NPC can follow them. */
  setPlayerRef(sprite: Phaser.Physics.Arcade.Sprite): void {
    this.playerSprite = sprite;
  }

  /** Start following the player continuously. */
  startFollowing(): void { this.isFollowing = true; }

  /** Stop following the player. */
  stopFollowing(): void { this.isFollowing = false; }

  /**
   * Start a dispatch mission:
   *  1. Walk to the door and disappear.
   *  2. After 10 s reappear at the door.
   *  3. Fire onNpcDispatchReturn so React can call the backend for the story.
   */
  startDispatch(carriedItems: Record<string, number> = {}): void {
    this.isFollowing = false;
    this.navigateTo(502, 336, () => {
      // Hide sprite + UI labels while away
      this.sprite.setVisible(false);
      this.labelText.setVisible(false);
      this.bubbleText.setVisible(false);
      (this.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
      this.isDispatched = true;
      this.clearNavigation();
      gameBus.emit('npc:dispatch', { npcName: this.name, carriedItems });

      // Return after 10 s
      this.scene.time.delayedCall(10_000, () => {
        this.sprite.setPosition(502, 336);
        this.sprite.setVisible(true);
        this.labelText.setVisible(true);
        (this.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
        this.isDispatched = false;
        gameBus.emit('npc:dispatch_return', { npcName: this.name, carriedItems });
      });
    });
  }

  /**
   * Navigate to world position (tx, ty) using A*.
   * Clears any in-progress wandering / planned move actions.
   */
  navigateTo(tx: number, ty: number, onArrive?: () => void): void {
    // Clear pending random wander (but keep speech-only planned actions)
    this.plannedActions = this.plannedActions.filter(a => a.type === 'say');

    if (this.pathing) {
      this.pathing.navigateTo(this.sprite.x, this.sprite.y, tx, ty, onArrive);
      this.mode = 'walk';
    } else {
      // No pathfinder — head straight
      this.startMoveTo(tx, ty);
    }
  }

  /** Stop all active navigation immediately. */
  clearNavigation(): void {
    this.pathing?.clearNavigation();
    this.velX = 0;
    this.velY = 0;
    this.mode = 'idle';
  }

  /**
   * Pause the planned action queue and fire the React confirm dialog callback.
   * Called by the ask_confirm action handler in ActionExecutor (immediate path).
   */
  pauseForConfirm(question?: string): void {
    this.waitingForConfirm = true;
    this.clearNavigation();
    if (question) {
      gameBus.emit('npc:ask_confirm', { npcName: this.name, question });
    }
  }

  /**
   * Resume (or cancel) after the player responds to an ask_confirm dialog.
   * @param yes true = continue remaining queue; false = clear queue
   */
  respondToConfirm(yes: boolean): void {
    this.waitingForConfirm = false;
    if (!yes) {
      this.plannedActions = [];
      this.pathing?.clearNavigation();
    }
  }

  // ── Frame update (called from GameScene.update) ───────────────────────────
  update(dt: number, gameTick: number): void {
    // Skip ALL updates while NPC is off on a dispatch mission
    if (this.isDispatched) return;

    // AI think cooldown
    this.thinkCooldown -= dt;
    if (this.thinkCooldown <= 0) {
      this.thinkCooldown = NPC_THINK_INTERVAL;
      this.think(gameTick);
    }

    // ── Follow-player mode ─────────────────────────────────────────────────
    // Re-navigate toward player every second if they've drifted too far away.
    if (this.isFollowing && this.playerSprite) {
      this.followCooldown -= dt;
      if (this.followCooldown <= 0) {
        this.followCooldown = 1.0;
        const dist = Phaser.Math.Distance.Between(
          this.sprite.x, this.sprite.y,
          this.playerSprite.x, this.playerSprite.y,
        );
        if (dist > 72 && !this.pathing?.isMoving()) {
          // Stay slightly behind the player, not exactly on top
          this.navigateTo(this.playerSprite.x, this.playerSprite.y + 32);
        }
      }
    }

    // Waypoint following takes priority over random wandering
    if (this.pathing?.isMoving()) {
      const status = this.pathing.update(this.sprite, this.scene, 300);
      if (status === 'arrived') {
        this.mode  = 'idle';
        this.timer = 1.5;
      } else if (status === 'moving') {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        this.velX = body.velocity.x;
        this.velY = body.velocity.y;
        this.mode = 'walk';
      }
    } else {
      // Consume next planned action when idle
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.waitingForConfirm) {
          this.timer = 1; // keep waiting
        } else if (this.plannedActions.length > 0) {
          this.executeAction(this.plannedActions.shift()!, gameTick);
        } else {
          this.randomWander();
        }
      }
    }

    // Apply velocity (PathinComponent already sets velocity on the sprite body)
    if (!this.pathing?.isMoving()) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(this.velX, this.velY);
    }

    // Speech timer — skip auto-dismiss while the NPC is thinking
    if (!this._isThinking && this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) {
        this.bubbleText.setVisible(false);
      }
    }

    this.updateAnimation();
    this.sprite.setDepth(this.sprite.y + 96);

    // Keep labels glued to sprite
    this.labelText.setPosition(this.sprite.x, this.sprite.y - 58);
    if (this.bubbleText.visible) {
      this.bubbleText.setPosition(this.sprite.x, this.sprite.y - 74);
    }
  }

  // ── Action execution ───────────────────────────────────────────────────────
  private executeAction(action: NpcAction, gameTick: number): void {
    switch (action.type) {
      case 'say': {
        const text = action.text ?? '';
        this.say(text, gameTick);
        this.timer = action.duration ?? 4;
        break;
      }
      case 'move':
      case 'water': {
        // target must be pre-resolved to 'coords' by ActionExecutor before queuing
        if (action.target?.kind === 'coords') {
          this.navigateTo(action.target.x, action.target.y);
        } else {
          // Legacy fallback (x/y fields no longer used)
          this.navigateTo(this.sprite.x, this.sprite.y);
        }
        this.timer = action.duration ?? 3;
        break;
      }
      case 'idle':
        this.velX = 0; this.velY = 0;
        this.mode = 'idle';
        this.timer = action.duration ?? 3;
        break;

      case 'pickup_item': {
        console.log(`[Npc] executeAction pickup_item: itemId=${action.itemId} target=`, action.target);
        // target is pre-resolved to coords by ActionExecutor before queuing
        if (action.target?.kind === 'coords' && action.itemId) {
          const itemId = action.itemId;
          this.navigateTo(action.target.x, action.target.y, () => {
            console.log(`[Npc] pickup_item onArrive: claiming itemId=${itemId}`);
            // Use worldCtx if available (immediate path), else fall back to callback
            if (this.worldCtx) {
              this.worldCtx.claimWorldItem(itemId, this.name);
            } else {
              gameBus.emit('npc:pickup_world_item', { npcName: this.name, itemId, qty: 1 });
            }
          });
        }
        this.timer = action.duration ?? 3;
        break;
      }

      case 'chop_tree': {
        // Re-find the nearest tree at execution time (NPC may have moved since queue was built)
        const treeTarget = (() => {
          if (action.target?.kind === 'coords' && action.itemId) {
            return { id: action.itemId, x: action.target.x, y: action.target.y };
          }
          return this.worldCtx?.findNearestTree(this.sprite.x, this.sprite.y) ?? null;
        })();

        console.log(`[Npc] executeAction chop_tree: worldCtx=${!!this.worldCtx} treeTarget=`, treeTarget);
        if (treeTarget) {
          const { id: treeId, x, y } = treeTarget;
          this.navigateTo(x, y, () => {
            console.log(`[Npc] chop_tree onArrive: chopping treeId=${treeId}`);
            if (this.worldCtx) {
              this.worldCtx.chopTreeById(treeId);
            } else {
              gameBus.emit('npc:chop_tree', { npcName: this.name, treeId });
            }
          });
        } else {
          console.warn('[Npc] chop_tree: no tree found!');
        }
        this.timer = action.duration ?? 5;
        break;
      }

      case 'drop_item': {
        const itemId = action.itemId;
        if (itemId) {
          const x = this.sprite.x;
          const y = this.sprite.y;
          if (this.worldCtx) {
            this.worldCtx.dropWorldItem(x, y, itemId, this.name);
          } else {
            gameBus.emit('npc:drop_item', { npcName: this.name, itemId, qty: 1, x, y });
          }
        }
        this.timer = action.duration ?? 1;
        break;
      }

      case 'ask_confirm': {
        const question = action.question ?? action.text ?? '确认吗？';
        this.say(question, gameTick);
        this.waitingForConfirm = true;
        this.clearNavigation();
        gameBus.emit('npc:ask_confirm', { npcName: this.name, question });
        this.timer = action.duration ?? 1;
        break;
      }

      case 'follow_player':
        this.startFollowing();
        this.timer = 1;
        break;

      case 'stop_follow':
        this.stopFollowing();
        this.timer = 1;
        break;

      case 'dispatch': {
        // Grab whatever the NPC is carrying (sync provider, can't use bus)
        const carried = this._getNpcInventory?.(this.name) ?? {};
        this.startDispatch(carried);
        this.timer = 2;
        break;
      }

      default:
        this.velX = 0; this.velY = 0;
        this.mode = 'idle';
        this.timer = 3;
    }
  }

  /**
   * Push pre-resolved actions into the planned queue for sequential execution.
   * Called by ActionExecutor when say+move sequencing is required.
   */
  queueActions(actions: NpcAction[], _gameTick: number): void {
    this.plannedActions.push(...actions);
  }

  say(text: string, gameTick: number): void {
    this._isThinking = false;
    this.bubbleText.setText(text).setVisible(true);
    this.speechTimer = 4.5;
    this.addMemory(text, 'npc', gameTick);
    gameBus.emit('npc:speak', { text, npcName: this.name });
  }

  /** True if player is within radius pixels of this NPC. */
  isNearPlayer(px: number, py: number, radius = 100): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  /**
   * Show / hide the "thinking" indicator in the speech bubble.
   * While thinking=true the auto-dismiss timer is paused.
   */
  setThinking(thinking: boolean): void {
    this._isThinking = thinking;
    if (thinking) {
      this.bubbleText.setText('…').setVisible(true);
      this.speechTimer = 0;   // will stay visible until setThinking(false)
    } else {
      // If still showing the placeholder, hide it (say() will show the reply)
      if (this.bubbleText.text === '…') {
        this.bubbleText.setVisible(false);
      }
    }
  }

  private startMoveTo(tx: number, ty: number): void {
    const dx  = tx - this.sprite.x;
    const dy  = ty - this.sprite.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      this.velX = (dx / len) * NPC_SPEED;
      this.velY = (dy / len) * NPC_SPEED;
      this.mode = 'walk';
    }
  }

  private randomWander(): void {
    if (Math.random() < 0.55) {
      const angle = Math.random() * Math.PI * 2;
      this.velX  = Math.cos(angle) * NPC_SPEED;
      this.velY  = Math.sin(angle) * NPC_SPEED;
      this.mode  = 'walk';
      this.timer = 1.2 + Math.random() * 2;
    } else {
      this.velX = 0; this.velY = 0;
      this.mode  = 'idle';
      this.timer = 1.5 + Math.random() * 2.5;
    }
  }

  private updateAnimation(): void {
    if (this.mode === 'walk' && (this.velX !== 0 || this.velY !== 0)) {
      const dir = this.velToDir(this.velX, this.velY);
      if (this.sprite.anims.currentAnim?.key !== `walk-${dir}`) {
        this.sprite.play(`walk-${dir}`);
      }
    } else {
      const cur = this.sprite.anims.currentAnim?.key ?? '';
      if (cur.startsWith('walk-')) {
        this.sprite.play(`idle-${cur.slice(5)}`);
      }
    }
  }

  private velToDir(vx: number, vy: number): string {
    if (Math.abs(vy) > Math.abs(vx) * 1.6) return vy < 0 ? 'up' : 'down';
    return vx < 0 ? 'left' : 'right';
  }

  // ── GPT think ──────────────────────────────────────────────────────────────
  private async think(gameTick: number): Promise<void> {
    const token = this._getAuthToken?.();
    if (!token) return;   // skip if not logged in yet
    try {
      // Memory is now loaded server-side from the DB — no need to send it here.
      const res = await fetch('/api/profile/npc/think', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body:    JSON.stringify({ npcName: this.name, gameTick }),
      });
      if (!res.ok) return;
      const plan = await res.json() as { actions?: NpcAction[] };
      if (Array.isArray(plan.actions) && plan.actions.length > 0) {
        // Append new planned actions (don't discard existing queue)
        this.plannedActions.push(...plan.actions);
      }
    } catch {
      // Network / parse error — silently ignore, fall back to random wander
    }
  }
}

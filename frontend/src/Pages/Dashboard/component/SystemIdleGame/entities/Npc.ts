/**
 * Npc entity — wandering NPC with persistent memory and GPT-driven planning.
 *
 * Every NPC_THINK_INTERVAL real seconds the NPC sends its memory to the
 * backend /profile/npc/think endpoint.  The backend returns a list of
 * planned actions (say / move / idle …) which the NPC executes in order.
 * While no planned actions exist the NPC wanders randomly.
 */

import Phaser from 'phaser';
import type { NpcMemoryEntry, NpcPlannedAction, GameCallbacks } from '../types';
import { NPC_SPEED, NPC_THINK_INTERVAL, NPC_MAX_MEMORY, CHAR_FRAME_W, CHAR_FRAME_H } from '../constants';

export class Npc {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly name:   string;

  memory:         NpcMemoryEntry[]   = [];
  plannedActions: NpcPlannedAction[] = [];

  private scene:       Phaser.Scene;
  private callbacks:   GameCallbacks;

  // Movement state
  private mode:  'idle' | 'walk' = 'idle';
  private velX   = 0;
  private velY   = 0;
  private timer  = 2;   // seconds until next decision

  // Speech state
  private speechTimer   = 0;
  private _isThinking   = false;

  // AI cooldown
  private thinkCooldown = NPC_THINK_INTERVAL;

  // Label / bubble text objects (set after construction via init())
  private labelText!: Phaser.GameObjects.Text;
  private bubbleText!: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    name: string,
    callbacks: GameCallbacks,
  ) {
    this.scene     = scene;
    this.name      = name;
    this.callbacks = callbacks;

    this.sprite = scene.physics.add.sprite(x, y, 'player', 4);
    this.sprite.setScale(2).setTint(0x88ffaa).setCollideWorldBounds(true);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 10);
    body.setOffset((CHAR_FRAME_W - 16) / 2, CHAR_FRAME_H - 14);
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

  // ── Frame update (called from GameScene.update) ───────────────────────────
  update(dt: number, gameTick: number): void {
    // AI think cooldown
    this.thinkCooldown -= dt;
    if (this.thinkCooldown <= 0) {
      this.thinkCooldown = NPC_THINK_INTERVAL;
      this.think(gameTick);
    }

    // Consume next planned action when idle
    this.timer -= dt;
    if (this.timer <= 0 && this.plannedActions.length > 0) {
      this.executeAction(this.plannedActions.shift()!, gameTick);
    } else if (this.timer <= 0) {
      this.randomWander();
    }

    // Apply velocity
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(this.velX, this.velY);

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
  private executeAction(action: NpcPlannedAction, gameTick: number): void {
    switch (action.type) {
      case 'say': {
        const text = action.text ?? '';
        this.say(text, gameTick);
        this.timer = action.duration ?? 4;
        break;
      }
      case 'move': {
        this.startMoveTo(action.x ?? this.sprite.x, action.y ?? this.sprite.y);
        this.timer = action.duration ?? 3;
        break;
      }
      case 'idle':
      default:
        this.velX = 0; this.velY = 0;
        this.mode = 'idle';
        this.timer = action.duration ?? 3;
    }
  }

  say(text: string, gameTick: number): void {
    this._isThinking = false;
    this.bubbleText.setText(text).setVisible(true);
    this.speechTimer = 4.5;
    this.addMemory(text, 'npc', gameTick);
    this.callbacks.onNpcSpeak?.(text, this.name);
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
    const token = this.callbacks.getAuthToken?.();
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
      const plan = await res.json() as { actions?: NpcPlannedAction[] };
      if (Array.isArray(plan.actions) && plan.actions.length > 0) {
        // Append new planned actions (don't discard existing queue)
        this.plannedActions.push(...plan.actions);
      }
    } catch {
      // Network / parse error — silently ignore, fall back to random wander
    }
  }
}

import type { PetMemorySeed } from './PetCatalog';

export class PetMemoryStore {
  private readonly memories = new Map<string, PetMemorySeed>();

  constructor(initial: PetMemorySeed[] = []) {
    initial.forEach((memory) => this.remember(memory));
  }

  remember(memory: PetMemorySeed): void {
    const existing = this.memories.get(memory.id);
    this.memories.set(memory.id, {
      ...existing,
      ...memory,
      importance: Math.max(existing?.importance ?? 0, memory.importance),
      createdAtTick: existing?.createdAtTick ?? memory.createdAtTick,
      lastSeenTick: memory.lastSeenTick ?? existing?.lastSeenTick,
    });
  }

  list(): PetMemorySeed[] {
    return [...this.memories.values()]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 24);
  }
}

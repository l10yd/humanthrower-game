/** Minimal typed FIFO queue — the transaction/event channel between systems (GDD §68). */
export class Queue<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  drain(): T[] {
    const out = this.items;
    this.items = [];
    return out;
  }

  get size(): number {
    return this.items.length;
  }
}

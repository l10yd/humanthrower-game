/** Generic object pool (GDD §35): pooled objects expose reset(). */
export class ObjectPool<T> {
  private free: T[] = [];
  private used = new Set<T>();

  constructor(
    private factory: () => T,
    private resetter: (item: T) => void,
    prealloc = 0,
  ) {
    for (let i = 0; i < prealloc; i++) this.free.push(factory());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.used.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.used.delete(item)) return;
    this.resetter(item);
    this.free.push(item);
  }

  releaseAll(items: Iterable<T>): void {
    for (const item of items) this.release(item);
  }

  get usedCount(): number {
    return this.used.size;
  }

  get freeCount(): number {
    return this.free.length;
  }

  forEachUsed(fn: (item: T) => void): void {
    for (const item of this.used) fn(item);
  }
}

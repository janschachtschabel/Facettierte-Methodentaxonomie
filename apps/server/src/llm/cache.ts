export class LruTtlCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.maxSize <= 0) return;
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  size(): number {
    return this.map.size;
  }
}

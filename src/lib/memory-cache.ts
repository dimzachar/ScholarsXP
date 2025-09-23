type Entry<T> = { value: T; expires: number }

export class MemoryCache<T = any> {
  private store = new Map<string, Entry<T>>()
  constructor(private max = 500) {}

  get(key: string): T | undefined {
    const row = this.store.get(key)
    if (!row) return undefined
    if (row.expires > Date.now()) return row.value
    this.store.delete(key)
    return undefined
  }

  set(key: string, value: T, ttlMs: number): void {
    const expires = Date.now() + Math.max(0, ttlMs)
    this.store.set(key, { value, expires })
    // Simple eviction by insertion order when size exceeds max
    if (this.store.size > this.max) {
      const firstKey = this.store.keys().next().value
      if (firstKey) this.store.delete(firstKey)
    }
  }

  delete(key: string): void {
    this.store.delete(key)
  }
}

// Shared singleton for process lifetime
export const sharedMemoryCache = new MemoryCache<any>(500)


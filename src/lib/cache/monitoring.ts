interface CacheMetrics {
  hits: number
  misses: number
  hitRate: number
  avgResponseTime: number
  errorCount: number
}

export class CacheMonitoring {
  private metrics: Map<string, CacheMetrics> = new Map()

  recordHit(layer: string, key: string, responseTime: number): void {
    const metrics = this.getOrCreateMetrics(layer)
    metrics.hits++
    this.updateResponseTime(metrics, responseTime)
    this.updateHitRate(metrics)
  }

  recordMiss(layer: string, key: string): void {
    const metrics = this.getOrCreateMetrics(layer)
    metrics.misses++
    this.updateHitRate(metrics)
  }

  recordError(layer: string, error: Error): void {
    const metrics = this.getOrCreateMetrics(layer)
    metrics.errorCount++
  }

  getAllMetrics(): Record<string, CacheMetrics> {
    const result: Record<string, CacheMetrics> = {}
    for (const [layer, metrics] of this.metrics.entries()) {
      result[layer] = { ...metrics }
    }
    return result
  }

  private getOrCreateMetrics(layer: string): CacheMetrics {
    if (!this.metrics.has(layer)) {
      this.metrics.set(layer, {
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgResponseTime: 0,
        errorCount: 0
      })
    }
    return this.metrics.get(layer)!
  }

  private updateHitRate(metrics: CacheMetrics): void {
    const total = metrics.hits + metrics.misses
    metrics.hitRate = total > 0 ? metrics.hits / total : 0
  }

  private updateResponseTime(metrics: CacheMetrics, responseTime: number): void {
    metrics.avgResponseTime = (metrics.avgResponseTime + responseTime) / 2
  }
}

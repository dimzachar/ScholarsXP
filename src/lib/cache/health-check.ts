import { SimplifiedMultiLayerCache } from './enhanced-cache'

export class CacheHealthCheck {
  private cache: SimplifiedMultiLayerCache

  constructor(cache: SimplifiedMultiLayerCache) {
    this.cache = cache
  }

  async performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: Record<string, any>
    timestamp: string
    recommendations: string[]
  }> {
    const timestamp = new Date().toISOString()
    console.log(`🏥 Performing cache health check at ${timestamp}`)

    const results = {
      memoryCache: await this.checkMemoryCache(),
      databaseCache: await this.checkDatabaseCache(),
      performance: await this.checkPerformance(),
      capacity: await this.checkCapacity(),
      connectivity: await this.checkConnectivity()
    }

    const status = this.determineOverallStatus(results)
    const recommendations = this.generateRecommendations(results)

    return {
      status,
      details: results,
      timestamp,
      recommendations
    }
  }

  private async checkMemoryCache(): Promise<{ status: string; details: any }> {
    try {
      const testKey = 'health-check-memory'
      const testData = { timestamp: Date.now(), test: 'memory-cache' }

      // Test write operation
      await this.cache.set(testKey, testData, 60)
      
      // Test read operation
      const retrieved = await this.cache.get(testKey)
      
      // Test data integrity
      const isWorking = JSON.stringify(retrieved) === JSON.stringify(testData)

      // Clean up test data
      await this.cache.delete(testKey)

      const stats = this.cache.getStats()

      return {
        status: isWorking ? 'healthy' : 'unhealthy',
        details: {
          working: isWorking,
          memorySize: stats.memory.size,
          memoryUsage: stats.memory.calculatedSize,
          memoryLimit: stats.memory.maxSize,
          utilizationPercent: (stats.memory.calculatedSize / stats.memory.maxSize) * 100
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          working: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private async checkDatabaseCache(): Promise<{ status: string; details: any }> {
    try {
      const testKey = 'health-check-database'
      const testData = { timestamp: Date.now(), test: 'database-cache' }

      // Test database cache by setting data
      await this.cache.set(testKey, testData, 60)

      // Clear memory cache to force database lookup
      const memoryCache = (this.cache as any).memoryCache
      memoryCache.delete(testKey)

      // This should now fetch from database cache
      const retrieved = await this.cache.get(testKey)
      
      const isWorking = retrieved !== null

      // Clean up test data
      await this.cache.delete(testKey)

      return {
        status: isWorking ? 'healthy' : 'degraded',
        details: {
          working: isWorking,
          dataIntegrity: JSON.stringify(retrieved) === JSON.stringify(testData)
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          working: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private async checkPerformance(): Promise<{ status: string; details: any }> {
    try {
      const testKey = 'health-check-performance'
      const testData = { data: 'performance-test', timestamp: Date.now() }

      // Test write performance
      const writeStart = performance.now()
      await this.cache.set(testKey, testData, 60)
      const writeTime = performance.now() - writeStart

      // Test read performance (should hit memory cache)
      const readStart = performance.now()
      await this.cache.get(testKey)
      const readTime = performance.now() - readStart

      // Test cache miss performance
      const missStart = performance.now()
      await this.cache.get('non-existent-key-for-performance-test')
      const missTime = performance.now() - missStart

      // Clean up
      await this.cache.delete(testKey)

      const avgResponseTime = (writeTime + readTime + missTime) / 3

      return {
        status: avgResponseTime < 10 ? 'healthy' : avgResponseTime < 50 ? 'degraded' : 'unhealthy',
        details: {
          writeTime: parseFloat(writeTime.toFixed(3)),
          readTime: parseFloat(readTime.toFixed(3)),
          missTime: parseFloat(missTime.toFixed(3)),
          avgResponseTime: parseFloat(avgResponseTime.toFixed(3))
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private async checkCapacity(): Promise<{ status: string; details: any }> {
    try {
      const stats = this.cache.getStats()
      const utilizationPercent = (stats.memory.calculatedSize / stats.memory.maxSize) * 100
      
      let status: string
      if (utilizationPercent < 70) {
        status = 'healthy'
      } else if (utilizationPercent < 90) {
        status = 'degraded'
      } else {
        status = 'unhealthy'
      }

      return {
        status,
        details: {
          memorySize: stats.memory.size,
          memoryUsage: stats.memory.calculatedSize,
          memoryLimit: stats.memory.maxSize,
          utilizationPercent: parseFloat(utilizationPercent.toFixed(2)),
          itemCount: stats.memory.size
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private async checkConnectivity(): Promise<{ status: string; details: any }> {
    try {
      // Test database connectivity by attempting a simple operation
      const testKey = 'health-check-connectivity'
      const testData = { connectivity: 'test' }

      await this.cache.set(testKey, testData, 30)
      const result = await this.cache.get(testKey)
      await this.cache.delete(testKey)

      return {
        status: result ? 'healthy' : 'degraded',
        details: {
          databaseConnected: result !== null,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          databaseConnected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private determineOverallStatus(results: Record<string, any>): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(results).map(r => r.status)

    if (statuses.includes('unhealthy')) return 'unhealthy'
    if (statuses.includes('degraded')) return 'degraded'
    return 'healthy'
  }

  private generateRecommendations(results: Record<string, any>): string[] {
    const recommendations: string[] = []

    // Memory cache recommendations
    if (results.memoryCache?.details?.utilizationPercent > 90) {
      recommendations.push('Memory cache is near capacity - consider increasing max size or reducing TTL values')
    }

    if (results.memoryCache?.details?.utilizationPercent > 70) {
      recommendations.push('Memory cache utilization is high - monitor for performance impact')
    }

    // Performance recommendations
    if (results.performance?.details?.avgResponseTime > 50) {
      recommendations.push('Cache response times are slow - investigate database connectivity or optimize queries')
    }

    if (results.performance?.details?.readTime > 5) {
      recommendations.push('Memory cache read times are high - check for memory pressure')
    }

    // Database cache recommendations
    if (results.databaseCache?.status === 'degraded') {
      recommendations.push('Database cache is experiencing issues - check database connectivity and performance')
    }

    if (results.databaseCache?.status === 'unhealthy') {
      recommendations.push('Database cache is not working - verify database connection and cache_entries table')
    }

    // Connectivity recommendations
    if (results.connectivity?.status !== 'healthy') {
      recommendations.push('Database connectivity issues detected - check network and database status')
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('Cache system is operating normally')
    }

    return recommendations
  }

  async getDetailedMetrics(): Promise<any> {
    const stats = this.cache.getStats()
    const healthCheck = await this.performHealthCheck()

    return {
      ...healthCheck,
      metrics: {
        memory: stats.memory,
        monitoring: stats.monitoring,
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform
      }
    }
  }
}

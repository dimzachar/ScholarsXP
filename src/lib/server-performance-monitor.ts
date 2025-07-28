import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side performance monitoring system
 * Tracks API performance, response times, cache efficiency, and system health
 */

export interface APIPerformanceMetrics {
  endpoint: string
  method: string
  statusCode: number
  responseTime: number
  responseSize: number
  cacheHit: boolean
  compressionRatio?: number
  userAgent?: string
  timestamp: Date
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage
  cpuUsage?: number
  activeConnections: number
  timestamp: Date
}

export interface PerformanceStats {
  totalRequests: number
  averageResponseTime: number
  p95ResponseTime: number
  p99ResponseTime: number
  errorRate: number
  cacheHitRate: number
  compressionRate: number
  slowestEndpoints: Array<{
    endpoint: string
    averageTime: number
    requestCount: number
  }>
  fastestEndpoints: Array<{
    endpoint: string
    averageTime: number
    requestCount: number
  }>
}

/**
 * Server-side performance monitor class
 */
export class ServerPerformanceMonitor {
  private static metrics: APIPerformanceMetrics[] = []
  private static systemMetrics: SystemMetrics[] = []
  private static maxMetrics = 10000 // Keep last 10k metrics
  private static maxSystemMetrics = 1000 // Keep last 1k system metrics
  
  /**
   * Record API performance metrics
   */
  static recordAPICall(metrics: APIPerformanceMetrics): void {
    this.metrics.push(metrics)
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }
    
    // Log slow requests
    if (metrics.responseTime > 2000) {
      console.warn(`🐌 Slow API call: ${metrics.method} ${metrics.endpoint} - ${metrics.responseTime}ms`)
    }
    
    // Log large responses
    if (metrics.responseSize > 1024 * 1024) { // > 1MB
      console.warn(`📦 Large response: ${metrics.endpoint} - ${(metrics.responseSize / 1024 / 1024).toFixed(2)}MB`)
    }
  }
  
  /**
   * Record system metrics
   */
  static recordSystemMetrics(): void {
    const memoryUsage = process.memoryUsage()
    
    this.systemMetrics.push({
      memoryUsage,
      activeConnections: 0, // Would need to track this separately
      timestamp: new Date()
    })
    
    // Keep only recent system metrics
    if (this.systemMetrics.length > this.maxSystemMetrics) {
      this.systemMetrics = this.systemMetrics.slice(-this.maxSystemMetrics)
    }
    
    // Log memory warnings
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024
    if (heapUsedMB > 500) { // > 500MB
      console.warn(`🧠 High memory usage: ${heapUsedMB.toFixed(2)}MB`)
    }
  }
  
  /**
   * Get comprehensive performance statistics
   */
  static getStats(timeWindow?: number): PerformanceStats {
    const cutoff = timeWindow ? new Date(Date.now() - timeWindow) : new Date(0)
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff)
    
    if (recentMetrics.length === 0) {
      return this.getEmptyStats()
    }
    
    const responseTimes = recentMetrics.map(m => m.responseTime).sort((a, b) => a - b)
    const totalRequests = recentMetrics.length
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length
    const compressed = recentMetrics.filter(m => m.compressionRatio && m.compressionRatio > 0).length
    
    // Calculate percentiles
    const p95Index = Math.floor(responseTimes.length * 0.95)
    const p99Index = Math.floor(responseTimes.length * 0.99)
    
    // Group by endpoint for analysis
    const endpointStats = new Map<string, { times: number[], count: number }>()
    recentMetrics.forEach(m => {
      const key = `${m.method} ${m.endpoint}`
      if (!endpointStats.has(key)) {
        endpointStats.set(key, { times: [], count: 0 })
      }
      const stats = endpointStats.get(key)!
      stats.times.push(m.responseTime)
      stats.count++
    })
    
    // Calculate endpoint averages
    const endpointAverages = Array.from(endpointStats.entries()).map(([endpoint, stats]) => ({
      endpoint,
      averageTime: stats.times.reduce((sum, time) => sum + time, 0) / stats.times.length,
      requestCount: stats.count
    }))
    
    const slowestEndpoints = endpointAverages
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10)
    
    const fastestEndpoints = endpointAverages
      .filter(e => e.requestCount >= 5) // Only include endpoints with sufficient data
      .sort((a, b) => a.averageTime - b.averageTime)
      .slice(0, 10)
    
    return {
      totalRequests,
      averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      p95ResponseTime: responseTimes[p95Index] || 0,
      p99ResponseTime: responseTimes[p99Index] || 0,
      errorRate: (errorCount / totalRequests) * 100,
      cacheHitRate: (cacheHits / totalRequests) * 100,
      compressionRate: (compressed / totalRequests) * 100,
      slowestEndpoints,
      fastestEndpoints
    }
  }
  
  /**
   * Get system health metrics
   */
  static getSystemHealth(): {
    memory: {
      heapUsed: number
      heapTotal: number
      external: number
      rss: number
    }
    uptime: number
    nodeVersion: string
  } {
    const memoryUsage = process.memoryUsage()
    
    return {
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        rss: Math.round(memoryUsage.rss / 1024 / 1024) // MB
      },
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version
    }
  }
  
  /**
   * Get performance report for specific endpoint
   */
  static getEndpointReport(endpoint: string, timeWindow?: number): {
    requestCount: number
    averageResponseTime: number
    errorRate: number
    cacheHitRate: number
    responseTimes: number[]
    statusCodes: Record<number, number>
  } {
    const cutoff = timeWindow ? new Date(Date.now() - timeWindow) : new Date(0)
    const endpointMetrics = this.metrics.filter(m => 
      m.endpoint === endpoint && m.timestamp >= cutoff
    )
    
    if (endpointMetrics.length === 0) {
      return {
        requestCount: 0,
        averageResponseTime: 0,
        errorRate: 0,
        cacheHitRate: 0,
        responseTimes: [],
        statusCodes: {}
      }
    }
    
    const responseTimes = endpointMetrics.map(m => m.responseTime)
    const errorCount = endpointMetrics.filter(m => m.statusCode >= 400).length
    const cacheHits = endpointMetrics.filter(m => m.cacheHit).length
    
    const statusCodes = endpointMetrics.reduce((acc, m) => {
      acc[m.statusCode] = (acc[m.statusCode] || 0) + 1
      return acc
    }, {} as Record<number, number>)
    
    return {
      requestCount: endpointMetrics.length,
      averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      errorRate: (errorCount / endpointMetrics.length) * 100,
      cacheHitRate: (cacheHits / endpointMetrics.length) * 100,
      responseTimes,
      statusCodes
    }
  }
  
  /**
   * Clear all metrics
   */
  static reset(): void {
    this.metrics = []
    this.systemMetrics = []
  }
  
  private static getEmptyStats(): PerformanceStats {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      cacheHitRate: 0,
      compressionRate: 0,
      slowestEndpoints: [],
      fastestEndpoints: []
    }
  }
}

/**
 * Performance monitoring middleware
 */
export function withServerPerformanceMonitoring<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest
    const startTime = Date.now()

    try {
      const response = await handler(...args)

      // Check if response is valid
      if (!response || !response.headers) {
        console.warn('Invalid response received in performance monitor')
        return response
      }

      const responseTime = Date.now() - startTime

      // Extract response size safely
      const responseSize = response.headers.get('content-length')
        ? parseInt(response.headers.get('content-length')!)
        : 0

      // Check if response was compressed
      const compressionRatio = response.headers.get('x-compression-ratio')
        ? parseFloat(response.headers.get('x-compression-ratio')!)
        : undefined

      // Check cache hit
      const cacheHit = response.headers.get('x-cache')?.includes('HIT') ||
                       response.headers.get('x-cache')?.includes('OPTIMIZED') ||
                       false

      // Record metrics
      ServerPerformanceMonitor.recordAPICall({
        endpoint: new URL(request.url).pathname,
        method: request.method,
        statusCode: response.status,
        responseTime,
        responseSize,
        cacheHit,
        compressionRatio,
        userAgent: request.headers.get('user-agent') || undefined,
        timestamp: new Date()
      })

      // Add performance headers safely
      try {
        response.headers.set('X-Response-Time', `${responseTime}ms`)
        response.headers.set('X-Performance-Monitored', 'true')
      } catch (headerError) {
        console.warn('Failed to set performance headers:', headerError)
      }

      return response
    } catch (error) {
      const responseTime = Date.now() - startTime

      // Record error metrics
      ServerPerformanceMonitor.recordAPICall({
        endpoint: new URL(request.url).pathname,
        method: request.method,
        statusCode: 500,
        responseTime,
        responseSize: 0,
        cacheHit: false,
        timestamp: new Date()
      })

      throw error
    }
  }
}

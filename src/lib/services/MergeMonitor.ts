/**
 * Merge Monitor
 * 
 * Provides monitoring, logging, and alerting capabilities for the merge system.
 * Tracks performance metrics, error rates, and system health.
 */

import { createServiceClient } from '@/lib/supabase-service'
import type { MergeResult } from './MergeService'

export interface MergeMetrics {
  totalMerges: number
  successRate: number
  averageProcessingTime: number
  errorRate: number
  recentFailures: number
  performanceScore: number
}

export interface MergeAlert {
  id: string
  type: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  details: any
  timestamp: string
  resolved: boolean
}

export class MergeMonitor {
  private supabase = createServiceClient()
  private alertThresholds = {
    errorRate: 0.05, // 5% error rate threshold
    processingTime: 30000, // 30 second processing time threshold
    consecutiveFailures: 3 // Alert after 3 consecutive failures
  }

  /**
   * Records successful merge completion
   */
  async recordMergeCompletion(result: MergeResult, processingTime: number): Promise<void> {
    try {
      // Log performance metrics
      await this.logPerformanceMetric({
        type: 'MERGE_COMPLETION',
        processingTime,
        success: result.success,
        details: result.details,
        timestamp: new Date().toISOString()
      })

      // Check for performance alerts
      if (processingTime > this.alertThresholds.processingTime) {
        await this.createAlert({
          type: 'WARNING',
          message: `Merge processing time exceeded threshold: ${processingTime}ms`,
          details: { processingTime, mergeId: result.mergeId },
          timestamp: new Date().toISOString()
        })
      }

      // Update success metrics
      await this.updateSuccessMetrics()

    } catch (error) {
      console.error('Error recording merge completion:', error)
    }
  }

  /**
   * Records merge failure
   */
  async recordMergeFailure(error: any, processingTime: number): Promise<void> {
    try {
      // Log error details
      await this.logPerformanceMetric({
        type: 'MERGE_FAILURE',
        processingTime,
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          details: error
        },
        timestamp: new Date().toISOString()
      })

      // Check for error rate alerts
      const recentErrorRate = await this.calculateRecentErrorRate()
      if (recentErrorRate > this.alertThresholds.errorRate) {
        await this.createAlert({
          type: 'ERROR',
          message: `Merge error rate exceeded threshold: ${(recentErrorRate * 100).toFixed(2)}%`,
          details: { errorRate: recentErrorRate, threshold: this.alertThresholds.errorRate },
          timestamp: new Date().toISOString()
        })
      }

      // Check for consecutive failures
      const consecutiveFailures = await this.getConsecutiveFailures()
      if (consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
        await this.createAlert({
          type: 'ERROR',
          message: `${consecutiveFailures} consecutive merge failures detected`,
          details: { consecutiveFailures },
          timestamp: new Date().toISOString()
        })
      }

    } catch (monitorError) {
      console.error('Error recording merge failure:', monitorError)
    }
  }

  /**
   * Gets current merge system metrics
   */
  async getMergeMetrics(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<MergeMetrics> {
    try {
      const timeframeDuration = this.getTimeframeDuration(timeframe)
      const since = new Date(Date.now() - timeframeDuration).toISOString()

      // Get merge history for timeframe
      const { data: merges, error } = await this.supabase
        .from('UserMergeHistory')
        .select('status, processingTimeMs, startedAt')
        .gte('startedAt', since)

      if (error) {
        console.error('Error getting merge metrics:', error)
        return this.getDefaultMetrics()
      }

      const totalMerges = merges.length
      const successfulMerges = merges.filter(m => m.status === 'COMPLETED').length
      const failedMerges = merges.filter(m => m.status === 'FAILED').length
      
      const successRate = totalMerges > 0 ? successfulMerges / totalMerges : 1
      const errorRate = totalMerges > 0 ? failedMerges / totalMerges : 0
      
      const processingTimes = merges
        .filter(m => m.processingTimeMs)
        .map(m => m.processingTimeMs)
      
      const averageProcessingTime = processingTimes.length > 0 
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
        : 0

      // Calculate recent failures (last hour)
      const recentFailures = await this.getRecentFailures(60 * 60 * 1000) // 1 hour

      // Calculate performance score (0-100)
      const performanceScore = this.calculatePerformanceScore({
        successRate,
        errorRate,
        averageProcessingTime,
        recentFailures
      })

      return {
        totalMerges,
        successRate,
        averageProcessingTime,
        errorRate,
        recentFailures,
        performanceScore
      }

    } catch (error) {
      console.error('Error calculating merge metrics:', error)
      return this.getDefaultMetrics()
    }
  }

  /**
   * Gets recent merge alerts
   */
  async getRecentAlerts(limit: number = 10): Promise<MergeAlert[]> {
    try {
      // For now, we'll store alerts in a simple table
      // In production, you might want to use a dedicated alerting system
      const { data, error } = await this.supabase
        .from('MergeAlert')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('Error getting recent alerts:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching recent alerts:', error)
      return []
    }
  }

  /**
   * Creates system health report
   */
  async getSystemHealthReport(): Promise<{
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL'
    metrics: MergeMetrics
    alerts: MergeAlert[]
    recommendations: string[]
  }> {
    try {
      const metrics = await this.getMergeMetrics('day')
      const alerts = await this.getRecentAlerts(5)
      
      // Determine system status
      let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY'
      const recommendations: string[] = []

      if (metrics.errorRate > 0.1) { // 10% error rate
        status = 'CRITICAL'
        recommendations.push('High error rate detected - investigate merge failures immediately')
      } else if (metrics.errorRate > 0.05) { // 5% error rate
        status = 'WARNING'
        recommendations.push('Elevated error rate - monitor merge system closely')
      }

      if (metrics.averageProcessingTime > 30000) { // 30 seconds
        if (status === 'HEALTHY') status = 'WARNING'
        recommendations.push('Slow merge processing times - consider performance optimization')
      }

      if (metrics.recentFailures > 5) {
        if (status === 'HEALTHY') status = 'WARNING'
        recommendations.push('Multiple recent failures - check system resources and database performance')
      }

      if (metrics.performanceScore < 70) {
        status = 'CRITICAL'
        recommendations.push('Poor overall performance score - immediate attention required')
      } else if (metrics.performanceScore < 85) {
        if (status === 'HEALTHY') status = 'WARNING'
        recommendations.push('Performance score below optimal - consider system improvements')
      }

      return {
        status,
        metrics,
        alerts,
        recommendations
      }

    } catch (error) {
      console.error('Error generating system health report:', error)
      return {
        status: 'CRITICAL',
        metrics: this.getDefaultMetrics(),
        alerts: [],
        recommendations: ['Error generating health report - system monitoring may be compromised']
      }
    }
  }

  /**
   * Private helper methods
   */
  private async logPerformanceMetric(metric: any): Promise<void> {
    try {
      // Store performance metrics for analysis
      // In production, you might want to use a time-series database
      await this.supabase
        .from('MergePerformanceLog')
        .insert(metric)
    } catch (error) {
      console.error('Error logging performance metric:', error)
    }
  }

  private async createAlert(alert: Omit<MergeAlert, 'id' | 'resolved'>): Promise<void> {
    try {
      await this.supabase
        .from('MergeAlert')
        .insert({
          ...alert,
          resolved: false
        })
    } catch (error) {
      console.error('Error creating alert:', error)
    }
  }

  private async updateSuccessMetrics(): Promise<void> {
    try {
      // Update rolling success metrics
      // This could be used for dashboard displays
      const metrics = await this.getMergeMetrics('hour')
      
      await this.supabase
        .from('MergeMetricsSnapshot')
        .upsert({
          timeframe: 'hour',
          timestamp: new Date().toISOString(),
          metrics: JSON.stringify(metrics)
        }, { onConflict: 'timeframe' })
    } catch (error) {
      console.error('Error updating success metrics:', error)
    }
  }

  private async calculateRecentErrorRate(): Promise<number> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      
      const { data: recentMerges } = await this.supabase
        .from('UserMergeHistory')
        .select('status')
        .gte('startedAt', oneHourAgo)

      if (!recentMerges || recentMerges.length === 0) {
        return 0
      }

      const failures = recentMerges.filter(m => m.status === 'FAILED').length
      return failures / recentMerges.length
    } catch (error) {
      console.error('Error calculating recent error rate:', error)
      return 0
    }
  }

  private async getConsecutiveFailures(): Promise<number> {
    try {
      const { data: recentMerges } = await this.supabase
        .from('UserMergeHistory')
        .select('status')
        .order('startedAt', { ascending: false })
        .limit(10)

      if (!recentMerges) return 0

      let consecutiveFailures = 0
      for (const merge of recentMerges) {
        if (merge.status === 'FAILED') {
          consecutiveFailures++
        } else {
          break
        }
      }

      return consecutiveFailures
    } catch (error) {
      console.error('Error getting consecutive failures:', error)
      return 0
    }
  }

  private async getRecentFailures(timeframeMs: number): Promise<number> {
    try {
      const since = new Date(Date.now() - timeframeMs).toISOString()
      
      const { data: failures } = await this.supabase
        .from('UserMergeHistory')
        .select('id')
        .eq('status', 'FAILED')
        .gte('startedAt', since)

      return failures?.length || 0
    } catch (error) {
      console.error('Error getting recent failures:', error)
      return 0
    }
  }

  private getTimeframeDuration(timeframe: 'hour' | 'day' | 'week'): number {
    switch (timeframe) {
      case 'hour': return 60 * 60 * 1000
      case 'day': return 24 * 60 * 60 * 1000
      case 'week': return 7 * 24 * 60 * 60 * 1000
      default: return 24 * 60 * 60 * 1000
    }
  }

  private calculatePerformanceScore(metrics: {
    successRate: number
    errorRate: number
    averageProcessingTime: number
    recentFailures: number
  }): number {
    // Calculate performance score (0-100)
    let score = 100

    // Success rate impact (40% of score)
    score -= (1 - metrics.successRate) * 40

    // Error rate impact (30% of score)
    score -= metrics.errorRate * 30

    // Processing time impact (20% of score)
    if (metrics.averageProcessingTime > 10000) { // 10 seconds
      const timeScore = Math.min((metrics.averageProcessingTime - 10000) / 20000, 1) * 20
      score -= timeScore
    }

    // Recent failures impact (10% of score)
    if (metrics.recentFailures > 0) {
      const failureScore = Math.min(metrics.recentFailures / 10, 1) * 10
      score -= failureScore
    }

    return Math.max(0, Math.round(score))
  }

  private getDefaultMetrics(): MergeMetrics {
    return {
      totalMerges: 0,
      successRate: 1,
      averageProcessingTime: 0,
      errorRate: 0,
      recentFailures: 0,
      performanceScore: 100
    }
  }
}

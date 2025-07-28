"use client"

/**
 * Performance Monitoring System
 * 
 * Tracks Core Web Vitals and custom performance metrics
 * to measure the impact of optimization efforts.
 */

interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  url?: string
  userId?: string
  metadata?: Record<string, any>
}

interface WebVitalsMetric {
  name: 'CLS' | 'FID' | 'FCP' | 'LCP' | 'TTFB' | 'INP'
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  id: string
  navigationType: string
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private isEnabled: boolean = true
  private userId?: string

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeWebVitals()
      this.initializeCustomMetrics()
    }
  }

  setUserId(userId: string) {
    this.userId = userId
  }

  private async initializeWebVitals() {
    try {
      // Dynamic import to avoid SSR issues
      const { getCLS, getFID, getFCP, getLCP, getTTFB } = await import('web-vitals')
      
      // Track Core Web Vitals
      getCLS(this.handleWebVital.bind(this))
      getFID(this.handleWebVital.bind(this))
      getFCP(this.handleWebVital.bind(this))
      getLCP(this.handleWebVital.bind(this))
      getTTFB(this.handleWebVital.bind(this))

      // Track INP if available (newer metric)
      try {
        const { getINP } = await import('web-vitals')
        getINP(this.handleWebVital.bind(this))
      } catch {
        // INP not available in older versions
      }
    } catch (error) {
      console.warn('Web Vitals not available:', error)
    }
  }

  private handleWebVital(metric: WebVitalsMetric) {
    if (!this.isEnabled) return

    // Determine rating based on thresholds
    const rating = this.getWebVitalRating(metric.name, metric.value)
    
    const performanceMetric: PerformanceMetric = {
      name: `webvital_${metric.name.toLowerCase()}`,
      value: metric.value,
      timestamp: Date.now(),
      url: window.location.pathname,
      userId: this.userId,
      metadata: {
        rating,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType
      }
    }

    this.recordMetric(performanceMetric)
    this.sendToAnalytics(performanceMetric)
  }

  private getWebVitalRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds = {
      CLS: { good: 0.1, poor: 0.25 },
      FID: { good: 100, poor: 300 },
      FCP: { good: 1800, poor: 3000 },
      LCP: { good: 2500, poor: 4000 },
      TTFB: { good: 800, poor: 1800 },
      INP: { good: 200, poor: 500 }
    }

    const threshold = thresholds[name as keyof typeof thresholds]
    if (!threshold) return 'good'

    if (value <= threshold.good) return 'good'
    if (value <= threshold.poor) return 'needs-improvement'
    return 'poor'
  }

  private initializeCustomMetrics() {
    // Track page load performance
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      
      if (navigation) {
        this.trackCustomMetric('page_load_time', navigation.loadEventEnd - navigation.fetchStart)
        this.trackCustomMetric('dom_content_loaded', navigation.domContentLoadedEventEnd - navigation.fetchStart)
        this.trackCustomMetric('time_to_interactive', navigation.domInteractive - navigation.fetchStart)
      }
    })

    // Track resource loading performance
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource') {
          const resource = entry as PerformanceResourceTiming
          
          // Track slow resources
          if (resource.duration > 1000) {
            this.trackCustomMetric('slow_resource', resource.duration, {
              name: resource.name,
              type: resource.initiatorType
            })
          }
        }
      }
    })

    try {
      observer.observe({ entryTypes: ['resource'] })
    } catch (error) {
      console.warn('Performance Observer not supported:', error)
    }
  }

  trackCustomMetric(name: string, value: number, metadata?: Record<string, any>) {
    if (!this.isEnabled) return

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      url: window.location.pathname,
      userId: this.userId,
      metadata
    }

    this.recordMetric(metric)
    this.sendToAnalytics(metric)
  }

  // Track API response times
  trackApiCall(endpoint: string, responseTime: number, status: number, cacheHit?: boolean) {
    this.trackCustomMetric('api_response_time', responseTime, {
      endpoint,
      status,
      cacheHit: cacheHit || false
    })

    // Track slow API calls
    if (responseTime > 2000) {
      this.trackCustomMetric('slow_api_call', responseTime, {
        endpoint,
        status
      })
    }
  }

  // Track database query performance
  trackDatabaseQuery(queryType: string, duration: number, recordCount?: number) {
    this.trackCustomMetric('database_query', duration, {
      queryType,
      recordCount
    })
  }

  // Track component render performance
  trackComponentRender(componentName: string, renderTime: number) {
    this.trackCustomMetric('component_render', renderTime, {
      componentName
    })
  }

  // Track user interactions
  trackUserInteraction(action: string, duration?: number) {
    this.trackCustomMetric('user_interaction', duration || 0, {
      action
    })
  }

  private recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric)
    
    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100)
    }
  }

  private async sendToAnalytics(metric: PerformanceMetric) {
    try {
      // Send to analytics endpoint
      await fetch('/api/analytics/performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metric)
      })
    } catch (error) {
      // Fail silently to avoid impacting user experience
      console.debug('Failed to send performance metric:', error)
    }
  }

  // Get performance summary
  getPerformanceSummary() {
    const summary = {
      totalMetrics: this.metrics.length,
      webVitals: {} as Record<string, { value: number; rating: string }>,
      customMetrics: {} as Record<string, { avg: number; count: number; max: number }>,
      slowOperations: this.metrics.filter(m => 
        (m.name.includes('api') && m.value > 2000) ||
        (m.name.includes('database') && m.value > 1000) ||
        (m.name.includes('render') && m.value > 100)
      )
    }

    // Aggregate Web Vitals
    this.metrics
      .filter(m => m.name.startsWith('webvital_'))
      .forEach(m => {
        const vitalName = m.name.replace('webvital_', '').toUpperCase()
        summary.webVitals[vitalName] = {
          value: m.value,
          rating: m.metadata?.rating || 'unknown'
        }
      })

    // Aggregate custom metrics
    const customMetrics = this.metrics.filter(m => !m.name.startsWith('webvital_'))
    const grouped = customMetrics.reduce((acc, m) => {
      if (!acc[m.name]) {
        acc[m.name] = []
      }
      acc[m.name].push(m.value)
      return acc
    }, {} as Record<string, number[]>)

    Object.entries(grouped).forEach(([name, values]) => {
      summary.customMetrics[name] = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
        max: Math.max(...values)
      }
    })

    return summary
  }

  // Enable/disable monitoring
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled
  }

  // Clear metrics
  clearMetrics() {
    this.metrics = []
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor()

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const trackMetric = (name: string, value: number, metadata?: Record<string, any>) => {
    performanceMonitor.trackCustomMetric(name, value, metadata)
  }

  const trackApiCall = (endpoint: string, responseTime: number, status: number, cacheHit?: boolean) => {
    performanceMonitor.trackApiCall(endpoint, responseTime, status, cacheHit)
  }

  const trackComponentRender = (componentName: string, renderTime: number) => {
    performanceMonitor.trackComponentRender(componentName, renderTime)
  }

  const getSummary = () => performanceMonitor.getPerformanceSummary()

  return {
    trackMetric,
    trackApiCall,
    trackComponentRender,
    getSummary
  }
}

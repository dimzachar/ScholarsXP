"use client"

import React, { useEffect } from 'react'
import { performanceMonitor } from '@/lib/performance-monitor'
import { useAuth } from '@/contexts/AuthContext'

interface PerformanceMonitorProviderProps {
  children: React.ReactNode
}

export function PerformanceMonitorProvider({ children }: PerformanceMonitorProviderProps) {
  const { user } = useAuth()

  useEffect(() => {
    // Set user ID for performance tracking
    if (user?.id) {
      performanceMonitor.setUserId(user.id)
    }

    // Track page navigation performance
    const handleRouteChange = () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      if (navigation) {
        performanceMonitor.trackCustomMetric('page_navigation', navigation.loadEventEnd - navigation.fetchStart)
      }
    }

    // Track initial page load
    if (document.readyState === 'complete') {
      handleRouteChange()
    } else {
      window.addEventListener('load', handleRouteChange)
    }

    // Track route changes (for SPA navigation)
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function(...args) {
      originalPushState.apply(history, args)
      setTimeout(() => {
        performanceMonitor.trackCustomMetric('spa_navigation', performance.now())
      }, 0)
    }

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args)
      setTimeout(() => {
        performanceMonitor.trackCustomMetric('spa_navigation', performance.now())
      }, 0)
    }

    // Cleanup
    return () => {
      window.removeEventListener('load', handleRouteChange)
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    }
  }, [user])

  return <>{children}</>
}

// HOC to wrap API calls with performance tracking
export function withPerformanceTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  endpoint: string
): T {
  return (async (...args: any[]) => {
    const start = performance.now()
    let status = 200
    let cacheHit = false

    try {
      const result = await fn(...args)
      
      // Check if response indicates cache hit
      if (result && typeof result === 'object' && result.headers) {
        cacheHit = result.headers.get('X-Cache') === 'HIT'
      }
      
      return result
    } catch (error) {
      status = error instanceof Error && 'status' in error ? (error as any).status : 500
      throw error
    } finally {
      const duration = performance.now() - start
      performanceMonitor.trackApiCall(endpoint, duration, status, cacheHit)
    }
  }) as T
}

// Hook to track component render performance
export function useRenderPerformance(componentName: string) {
  useEffect(() => {
    const start = performance.now()
    
    return () => {
      const renderTime = performance.now() - start
      performanceMonitor.trackComponentRender(componentName, renderTime)
    }
  }, [componentName])
}

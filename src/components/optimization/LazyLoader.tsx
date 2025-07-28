"use client"

import React, { Suspense, lazy, useState, useEffect, useRef } from 'react'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// Intersection Observer hook for lazy loading
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [hasIntersected, setHasIntersected] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting)
        if (entry.isIntersecting && !hasIntersected) {
          setHasIntersected(true)
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options,
      }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [hasIntersected, options])

  return { elementRef, isIntersecting, hasIntersected }
}

// Lazy loading wrapper component
interface LazyWrapperProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  className?: string
  minHeight?: string
  once?: boolean
}

export function LazyWrapper({
  children,
  fallback,
  className,
  minHeight = '200px',
  once = true
}: LazyWrapperProps) {
  const { elementRef, hasIntersected } = useIntersectionObserver()
  const shouldRender = once ? hasIntersected : true

  const defaultFallback = (
    <div 
      className={cn(
        'flex items-center justify-center bg-muted/20 rounded-lg',
        className
      )}
      style={{ minHeight }}
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div ref={elementRef} className={className}>
      {shouldRender ? (
        <Suspense fallback={fallback || defaultFallback}>
          {children}
        </Suspense>
      ) : (
        fallback || defaultFallback
      )}
    </div>
  )
}

// Mobile-optimized image component with lazy loading
interface MobileImageProps {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
  priority?: boolean
  placeholder?: 'blur' | 'empty'
  blurDataURL?: string
}

export function MobileImage({
  src,
  alt,
  className,
  width,
  height,
  priority = false,
  placeholder = 'empty',
  blurDataURL
}: MobileImageProps) {
  const { isMobile } = useResponsiveLayout()
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const { elementRef, hasIntersected } = useIntersectionObserver()

  const shouldLoad = priority || hasIntersected

  return (
    <div ref={elementRef} className={cn('relative overflow-hidden', className)}>
      {shouldLoad && !hasError ? (
        <>
          {placeholder === 'blur' && blurDataURL && !isLoaded && (
            <img
              src={blurDataURL}
              alt=""
              className="absolute inset-0 w-full h-full object-cover filter blur-sm"
            />
          )}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            loading={priority ? 'eager' : 'lazy'}
          />
        </>
      ) : hasError ? (
        <div className="flex items-center justify-center bg-muted text-muted-foreground">
          <span className="text-sm">Failed to load image</span>
        </div>
      ) : (
        <div className="flex items-center justify-center bg-muted/20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// Virtual scrolling component for large lists
interface VirtualScrollProps {
  items: any[]
  itemHeight: number
  containerHeight: number
  renderItem: (item: any, index: number) => React.ReactNode
  className?: string
  overscan?: number
}

export function VirtualScroll({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  className,
  overscan = 5
}: VirtualScrollProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const { isMobile } = useResponsiveLayout()

  // Don't use virtual scrolling on desktop or for small lists
  if (!isMobile || items.length < 50) {
    return (
      <div className={className} style={{ height: containerHeight }}>
        {items.map((item, index) => (
          <div key={index} style={{ height: itemHeight }}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    )
  }

  const visibleStart = Math.floor(scrollTop / itemHeight)
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight),
    items.length - 1
  )

  const startIndex = Math.max(0, visibleStart - overscan)
  const endIndex = Math.min(items.length - 1, visibleEnd + overscan)

  const visibleItems = items.slice(startIndex, endIndex + 1)

  return (
    <div
      className={cn('overflow-auto', className)}
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${startIndex * itemHeight}px)`,
          }}
        >
          {visibleItems.map((item, index) => (
            <div key={startIndex + index} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Mobile-optimized bundle splitting
export const MobileLazyComponents = {
  // Lazy load heavy components only when needed
  AchievementGallery: lazy(() => import('@/components/dashboard/AchievementGallery').then(module => ({ default: module.AchievementGallery }))),
  LeaderboardWidget: lazy(() => import('@/components/dashboard/LeaderboardWidget').then(module => ({ default: module.LeaderboardWidget }))),
  SubmissionForm: lazy(() => import('@/components/SubmissionForm')),

  // New analytics components
  GoalProgressWidget: lazy(() => import('@/components/dashboard/GoalProgressWidget').then(module => ({ default: module.GoalProgressWidget }))),
  UserRankingCard: lazy(() => import('@/components/dashboard/UserRankingCard').then(module => ({ default: module.UserRankingCard }))),
  AnalyticsInsights: lazy(() => import('@/components/dashboard/AnalyticsInsights').then(module => ({ default: module.AnalyticsInsights }))),
  XpBreakdownChart: lazy(() => import('@/components/charts/XpBreakdownChart')),
  XpTrendChart: lazy(() => import('@/components/charts/XpTrendChart')),
}

// Performance monitoring hook
export function usePerformanceMonitor() {
  const { isMobile } = useResponsiveLayout()
  
  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return

    // Monitor Core Web Vitals on mobile
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'navigation') {
          const navEntry = entry as PerformanceNavigationTiming
          console.log('Mobile Navigation Timing:', {
            domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart,
            loadComplete: navEntry.loadEventEnd - navEntry.loadEventStart,
            firstPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-paint')?.startTime,
            firstContentfulPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime,
          })
        }
      })
    })

    observer.observe({ entryTypes: ['navigation'] })

    return () => observer.disconnect()
  }, [isMobile])
}

// Mobile cache management
export class MobileCache {
  private static instance: MobileCache
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>()
  private maxSize = 50 // Limit cache size on mobile

  static getInstance(): MobileCache {
    if (!MobileCache.instance) {
      MobileCache.instance = new MobileCache()
    }
    return MobileCache.instance
  }

  set(key: string, data: any, ttl: number = 5 * 60 * 1000): void {
    // Clear old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.keys())[0]
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

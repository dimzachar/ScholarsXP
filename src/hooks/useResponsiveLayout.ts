"use client"

import { useState, useEffect } from 'react'

export type BreakpointSize = 'mobile' | 'tablet' | 'desktop'
export type ResponsiveVariant = 'mobile' | 'desktop' | 'auto'

interface ResponsiveLayoutConfig {
  mobile: number
  tablet: number
  desktop: number
}

const defaultBreakpoints: ResponsiveLayoutConfig = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280
}

export function useResponsiveLayout(breakpoints: ResponsiveLayoutConfig = defaultBreakpoints) {
  const [currentBreakpoint, setCurrentBreakpoint] = useState<BreakpointSize>('desktop')
  const [windowWidth, setWindowWidth] = useState<number>(0)

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setWindowWidth(width)
      
      if (width < breakpoints.mobile) {
        setCurrentBreakpoint('mobile')
      } else if (width < breakpoints.tablet) {
        setCurrentBreakpoint('tablet')
      } else {
        setCurrentBreakpoint('desktop')
      }
    }

    // Initial check
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoints])

  const isMobile = currentBreakpoint === 'mobile'
  const isTablet = currentBreakpoint === 'tablet'
  const isDesktop = currentBreakpoint === 'desktop'
  const isMobileOrTablet = isMobile || isTablet

  return {
    currentBreakpoint,
    windowWidth,
    isMobile,
    isTablet,
    isDesktop,
    isMobileOrTablet,
    breakpoints
  }
}

// Hook for container queries support detection
export function useContainerQueries() {
  const [supportsContainerQueries, setSupportsContainerQueries] = useState(false)

  useEffect(() => {
    // Check if browser supports container queries
    const checkSupport = () => {
      if (typeof window !== 'undefined' && 'CSS' in window && 'supports' in window.CSS) {
        return window.CSS.supports('container-type', 'inline-size')
      }
      return false
    }

    setSupportsContainerQueries(checkSupport())
  }, [])

  return { supportsContainerQueries }
}

// Utility function to get responsive grid classes
export function getResponsiveGridClasses(
  breakpoint: BreakpointSize,
  mobileColumns: number = 1,
  tabletColumns: number = 2,
  desktopColumns: number = 3
): string {
  const baseClasses = 'grid gap-4'

  // Map numbers to actual Tailwind classes
  const getGridClass = (cols: number) => {
    switch (cols) {
      case 1: return 'grid-cols-1'
      case 2: return 'grid-cols-2'
      case 3: return 'grid-cols-3'
      case 4: return 'grid-cols-4'
      case 5: return 'grid-cols-5'
      case 6: return 'grid-cols-6'
      default: return 'grid-cols-1'
    }
  }

  switch (breakpoint) {
    case 'mobile':
      return `${baseClasses} ${getGridClass(mobileColumns)}`
    case 'tablet':
      return `${baseClasses} ${getGridClass(tabletColumns)}`
    case 'desktop':
      return `${baseClasses} ${getGridClass(desktopColumns)}`
    default:
      return `${baseClasses} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
  }
}

// Touch target size utilities for mobile optimization
export const TOUCH_TARGET_SIZE = {
  minimum: 44, // iOS/Android minimum recommended touch target
  comfortable: 48, // More comfortable touch target
  large: 56 // Large touch target for primary actions
}

export function getTouchTargetClasses(size: keyof typeof TOUCH_TARGET_SIZE = 'minimum'): string {
  const targetSize = TOUCH_TARGET_SIZE[size]
  return `min-h-[${targetSize}px] min-w-[${targetSize}px]`
}

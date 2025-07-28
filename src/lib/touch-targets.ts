/**
 * Touch Target Utilities
 * 
 * Provides consistent touch target sizing across the application
 * using static Tailwind CSS classes for proper compilation.
 */

import { cn } from '@/lib/utils'

// Touch target size constants (in pixels)
export const TOUCH_TARGET_SIZES = {
  minimum: 44,    // iOS/Android minimum requirement
  comfortable: 48, // Comfortable touch target
  large: 56,      // Large touch target for primary actions
  extra: 64       // Extra large for important actions
} as const

// Static Tailwind classes for touch targets
export const TOUCH_TARGET_CLASSES = {
  // Height classes
  height: {
    minimum: 'min-h-11',      // 44px
    comfortable: 'min-h-12',  // 48px
    large: 'min-h-14',        // 56px
    extra: 'min-h-16'         // 64px
  },
  // Width classes
  width: {
    minimum: 'min-w-11',      // 44px
    comfortable: 'min-w-12',  // 48px
    large: 'min-w-14',        // 56px
    extra: 'min-w-16'         // 64px
  },
  // Combined height and width
  square: {
    minimum: 'min-h-11 min-w-11',      // 44px × 44px
    comfortable: 'min-h-12 min-w-12',  // 48px × 48px
    large: 'min-h-14 min-w-14',        // 56px × 56px
    extra: 'min-h-16 min-w-16'         // 64px × 64px
  }
} as const

export type TouchTargetSize = keyof typeof TOUCH_TARGET_CLASSES.height

// Device-specific touch target classes
export const DEVICE_TOUCH_TARGETS = {
  mobile: {
    button: TOUCH_TARGET_CLASSES.height.minimum,     // 44px minimum
    icon: TOUCH_TARGET_CLASSES.square.minimum,       // 44px × 44px
    tab: TOUCH_TARGET_CLASSES.height.minimum,        // 44px height
    input: TOUCH_TARGET_CLASSES.height.minimum,      // 44px height
    primary: TOUCH_TARGET_CLASSES.height.comfortable // 48px for primary actions
  },
  tablet: {
    button: TOUCH_TARGET_CLASSES.height.comfortable,  // 48px
    icon: TOUCH_TARGET_CLASSES.square.comfortable,    // 48px × 48px
    tab: TOUCH_TARGET_CLASSES.height.comfortable,     // 48px height
    input: TOUCH_TARGET_CLASSES.height.comfortable,   // 48px height
    primary: TOUCH_TARGET_CLASSES.height.large        // 56px for primary actions
  },
  desktop: {
    button: 'min-h-10',  // 40px standard
    icon: 'min-h-10 min-w-10',
    tab: 'min-h-10',
    input: 'min-h-10',
    primary: 'min-h-11'  // 44px for primary actions
  }
} as const

// Utility function to get touch target classes based on device type
export function getTouchTargetClass(
  element: keyof typeof DEVICE_TOUCH_TARGETS.mobile,
  device: 'mobile' | 'tablet' | 'desktop',
  additionalClasses?: string
): string {
  const baseClass = DEVICE_TOUCH_TARGETS[device][element]
  return cn(baseClass, additionalClasses)
}

// Responsive touch target utility
export function getResponsiveTouchTarget(
  element: keyof typeof DEVICE_TOUCH_TARGETS.mobile,
  isMobile: boolean,
  isTablet: boolean,
  additionalClasses?: string
): string {
  let deviceType: 'mobile' | 'tablet' | 'desktop'
  
  if (isMobile) {
    deviceType = 'mobile'
  } else if (isTablet) {
    deviceType = 'tablet'
  } else {
    deviceType = 'desktop'
  }
  
  return getTouchTargetClass(element, deviceType, additionalClasses)
}

// Touch target validation utility (for development/testing)
export function validateTouchTarget(element: HTMLElement): {
  isValid: boolean
  actualSize: { width: number; height: number }
  meetsMinimum: boolean
  recommendations: string[]
} {
  const rect = element.getBoundingClientRect()
  const { width, height } = rect
  
  const meetsMinimum = width >= TOUCH_TARGET_SIZES.minimum && height >= TOUCH_TARGET_SIZES.minimum
  const isValid = meetsMinimum
  
  const recommendations: string[] = []
  
  if (width < TOUCH_TARGET_SIZES.minimum) {
    recommendations.push(`Width ${width}px is below minimum ${TOUCH_TARGET_SIZES.minimum}px`)
  }
  
  if (height < TOUCH_TARGET_SIZES.minimum) {
    recommendations.push(`Height ${height}px is below minimum ${TOUCH_TARGET_SIZES.minimum}px`)
  }
  
  if (width < TOUCH_TARGET_SIZES.comfortable || height < TOUCH_TARGET_SIZES.comfortable) {
    recommendations.push(`Consider using comfortable size (${TOUCH_TARGET_SIZES.comfortable}px) for better UX`)
  }
  
  return {
    isValid,
    actualSize: { width, height },
    meetsMinimum,
    recommendations
  }
}

// Common touch target component props
export interface TouchTargetProps {
  touchTarget?: TouchTargetSize
  mobileOptimized?: boolean
  className?: string
}

// HOC to add touch target optimization to components
// Note: This should be used in .tsx files, not .ts files
export function withTouchTargetProps<P extends object>(
  defaultSize: TouchTargetSize = 'minimum'
) {
  return function getEnhancedProps(props: P & TouchTargetProps) {
    const { touchTarget = defaultSize, mobileOptimized = true, className, ...rest } = props

    const touchTargetClass = mobileOptimized
      ? TOUCH_TARGET_CLASSES.height[touchTarget]
      : ''

    return {
      ...rest,
      className: cn(touchTargetClass, className)
    }
  }
}

// Accessibility helpers
export const ACCESSIBILITY_HELPERS = {
  // ARIA labels for touch targets
  getTouchTargetLabel: (element: string, size: TouchTargetSize) => 
    `${element} - ${TOUCH_TARGET_SIZES[size]}px touch target`,
  
  // Focus ring classes for touch targets
  focusRing: 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  
  // Touch manipulation CSS for better mobile performance
  touchManipulation: 'touch-manipulation',
  
  // Prevent text selection on touch targets
  noSelect: 'select-none',
  
  // Combined accessibility classes
  touchAccessible: cn(
    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'touch-manipulation',
    'select-none'
  )
}

// CSS custom properties for dynamic sizing (fallback)
export const TOUCH_TARGET_CSS_VARS = {
  '--touch-target-minimum': `${TOUCH_TARGET_SIZES.minimum}px`,
  '--touch-target-comfortable': `${TOUCH_TARGET_SIZES.comfortable}px`,
  '--touch-target-large': `${TOUCH_TARGET_SIZES.large}px`,
  '--touch-target-extra': `${TOUCH_TARGET_SIZES.extra}px`
} as const

// Utility to inject CSS variables (for edge cases)
export function injectTouchTargetVars(): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    Object.entries(TOUCH_TARGET_CSS_VARS).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }
}

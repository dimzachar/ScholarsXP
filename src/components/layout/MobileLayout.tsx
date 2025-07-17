"use client"

import React from 'react'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'

interface MobileLayoutProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'fullscreen' | 'centered'
  showBottomPadding?: boolean
}

export function MobileLayout({
  children,
  className,
  variant = 'default',
  showBottomPadding = true
}: MobileLayoutProps) {
  const { isMobile, isTablet } = useResponsiveLayout()

  const getLayoutClasses = () => {
    const baseClasses = 'min-h-screen'
    
    switch (variant) {
      case 'fullscreen':
        return cn(
          baseClasses,
          'w-full h-screen overflow-hidden',
          isMobile && 'px-0 py-0'
        )
      case 'centered':
        return cn(
          baseClasses,
          'flex items-center justify-center',
          isMobile ? 'px-4 py-8' : 'px-8 py-12'
        )
      default:
        return cn(
          baseClasses,
          'bg-gradient-to-br from-background via-muted/50 to-muted'
        )
    }
  }

  const getContainerClasses = () => {
    if (variant === 'fullscreen') {
      return 'w-full h-full'
    }
    
    if (variant === 'centered') {
      return cn(
        'w-full max-w-md mx-auto',
        isMobile ? 'px-4' : 'px-6'
      )
    }

    return cn(
      'container mx-auto',
      isMobile 
        ? `px-4 py-4 ${showBottomPadding ? 'pb-20' : 'pb-4'}` 
        : 'px-4 py-8'
    )
  }

  return (
    <div className={cn(getLayoutClasses(), className)}>
      <div className={getContainerClasses()}>
        {children}
      </div>
    </div>
  )
}

// Mobile-optimized section component
interface MobileSectionProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  icon?: React.ComponentType<any>
  className?: string
  headerClassName?: string
  contentClassName?: string
  spacing?: 'tight' | 'normal' | 'loose'
}

export function MobileSection({
  children,
  title,
  subtitle,
  icon: Icon,
  className,
  headerClassName,
  contentClassName,
  spacing = 'normal'
}: MobileSectionProps) {
  const { isMobile } = useResponsiveLayout()

  const getSpacingClasses = () => {
    switch (spacing) {
      case 'tight':
        return isMobile ? 'mb-4' : 'mb-6'
      case 'loose':
        return isMobile ? 'mb-8' : 'mb-12'
      default:
        return isMobile ? 'mb-6' : 'mb-8'
    }
  }

  return (
    <section className={cn(getSpacingClasses(), className)}>
      {(title || subtitle) && (
        <div className={cn(
          'mb-6',
          isMobile && 'mb-4',
          headerClassName
        )}>
          {title && (
            <div className="flex items-center gap-2 mb-2">
              {Icon && (
                <Icon className={cn(
                  'text-primary',
                  isMobile ? 'h-5 w-5' : 'h-6 w-6'
                )} />
              )}
              <h2 className={cn(
                'font-semibold',
                isMobile ? 'text-xl' : 'text-2xl'
              )}>
                {title}
              </h2>
            </div>
          )}
          {subtitle && (
            <p className={cn(
              'text-muted-foreground',
              isMobile ? 'text-sm' : 'text-base'
            )}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className={contentClassName}>
        {children}
      </div>
    </section>
  )
}

// Mobile-optimized card grid
interface MobileCardGridProps {
  children: React.ReactNode
  columns?: {
    mobile?: number
    tablet?: number
    desktop?: number
  }
  gap?: 'sm' | 'md' | 'lg'
  className?: string
}

export function MobileCardGrid({
  children,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 'md',
  className
}: MobileCardGridProps) {
  const { currentBreakpoint } = useResponsiveLayout()

  const getGridClasses = () => {
    const gapClasses = {
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6'
    }

    const getColClass = (cols: number) => {
      switch (cols) {
        case 1: return 'grid-cols-1'
        case 2: return 'grid-cols-2'
        case 3: return 'grid-cols-3'
        case 4: return 'grid-cols-4'
        default: return 'grid-cols-1'
      }
    }

    switch (currentBreakpoint) {
      case 'mobile':
        return `grid ${getColClass(columns.mobile || 1)} ${gapClasses[gap]}`
      case 'tablet':
        return `grid ${getColClass(columns.tablet || 2)} ${gapClasses[gap]}`
      case 'desktop':
        return `grid ${getColClass(columns.desktop || 3)} ${gapClasses[gap]}`
      default:
        return `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${gapClasses[gap]}`
    }
  }

  return (
    <div className={cn(getGridClasses(), className)}>
      {children}
    </div>
  )
}

// Mobile-optimized list component
interface MobileListProps {
  children: React.ReactNode
  variant?: 'default' | 'compact' | 'spacious'
  className?: string
}

export function MobileList({
  children,
  variant = 'default',
  className
}: MobileListProps) {
  const { isMobile } = useResponsiveLayout()

  const getListClasses = () => {
    const baseClasses = 'space-y-2'
    
    switch (variant) {
      case 'compact':
        return cn(baseClasses, isMobile ? 'space-y-1' : 'space-y-2')
      case 'spacious':
        return cn(baseClasses, isMobile ? 'space-y-4' : 'space-y-6')
      default:
        return cn(baseClasses, isMobile ? 'space-y-2' : 'space-y-3')
    }
  }

  return (
    <div className={cn(getListClasses(), className)}>
      {children}
    </div>
  )
}

// Mobile-optimized header component
interface MobileHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
  variant?: 'default' | 'compact' | 'prominent'
}

export function MobileHeader({
  title,
  subtitle,
  action,
  className,
  variant = 'default'
}: MobileHeaderProps) {
  const { isMobile } = useResponsiveLayout()

  const getTitleSize = () => {
    switch (variant) {
      case 'compact':
        return isMobile ? 'text-lg' : 'text-xl'
      case 'prominent':
        return isMobile ? 'text-2xl' : 'text-4xl'
      default:
        return isMobile ? 'text-xl' : 'text-2xl'
    }
  }

  const getSpacing = () => {
    switch (variant) {
      case 'compact':
        return isMobile ? 'mb-4' : 'mb-6'
      case 'prominent':
        return isMobile ? 'mb-8' : 'mb-12'
      default:
        return isMobile ? 'mb-6' : 'mb-8'
    }
  }

  return (
    <header className={cn(getSpacing(), className)}>
      <div className={cn(
        'flex items-start justify-between',
        action && 'gap-4'
      )}>
        <div className="flex-1 min-w-0">
          <h1 className={cn(
            'font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent',
            getTitleSize()
          )}>
            {title}
          </h1>
          {subtitle && (
            <p className={cn(
              'text-muted-foreground mt-2',
              isMobile ? 'text-sm' : 'text-base'
            )}>
              {subtitle}
            </p>
          )}
        </div>
        {action && (
          <div className="flex-shrink-0">
            {action}
          </div>
        )}
      </div>
    </header>
  )
}

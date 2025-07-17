"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { CircularProgress } from '@/components/ui/circular-progress'
import { MiniChart, AnimatedCounter } from '@/components/dashboard/MiniChart'
import { useResponsiveLayout, ResponsiveVariant } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

export interface StatCardData {
  title: string
  value: number
  subtitle?: string
  trend?: {
    data: number[]
    direction: 'up' | 'down' | 'neutral'
    percentage?: number
  }
  progress?: {
    current: number
    max: number
    label?: string
  }
  icon?: LucideIcon
  color?: 'primary' | 'secondary' | 'accent' | 'destructive' | 'muted'
  additionalInfo?: React.ReactNode
}

interface ResponsiveStatCardProps {
  data: StatCardData
  variant?: ResponsiveVariant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showProgress?: boolean
  showTrend?: boolean
  onClick?: () => void
}

const sizeConfig = {
  sm: {
    padding: 'p-4',
    titleSize: 'text-sm',
    valueSize: 'text-2xl',
    progressSize: 60,
    chartWidth: 80,
    chartHeight: 20
  },
  md: {
    padding: 'p-6',
    titleSize: 'text-sm',
    valueSize: 'text-4xl',
    progressSize: 80,
    chartWidth: 120,
    chartHeight: 30
  },
  lg: {
    padding: 'p-8',
    titleSize: 'text-base',
    valueSize: 'text-5xl',
    progressSize: 100,
    chartWidth: 140,
    chartHeight: 40
  }
}

const colorConfig = {
  primary: {
    background: 'bg-gradient-to-br from-primary via-primary/90 to-primary/80',
    text: 'text-primary-foreground',
    textMuted: 'text-primary-foreground/70',
    hover: 'hover:from-primary/90 hover:via-primary/80 hover:to-primary/70'
  },
  secondary: {
    background: 'bg-gradient-to-br from-secondary via-secondary/90 to-secondary/80',
    text: 'text-secondary-foreground',
    textMuted: 'text-secondary-foreground/70',
    hover: 'hover:from-secondary/90 hover:via-secondary/80 hover:to-secondary/70'
  },
  accent: {
    background: 'bg-gradient-to-br from-accent via-accent/90 to-accent/80',
    text: 'text-accent-foreground',
    textMuted: 'text-accent-foreground/70',
    hover: 'hover:from-accent/90 hover:via-accent/80 hover:to-accent/70'
  },
  destructive: {
    background: 'bg-gradient-to-br from-destructive via-destructive/90 to-destructive/80',
    text: 'text-destructive-foreground',
    textMuted: 'text-destructive-foreground/70',
    hover: 'hover:from-destructive/90 hover:via-destructive/80 hover:to-destructive/70'
  },
  muted: {
    background: 'bg-gradient-to-br from-muted via-muted/90 to-muted/80',
    text: 'text-muted-foreground',
    textMuted: 'text-muted-foreground/70',
    hover: 'hover:from-muted/90 hover:via-muted/80 hover:to-muted/70'
  }
}

export function ResponsiveStatCard({
  data,
  variant = 'auto',
  size = 'md',
  className,
  showProgress = true,
  showTrend = true,
  onClick
}: ResponsiveStatCardProps) {
  const { isMobile, isTablet } = useResponsiveLayout()
  
  // Determine effective variant
  const effectiveVariant = variant === 'auto' 
    ? (isMobile ? 'mobile' : 'desktop')
    : variant

  // Adjust size based on variant
  const effectiveSize = effectiveVariant === 'mobile' && size === 'lg' ? 'md' : size
  const config = sizeConfig[effectiveSize]
  const colors = colorConfig[data.color || 'primary']

  // Mobile-specific adjustments
  const isMobileLayout = effectiveVariant === 'mobile'
  const shouldShowProgress = showProgress && data.progress && !isMobileLayout
  const shouldShowTrend = showTrend && data.trend && !isMobileLayout

  return (
    <Card 
      className={cn(
        'border-0 shadow-lg transition-all duration-300',
        colors.background,
        colors.hover,
        onClick && 'cursor-pointer hover:scale-105',
        !onClick && 'hover:shadow-xl',
        // Container query support for future enhancement
        '@container',
        className
      )}
      onClick={onClick}
    >
      <CardContent className={config.padding}>
        {isMobileLayout ? (
          // Mobile Layout: Simplified, single column
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {data.icon && (
                  <data.icon className={cn('h-5 w-5', colors.text)} />
                )}
                <p className={cn(config.titleSize, 'font-medium', colors.textMuted)}>
                  {data.title}
                </p>
              </div>
              {data.trend && (
                <div className={cn('text-xs', colors.textMuted)}>
                  {data.trend.direction === 'up' ? '↗' : 
                   data.trend.direction === 'down' ? '↘' : '→'}
                  {data.trend.percentage && `${data.trend.percentage}%`}
                </div>
              )}
            </div>
            
            <div className={cn(config.valueSize, 'font-bold', colors.text)}>
              <AnimatedCounter value={data.value} />
            </div>
            
            {data.subtitle && (
              <p className={cn('text-xs', colors.textMuted)}>
                {data.subtitle}
              </p>
            )}
            
            {data.additionalInfo && (
              <div className="text-xs">
                {data.additionalInfo}
              </div>
            )}
          </div>
        ) : (
          // Desktop Layout: Two-column with progress/chart
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {data.icon && (
                  <data.icon className={cn('h-5 w-5', colors.text)} />
                )}
                <p className={cn(config.titleSize, 'font-medium', colors.textMuted)}>
                  {data.title}
                </p>
              </div>
              
              <div className={cn(config.valueSize, 'font-bold', colors.text)}>
                <AnimatedCounter value={data.value} />
              </div>
              
              {data.subtitle && (
                <p className={cn('text-sm mt-1', colors.textMuted)}>
                  {data.subtitle}
                </p>
              )}
              
              {shouldShowTrend && (
                <div className="mt-3">
                  <MiniChart
                    data={data.trend!.data}
                    width={config.chartWidth}
                    height={config.chartHeight}
                    color={data.color || 'primary'}
                    className="mb-2"
                  />
                </div>
              )}
              
              {data.additionalInfo && (
                <div className="mt-2">
                  {data.additionalInfo}
                </div>
              )}
            </div>
            
            {shouldShowProgress && (
              <div className="text-right">
                <CircularProgress
                  value={data.progress!.current}
                  max={data.progress!.max}
                  size={config.progressSize}
                  strokeWidth={6}
                  color="contrast"
                  className="mb-2"
                />
                {data.progress!.label && (
                  <p className={cn('text-xs', colors.textMuted)}>
                    {data.progress.label}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Utility function to create stat card data
export function createStatCardData(
  title: string,
  value: number,
  options: Partial<Omit<StatCardData, 'title' | 'value'>> = {}
): StatCardData {
  return {
    title,
    value,
    ...options
  }
}

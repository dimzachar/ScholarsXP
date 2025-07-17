"use client"

import React from 'react'
import { cn } from '@/lib/utils'

interface MiniChartProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  color?: 'primary' | 'secondary' | 'accent' | 'destructive' | 'muted'
  showTrend?: boolean
}

const colorMap = {
  primary: 'stroke-primary',
  secondary: 'stroke-secondary',
  accent: 'stroke-accent',
  destructive: 'stroke-destructive',
  muted: 'stroke-muted-foreground'
}

const fillColorMap = {
  primary: 'fill-primary/10',
  secondary: 'fill-secondary/10',
  accent: 'fill-accent/10',
  destructive: 'fill-destructive/10',
  muted: 'fill-muted-foreground/10'
}

export function MiniChart({
  data,
  width = 100,
  height = 40,
  className,
  color = 'primary',
  showTrend = true
}: MiniChartProps) {
  if (!data || data.length === 0) {
    return (
      <div 
        className={cn("flex items-center justify-center text-muted-foreground text-xs", className)}
        style={{ width, height }}
      >
        No data
      </div>
    )
  }

  const maxValue = Math.max(...data)
  const minValue = Math.min(...data)
  const range = maxValue - minValue || 1

  // Create SVG path for the sparkline
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - minValue) / range) * height
    return `${x},${y}`
  }).join(' ')

  // Create area path (filled area under the line)
  const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`
  const linePath = `M ${points}`

  // Calculate trend
  const trend = data.length > 1 ? data[data.length - 1] - data[0] : 0
  const trendPercentage = range > 0 ? ((trend / range) * 100).toFixed(1) : '0.0'

  return (
    <div className={cn("relative", className)}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Area fill */}
        <path
          d={areaPath}
          className={fillColorMap[color]}
        />
        
        {/* Line */}
        <path
          d={linePath}
          fill="none"
          strokeWidth="2"
          className={cn(colorMap[color], "transition-all duration-300")}
        />
        
        {/* Data points */}
        {data.map((value, index) => {
          const x = (index / (data.length - 1)) * width
          const y = height - ((value - minValue) / range) * height
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="2"
              className={cn(colorMap[color], "transition-all duration-300")}
              fill="currentColor"
            />
          )
        })}
      </svg>
      
      {/* Trend indicator */}
      {showTrend && (
        <div className="absolute -top-1 -right-1 text-xs">
          <span className={cn(
            "inline-flex items-center px-1 py-0.5 rounded text-xs font-medium",
            trend > 0 ? "text-green-700 bg-green-100" : 
            trend < 0 ? "text-red-700 bg-red-100" : 
            "text-gray-700 bg-gray-100"
          )}>
            {trend > 0 ? '↗' : trend < 0 ? '↘' : '→'}
            {Math.abs(parseFloat(trendPercentage))}%
          </span>
        </div>
      )}
    </div>
  )
}

// Animated counter component for XP values
export function AnimatedCounter({
  value,
  duration = 1000,
  className
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [displayValue, setDisplayValue] = React.useState(0)

  React.useEffect(() => {
    let startTime: number
    let animationFrame: number

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      setDisplayValue(Math.floor(value * easeOutQuart))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [value, duration])

  return (
    <span className={className}>
      {displayValue.toLocaleString()}
    </span>
  )
}

// Weekly progress indicator component
export function WeeklyProgressIndicator({
  currentWeek,
  totalWeeks = 52,
  className
}: {
  currentWeek: number
  totalWeeks?: number
  className?: string
}) {
  const progress = (currentWeek / totalWeeks) * 100

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        Week {currentWeek}
      </span>
    </div>
  )
}

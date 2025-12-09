"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown, Trophy } from 'lucide-react'

// Sparkline component for showing trends
function Sparkline({ 
  data, 
  className 
}: { 
  data: number[]
  className?: string
}) {
  if (!data || data.length < 2) return null

  const width = 80
  const height = 24
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-60"
      />
    </svg>
  )
}

// Change indicator badge
function ChangeBadge({ change }: { change: number }) {
  if (change === 0) return null

  const isPositive = change > 0
  const Icon = isPositive ? TrendingUp : TrendingDown

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full",
      isPositive 
        ? "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950" 
        : "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950"
    )}>
      <Icon className="h-3 w-3" />
      {isPositive ? '+' : ''}{change.toLocaleString()}
    </span>
  )
}

// Animated counter
function AnimatedValue({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [displayValue, setDisplayValue] = React.useState(0)

  React.useEffect(() => {
    let startTime: number
    let animationFrame: number
    const duration = 800

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.floor(value * easeOut))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [value])

  return <span>{prefix}{displayValue.toLocaleString()}{suffix}</span>
}

// Rank badge shown inline with XP
function RankBadge({ rank, totalUsers }: { rank: number; totalUsers?: number }) {
  if (!rank || rank <= 0) return null
  
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/20">
      <Trophy className="h-3.5 w-3.5" />
      <span className="text-sm font-semibold">#{rank}</span>
      {totalUsers && totalUsers > 0 && (
        <span className="text-xs opacity-70">/ {totalUsers}</span>
      )}
    </div>
  )
}

export interface StatCardProps {
  title: string
  value: number
  icon: LucideIcon
  variant?: 'primary' | 'secondary' | 'accent'
  prefix?: string
  suffix?: string
  subtitle?: string
  badge?: React.ReactNode
  sparklineData?: number[]
  change?: number
}

const variantStyles = {
  primary: {
    bg: 'bg-gradient-to-br from-primary via-primary/90 to-primary/80',
    text: 'text-primary-foreground',
    muted: 'text-primary-foreground/70',
    icon: 'text-primary-foreground/80'
  },
  secondary: {
    bg: 'bg-gradient-to-br from-secondary via-secondary/90 to-secondary/80',
    text: 'text-secondary-foreground',
    muted: 'text-secondary-foreground/70',
    icon: 'text-secondary-foreground/80'
  },
  accent: {
    bg: 'bg-gradient-to-br from-accent via-accent/90 to-accent/80',
    text: 'text-accent-foreground',
    muted: 'text-accent-foreground/70',
    icon: 'text-accent-foreground/80'
  }
}

export function StatCard({
  title,
  value,
  icon: Icon,
  variant = 'primary',
  prefix = '',
  suffix = '',
  subtitle,
  badge,
  sparklineData,
  change
}: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className={cn(
      "border-0 shadow-lg hover:shadow-xl transition-shadow duration-300",
      styles.bg
    )}>
      <CardContent className="p-5">
        {/* Header: Icon + Title */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", styles.icon)} />
            <span className={cn("text-sm font-medium", styles.muted)}>{title}</span>
          </div>
          {badge}
        </div>

        {/* Main Value + Sparkline */}
        <div className="flex items-end justify-between">
          <div>
            <div className={cn("text-3xl font-bold tracking-tight", styles.text)}>
              <AnimatedValue value={value} prefix={prefix} suffix={suffix} />
            </div>
            
            {/* Subtitle + Change */}
            <div className="flex items-center gap-2 mt-1">
              {subtitle && (
                <span className={cn("text-sm", styles.muted)}>{subtitle}</span>
              )}
              {change !== undefined && change !== 0 && (
                <ChangeBadge change={change} />
              )}
            </div>
          </div>

          {/* Sparkline */}
          {sparklineData && sparklineData.length > 1 && (
            <div className={styles.text}>
              <Sparkline data={sparklineData} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Streak badge component
export function StreakBadge({ weeks }: { weeks: number }) {
  if (!weeks || weeks <= 0) return null
  
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 text-white">
      🔥 {weeks}w
    </span>
  )
}

// Combined Period Stat Card (XP + Rank in one card)
export interface PeriodStatCardProps {
  title: string
  xp: number
  rank: number
  totalUsers?: number
  icon: LucideIcon
  variant?: 'primary' | 'secondary' | 'accent'
  subtitle?: string
  badge?: React.ReactNode
  sparklineData?: number[]
  change?: number
}

export function PeriodStatCard({
  title,
  xp,
  rank,
  totalUsers,
  icon: Icon,
  variant = 'secondary',
  subtitle,
  badge,
  sparklineData,
  change
}: PeriodStatCardProps) {
  const styles = variantStyles[variant]

  return (
    <Card className={cn(
      "border-0 shadow-lg hover:shadow-xl transition-shadow duration-300",
      styles.bg
    )}>
      <CardContent className="p-5">
        {/* Header: Icon + Title + Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", styles.icon)} />
            <span className={cn("text-sm font-medium", styles.muted)}>{title}</span>
          </div>
          {badge}
        </div>

        {/* Main Value + Rank */}
        <div className="flex items-end justify-between">
          <div className="flex-1">
            {/* XP Value */}
            <div className={cn("text-3xl font-bold tracking-tight", styles.text)}>
              <AnimatedValue value={xp} suffix=" XP" />
            </div>
            
            {/* Subtitle + Change + Rank */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {subtitle && (
                <span className={cn("text-sm", styles.muted)}>{subtitle}</span>
              )}
              {change !== undefined && change !== 0 && (
                <ChangeBadge change={change} />
              )}
              <RankBadge rank={rank} totalUsers={totalUsers} />
            </div>
          </div>

          {/* Sparkline */}
          {sparklineData && sparklineData.length > 1 && (
            <div className={styles.text}>
              <Sparkline data={sparklineData} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

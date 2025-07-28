"use client"

import React from 'react'
import { cn } from '@/lib/utils'

interface CircularProgressProps {
  value: number
  max: number
  size?: number
  strokeWidth?: number
  className?: string
  showValue?: boolean
  valueClassName?: string
  children?: React.ReactNode
  color?: 'primary' | 'secondary' | 'accent' | 'destructive' | 'muted' | 'contrast'
}

const colorMap = {
  primary: 'stroke-primary',
  secondary: 'stroke-secondary',
  accent: 'stroke-accent',
  destructive: 'stroke-destructive',
  muted: 'stroke-muted-foreground',
  contrast: 'stroke-background'
}

const backgroundColorMap = {
  primary: 'stroke-primary/20',
  secondary: 'stroke-secondary/20',
  accent: 'stroke-accent/20',
  destructive: 'stroke-destructive/20',
  muted: 'stroke-muted-foreground/20',
  contrast: 'stroke-background/30'
}

export function CircularProgress({
  value,
  max,
  size = 120,
  strokeWidth = 8,
  className,
  showValue = true,
  valueClassName,
  children,
  color = 'primary'
}: CircularProgressProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={backgroundColorMap[color]}
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className={cn(colorMap[color], "transition-all duration-500 ease-in-out")}
          style={{
            transformOrigin: 'center',
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children || (showValue && (
          <div className="text-center">
            <div className={cn(
              "font-bold",
              // Dynamic font sizing based on circle size
              size >= 120 ? "text-3xl" :
              size >= 100 ? "text-2xl" :
              size >= 80 ? "text-xl" : "text-lg",
              valueClassName
            )}>
              {Math.round(percentage)}%
            </div>
            <div className={cn(
              "text-muted-foreground",
              // Dynamic subtitle sizing
              size >= 120 ? "text-sm" :
              size >= 100 ? "text-xs" : "text-xs"
            )}>
              {value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Smaller variant for mini progress indicators
export function MiniCircularProgress({
  value,
  max,
  size = 40,
  strokeWidth = 4,
  className,
  color = 'primary'
}: Omit<CircularProgressProps, 'showValue' | 'valueClassName' | 'children'>) {
  return (
    <CircularProgress
      value={value}
      max={max}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      showValue={false}
      color={color}
    />
  )
}

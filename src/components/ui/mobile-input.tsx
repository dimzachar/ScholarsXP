"use client"

import React from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useResponsiveLayout, TOUCH_TARGET_SIZE } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  success?: string
  badge?: {
    text: string
    icon?: LucideIcon
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  }
  mobileOptimized?: boolean
  className?: string
}

export function MobileInput({
  label,
  error,
  success,
  badge,
  mobileOptimized = true,
  className,
  ...props
}: MobileInputProps) {
  const { isMobile, isTablet } = useResponsiveLayout()
  
  // Determine input height based on device and optimization settings
  const getInputHeight = () => {
    if (!mobileOptimized) return 'h-14' // Default height
    
    if (isMobile) return 'h-12' // Reduced height for mobile
    if (isTablet) return 'h-13' // Slightly reduced for tablet
    return 'h-14' // Full height for desktop
  }

  // Determine text size based on device
  const getTextSize = () => {
    if (isMobile) return 'text-base' // Prevent zoom on iOS
    return 'text-base'
  }

  // Determine padding based on badge presence and device
  const getPadding = () => {
    if (badge) {
      return isMobile ? 'pr-20' : 'pr-24'
    }
    return 'px-4'
  }

  // Touch target optimization - using static Tailwind classes
  const getTouchTargetClass = () => {
    if (!mobileOptimized) return ''

    if (isMobile) return 'min-h-11' // 44px minimum touch target
    if (isTablet) return 'min-h-12' // 48px comfortable touch target
    return ''
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className={cn(
          'block font-semibold text-foreground',
          isMobile ? 'text-sm' : 'text-sm'
        )}>
          {label}
        </label>
      )}
      
      <div className="relative">
        <Input
          {...props}
          className={cn(
            getInputHeight(),
            getTextSize(),
            getPadding(),
            getTouchTargetClass(),
            'border-2 border-input focus:border-ring rounded-xl shadow-sm',
            'transition-all duration-200',
            // Mobile-specific optimizations
            isMobile && [
              'focus:ring-2 focus:ring-primary focus:ring-offset-1',
              'active:scale-[0.99]', // Subtle press feedback
            ],
            // Error state
            error && 'border-destructive focus:border-destructive',
            // Success state
            success && 'border-green-500 focus:border-green-500',
            className
          )}
          // Mobile keyboard optimizations
          autoCapitalize={props.type === 'url' ? 'none' : props.autoCapitalize}
          autoCorrect={props.type === 'url' ? 'off' : props.autoCorrect}
          spellCheck={props.type === 'url' ? false : props.spellCheck}
        />
        
        {badge && (
          <div className={cn(
            'absolute top-1/2 transform -translate-y-1/2',
            isMobile ? 'right-3' : 'right-4'
          )}>
            <Badge 
              variant={badge.variant || 'outline'} 
              className={cn(
                'flex items-center gap-2 bg-background border-2',
                isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'
              )}
            >
              {badge.icon && (
                <badge.icon className={cn(
                  isMobile ? 'h-3 w-3' : 'h-4 w-4'
                )} />
              )}
              <span className="font-medium">{badge.text}</span>
            </Badge>
          </div>
        )}
      </div>
      
      {/* Mobile-optimized feedback messages */}
      {(error || success) && (
        <div className={cn(
          'flex items-center gap-2 text-sm font-medium',
          isMobile ? 'px-1' : 'px-2'
        )}>
          {error && (
            <div className="flex items-center gap-2 text-destructive">
              <div className="w-1 h-1 bg-destructive rounded-full" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-1 h-1 bg-green-600 rounded-full" />
              <span>{success}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mobile-optimized textarea component
interface MobileTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  success?: string
  mobileOptimized?: boolean
  className?: string
}

export function MobileTextarea({
  label,
  error,
  success,
  mobileOptimized = true,
  className,
  ...props
}: MobileTextareaProps) {
  const { isMobile, isTablet } = useResponsiveLayout()
  
  // Determine minimum height based on device
  const getMinHeight = () => {
    if (isMobile) return 'min-h-[100px]' // Reduced for mobile
    if (isTablet) return 'min-h-[120px]'
    return 'min-h-[140px]'
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className={cn(
          'block font-semibold text-foreground',
          isMobile ? 'text-sm' : 'text-sm'
        )}>
          {label}
        </label>
      )}
      
      <textarea
        {...props}
        className={cn(
          getMinHeight(),
          'w-full px-4 py-3 border-2 border-input rounded-xl shadow-sm',
          'focus:border-ring focus:ring-2 focus:ring-primary focus:ring-offset-1',
          'resize-y transition-all duration-200',
          isMobile && 'text-base', // Prevent zoom on iOS
          // Mobile-specific optimizations
          isMobile && 'active:scale-[0.99]',
          // Error state
          error && 'border-destructive focus:border-destructive',
          // Success state
          success && 'border-green-500 focus:border-green-500',
          className
        )}
      />
      
      {/* Mobile-optimized feedback messages */}
      {(error || success) && (
        <div className={cn(
          'flex items-center gap-2 text-sm font-medium',
          isMobile ? 'px-1' : 'px-2'
        )}>
          {error && (
            <div className="flex items-center gap-2 text-red-700 dark:text-destructive">
              <div className="w-1 h-1 bg-red-700 dark:bg-destructive rounded-full" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-1 h-1 bg-green-600 rounded-full" />
              <span>{success}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mobile-optimized form wrapper
interface MobileFormProps {
  children: React.ReactNode
  className?: string
  onSubmit?: (e: React.FormEvent) => void
}

export function MobileForm({ children, className, onSubmit }: MobileFormProps) {
  const { isMobile } = useResponsiveLayout()
  
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'space-y-6',
        isMobile && 'space-y-4', // Reduced spacing on mobile
        className
      )}
    >
      {children}
    </form>
  )
}

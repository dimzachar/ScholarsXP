"use client"

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { getResponsiveTouchTarget, ACCESSIBILITY_HELPERS } from '@/lib/touch-targets'
import { cn } from '@/lib/utils'
import { LucideIcon, ChevronRight } from 'lucide-react'

export interface ActionCardData {
  title: string
  description: string
  icon: LucideIcon
  href?: string
  onClick?: () => void
  color?: 'primary' | 'secondary' | 'accent' | 'destructive' | 'muted'
  badges?: Array<{
    text: string
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  }>
  urgent?: boolean
  disabled?: boolean
}

interface MobileActionCardProps {
  data: ActionCardData
  className?: string
  variant?: 'mobile' | 'desktop' | 'auto'
}

const colorConfig = {
  primary: {
    background: 'bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10',
    hoverBackground: 'hover:from-primary/20 hover:via-primary/10 hover:to-primary/20',
    iconBackground: 'bg-gradient-to-br from-primary to-primary',
    iconText: 'text-primary-foreground',
    titleText: 'text-primary',
    titleHover: 'group-hover:text-primary/80',
    descriptionText: 'text-primary/80',
    descriptionHover: 'group-hover:text-primary',
    borderColor: 'border-primary/20'
  },
  secondary: {
    background: 'bg-gradient-to-br from-secondary/10 via-secondary/5 to-secondary/10',
    hoverBackground: 'hover:from-secondary/20 hover:via-secondary/10 hover:to-secondary/20',
    iconBackground: 'bg-gradient-to-br from-secondary to-secondary',
    iconText: 'text-secondary-foreground',
    titleText: 'text-secondary-foreground',
    titleHover: 'group-hover:text-secondary-foreground/80',
    descriptionText: 'text-secondary-foreground/80',
    descriptionHover: 'group-hover:text-secondary-foreground',
    borderColor: 'border-secondary/20'
  },
  accent: {
    background: 'bg-gradient-to-br from-accent/10 via-accent/5 to-accent/10',
    hoverBackground: 'hover:from-accent/20 hover:via-accent/10 hover:to-accent/20',
    iconBackground: 'bg-gradient-to-br from-accent to-accent',
    iconText: 'text-accent-foreground',
    titleText: 'text-accent-foreground',
    titleHover: 'group-hover:text-accent-foreground/80',
    descriptionText: 'text-accent-foreground/80',
    descriptionHover: 'group-hover:text-accent-foreground',
    borderColor: 'border-accent/20'
  },
  destructive: {
    background: 'bg-gradient-to-br from-destructive/10 via-destructive/5 to-destructive/10',
    hoverBackground: 'hover:from-destructive/20 hover:via-destructive/10 hover:to-destructive/20',
    iconBackground: 'bg-gradient-to-br from-destructive to-destructive',
    iconText: 'text-destructive-foreground',
    titleText: 'text-destructive',
    titleHover: 'group-hover:text-destructive/80',
    descriptionText: 'text-destructive/80',
    descriptionHover: 'group-hover:text-destructive',
    borderColor: 'border-destructive/20'
  },
  muted: {
    background: 'bg-gradient-to-br from-muted/10 via-muted/5 to-muted/10',
    hoverBackground: 'hover:from-muted/20 hover:via-muted/10 hover:to-muted/20',
    iconBackground: 'bg-gradient-to-br from-muted to-muted',
    iconText: 'text-muted-foreground',
    titleText: 'text-muted-foreground',
    titleHover: 'group-hover:text-muted-foreground/80',
    descriptionText: 'text-muted-foreground/80',
    descriptionHover: 'group-hover:text-muted-foreground',
    borderColor: 'border-muted/20'
  }
}

export function MobileActionCard({
  data,
  className,
  variant = 'auto'
}: MobileActionCardProps) {
  const { isMobile, isTablet } = useResponsiveLayout()
  
  // Determine effective variant
  const effectiveVariant = variant === 'auto' 
    ? (isMobile ? 'mobile' : 'desktop')
    : variant

  const colors = colorConfig[data.color || 'primary']
  const isMobileLayout = effectiveVariant === 'mobile'

  // Get appropriate touch target class
  const touchTargetClass = getResponsiveTouchTarget('button', isMobile, isTablet)

  const handleClick = () => {
    if (data.disabled) return
    
    if (data.onClick) {
      data.onClick()
    } else if (data.href) {
      window.location.href = data.href
    }
  }

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border-0 transition-all duration-300 cursor-pointer',
        colors.background,
        colors.hoverBackground,
        colors.borderColor,
        touchTargetClass, // Ensure proper touch target size
        ACCESSIBILITY_HELPERS.touchAccessible, // Add accessibility helpers
        !data.disabled && 'hover:shadow-xl',
        isMobileLayout && 'hover:scale-[1.02]',
        !isMobileLayout && 'hover:scale-105',
        data.urgent && 'ring-2 ring-destructive/20',
        data.disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onClick={handleClick}
    >
      {/* Hover overlay effect */}
      <div className={cn(
        'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
        `bg-gradient-to-r from-${data.color || 'primary'}/20 to-${data.color || 'primary'}/20`
      )} />
      
      <CardContent className={cn(
        'relative z-10',
        isMobileLayout ? 'p-4' : 'p-6'
      )}>
        {isMobileLayout ? (
          // Mobile Layout: Simplified, stacked vertically
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                'p-3 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300 shrink-0',
                colors.iconBackground
              )}>
                <data.icon className={cn('h-6 w-6', colors.iconText)} />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className={cn(
                  'text-lg font-bold transition-colors truncate',
                  colors.titleText,
                  colors.titleHover,
                  data.urgent && 'text-destructive'
                )}>
                  {data.title}
                </h4>
                <p className={cn(
                  'text-sm transition-colors line-clamp-2',
                  colors.descriptionText,
                  colors.descriptionHover,
                  data.urgent && 'text-destructive/80'
                )}>
                  {data.description}
                </p>
              </div>
              
              <ChevronRight className={cn(
                'h-5 w-5 transition-colors shrink-0',
                colors.titleText,
                colors.titleHover
              )} />
            </div>
            
            {/* Badges */}
            {data.badges && data.badges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.badges.map((badge, index) => (
                  <Badge 
                    key={index}
                    variant={badge.variant || 'outline'}
                    className={cn(
                      'text-xs',
                      data.urgent && 'border-destructive/30 text-destructive'
                    )}
                  >
                    {badge.text}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          // Desktop Layout: Horizontal with more spacing
          <div className="flex items-center gap-4">
            <div className={cn(
              'p-4 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300',
              colors.iconBackground
            )}>
              <data.icon className={cn('h-8 w-8', colors.iconText)} />
            </div>
            
            <div className="flex-1">
              <h4 className={cn(
                'text-xl font-bold transition-colors',
                colors.titleText,
                colors.titleHover,
                data.urgent && 'text-destructive'
              )}>
                {data.title}
              </h4>
              <p className={cn(
                'transition-colors',
                colors.descriptionText,
                colors.descriptionHover,
                data.urgent && 'text-destructive/80'
              )}>
                {data.description}
              </p>
              
              {/* Badges */}
              {data.badges && data.badges.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  {data.badges.map((badge, index) => (
                    <Badge 
                      key={index}
                      variant={badge.variant || 'outline'}
                      className={cn(
                        'text-xs',
                        data.urgent && 'border-destructive/30 text-destructive'
                      )}
                    >
                      {badge.text}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <ChevronRight className={cn(
              'h-6 w-6 transition-colors',
              colors.titleText,
              colors.titleHover
            )} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Utility function to create action card data
export function createActionCardData(
  title: string,
  description: string,
  icon: LucideIcon,
  options: Partial<Omit<ActionCardData, 'title' | 'description' | 'icon'>> = {}
): ActionCardData {
  return {
    title,
    description,
    icon,
    ...options
  }
}

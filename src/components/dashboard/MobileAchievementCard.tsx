"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CircularProgress } from '@/components/ui/circular-progress'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Star,
  Award,
  BookOpen,
  Users,
  Flame,
  Crown,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface Achievement {
  id: string
  title: string
  description: string
  progress: number
  total: number
  rarity: 'bronze' | 'silver' | 'gold' | 'platinum'
  unlocked: boolean
  completed: boolean
  icon: React.ComponentType<any>
  category: 'content' | 'social' | 'streak' | 'special'
}

interface MobileAchievementCardProps {
  achievement: Achievement
  variant?: 'mobile' | 'desktop' | 'auto'
  className?: string
}

const rarityConfig = {
  bronze: {
    gradient: 'from-amber-400 to-amber-600',
    border: 'border-amber-400',
    text: 'text-amber-600',
    bg: 'bg-amber-50',
    progress: 'secondary' as const,
    foreground: 'text-amber-900'
  },
  silver: {
    gradient: 'from-slate-400 to-slate-600',
    border: 'border-slate-400',
    text: 'text-slate-600',
    bg: 'bg-slate-50',
    progress: 'muted' as const,
    foreground: 'text-slate-900'
  },
  gold: {
    gradient: 'from-yellow-400 to-yellow-600',
    border: 'border-yellow-400',
    text: 'text-yellow-600',
    bg: 'bg-yellow-50',
    progress: 'primary' as const,
    foreground: 'text-yellow-900'
  },
  platinum: {
    gradient: 'from-purple-400 to-purple-600',
    border: 'border-purple-400',
    text: 'text-purple-600',
    bg: 'bg-purple-50',
    progress: 'accent' as const,
    foreground: 'text-purple-900'
  }
}

const categoryIcons = {
  content: BookOpen,
  social: Users,
  streak: Flame,
  special: Crown
}

export function MobileAchievementCard({
  achievement,
  variant = 'auto',
  className
}: MobileAchievementCardProps) {
  const { isMobile, isTablet } = useResponsiveLayout()
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Determine effective variant
  const effectiveVariant = variant === 'auto' 
    ? (isMobile ? 'mobile' : 'desktop')
    : variant

  const config = rarityConfig[achievement.rarity]
  const IconComponent = achievement.icon
  const CategoryIcon = categoryIcons[achievement.category]
  
  const isLocked = !achievement.unlocked
  const progressPercentage = (achievement.progress / achievement.total) * 100
  const isMobileLayout = effectiveVariant === 'mobile'

  if (isMobileLayout) {
    // Mobile Layout: Simplified, expandable card
    return (
      <Card className={cn(
        "relative overflow-hidden transition-all duration-300",
        isLocked ? "opacity-60" : "",
        achievement.completed ? `${config.border} ${config.bg}` : "border-muted",
        className
      )}>
        {/* Rarity indicator - smaller for mobile */}
        <div className={cn(
          "absolute top-0 right-0 w-0 h-0 border-l-[30px] border-b-[30px] border-l-transparent",
          `border-b-${achievement.rarity === 'bronze' ? 'amber' : 
                      achievement.rarity === 'silver' ? 'slate' :
                      achievement.rarity === 'gold' ? 'yellow' : 'purple'}-400`
        )}>
          <Star className="absolute -bottom-5 -right-5 h-3 w-3 text-primary-foreground" />
        </div>

        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg shrink-0",
              isLocked ? "bg-muted" : `bg-gradient-to-br ${config.gradient}`
            )}>
              {isLocked ? (
                <Lock className="h-5 w-5 text-muted-foreground" />
              ) : (
                <IconComponent className={cn("h-5 w-5", config.foreground)} />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <CardTitle className={cn(
                "text-base truncate",
                isLocked ? "text-muted-foreground" : config.text
              )}>
                {achievement.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <CategoryIcon className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline" className="text-xs">
                  {achievement.rarity.toUpperCase()}
                </Badge>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0 h-8 w-8 p-0"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Progress bar - always visible */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={cn(
                    "h-2 rounded-full transition-all duration-500",
                    achievement.completed 
                      ? `bg-gradient-to-r ${config.gradient}`
                      : "bg-primary"
                  )}
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                />
              </div>
            </div>
            <span className={cn(
              "text-sm font-medium",
              achievement.completed ? config.text : "text-foreground"
            )}>
              {achievement.progress}/{achievement.total}
            </span>
          </div>

          {/* Expandable content */}
          {isExpanded && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
              <p className="text-sm text-muted-foreground">
                {achievement.description}
              </p>

              {/* Completion status */}
              {achievement.completed && (
                <div className="flex items-center justify-center">
                  <Badge className={cn(
                    "bg-gradient-to-r",
                    config.gradient,
                    config.foreground
                  )}>
                    <Award className="h-3 w-3 mr-1" />
                    Completed
                  </Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Desktop Layout: Full card with circular progress
  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300 hover:shadow-lg",
      isLocked ? "opacity-60" : "hover:scale-105",
      achievement.completed ? `${config.border} ${config.bg}` : "border-muted",
      className
    )}>
      {/* Rarity indicator */}
      <div className={cn(
        "absolute top-0 right-0 w-0 h-0 border-l-[40px] border-b-[40px] border-l-transparent",
        `border-b-${achievement.rarity === 'bronze' ? 'amber' : 
                    achievement.rarity === 'silver' ? 'slate' :
                    achievement.rarity === 'gold' ? 'yellow' : 'purple'}-400`
      )}>
        <Star className="absolute -bottom-6 -right-6 h-4 w-4 text-primary-foreground" />
      </div>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isLocked ? "bg-muted" : `bg-gradient-to-br ${config.gradient}`,
              "relative"
            )}>
              {isLocked ? (
                <Lock className="h-6 w-6 text-muted-foreground" />
              ) : (
                <IconComponent className={cn("h-6 w-6", config.foreground)} />
              )}
            </div>
            <div className="flex-1">
              <CardTitle className={cn(
                "text-lg",
                isLocked ? "text-muted-foreground" : config.text
              )}>
                {achievement.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <CategoryIcon className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline" className="text-xs">
                  {achievement.rarity.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {achievement.description}
        </p>

        {/* Progress Section */}
        <div className="flex items-center justify-between">
          <div className="flex-1 mr-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className={cn(
                "font-medium",
                achievement.completed ? config.text : "text-foreground"
              )}>
                {achievement.progress} / {achievement.total}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  achievement.completed 
                    ? `bg-gradient-to-r ${config.gradient}`
                    : "bg-primary"
                )}
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Circular progress for unlocked achievements */}
          {!isLocked && (
            <CircularProgress
              value={achievement.progress}
              max={achievement.total}
              size={50}
              strokeWidth={4}
              color={config.progress}
              showValue={false}
            />
          )}
        </div>

        {/* Completion status */}
        {achievement.completed && (
          <div className="mt-3 flex items-center justify-center">
            <Badge className={cn(
              "bg-gradient-to-r",
              config.gradient,
              config.foreground
            )}>
              <Award className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

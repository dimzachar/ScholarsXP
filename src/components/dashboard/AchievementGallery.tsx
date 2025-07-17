"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CircularProgress } from '@/components/ui/circular-progress'
import { MobileAchievementCard } from '@/components/dashboard/MobileAchievementCard'
import { useResponsiveLayout, getResponsiveGridClasses } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Star,
  Award,
  BookOpen,
  Users,
  Flame,
  Crown,
  Lock
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

interface AchievementGalleryProps {
  achievements?: Achievement[]
  className?: string
}

const rarityConfig = {
  bronze: {
    gradient: 'from-warning to-warning',
    border: 'border-warning',
    text: 'text-warning',
    bg: 'bg-warning/10',
    progress: 'warning' as const,
    foreground: 'text-warning-foreground'
  },
  silver: {
    gradient: 'from-muted-foreground to-muted-foreground',
    border: 'border-muted-foreground',
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    progress: 'info' as const,
    foreground: 'text-info-foreground'
  },
  gold: {
    gradient: 'from-warning to-warning',
    border: 'border-warning',
    text: 'text-warning',
    bg: 'bg-warning/10',
    progress: 'warning' as const,
    foreground: 'text-warning-foreground'
  },
  platinum: {
    gradient: 'from-purple to-purple',
    border: 'border-purple',
    text: 'text-purple',
    bg: 'bg-purple/10',
    progress: 'purple' as const,
    foreground: 'text-purple-foreground'
  }
}

const categoryIcons = {
  content: BookOpen,
  social: Users,
  streak: Flame,
  special: Crown
}



function AchievementCard({ achievement }: { achievement: Achievement }) {
  const config = rarityConfig[achievement.rarity]
  const IconComponent = achievement.icon
  const CategoryIcon = categoryIcons[achievement.category]
  
  const isLocked = !achievement.unlocked
  const progressPercentage = (achievement.progress / achievement.total) * 100

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300 hover:shadow-lg",
      isLocked ? "opacity-60" : "hover:scale-105",
      achievement.completed ? `${config.border} ${config.bg}` : "border-muted"
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

export function AchievementGallery({ achievements = [], className }: AchievementGalleryProps) {
  const { currentBreakpoint } = useResponsiveLayout()
  const completedCount = achievements.filter(a => a.completed).length
  const unlockedCount = achievements.filter(a => a.unlocked).length
  const hasAchievements = achievements.length > 0

  return (
    <div className={cn("space-y-6", className)}>
      {/* Achievement Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Achievement Gallery</h3>
          <p className="text-sm text-muted-foreground">
            {hasAchievements ? (
              `${completedCount} completed • ${unlockedCount} unlocked • ${achievements.length} total`
            ) : (
              'No achievements data available'
            )}
          </p>
        </div>
        {hasAchievements && (
          <Badge variant="outline" className="text-sm">
            {Math.round((completedCount / achievements.length) * 100)}% Complete
          </Badge>
        )}
      </div>

      {/* Achievement Grid or Empty State */}
      {hasAchievements ? (
        <div className={getResponsiveGridClasses(currentBreakpoint, 1, 2, 3)}>
          {achievements.map((achievement) => (
            <MobileAchievementCard key={achievement.id} achievement={achievement} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="text-center py-12">
          <Trophy className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-muted-foreground mb-2">No Achievements Yet</h4>
          <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
            Start submitting content and engaging with the community to unlock your first achievements!
          </p>
        </div>
      )}
    </div>
  )
}

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
  recentlyEarned?: any[]
  loading?: boolean
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

export function AchievementGallery({
  achievements = [],
  recentlyEarned = [],
  loading = false,
  className
}: AchievementGalleryProps) {
  const { currentBreakpoint } = useResponsiveLayout()
  const hasRecentAchievements = recentlyEarned.length > 0

  if (loading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Recent Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 border rounded-lg animate-pulse">
                <div className="h-12 w-12 bg-muted rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Recent Achievements
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasRecentAchievements ? (
          <div className="space-y-4">
            {recentlyEarned.map((userAchievement) => (
              <div key={userAchievement.id} className="flex items-center gap-4 p-4 bg-success/5 border border-success/20 rounded-lg">
                <div className="h-12 w-12 bg-success/10 rounded-full flex items-center justify-center">
                  <Award className="h-6 w-6 text-success" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">{userAchievement.achievement.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {userAchievement.achievement.description}
                  </p>
                  <p className="text-xs text-success mt-1">
                    Earned {new Date(userAchievement.earnedAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge className="bg-success/10 text-success border-success/20">
                  +{userAchievement.achievement.xpReward} XP
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-8">
            <Trophy className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <h4 className="text-lg font-medium text-muted-foreground mb-2">No Recent Achievements</h4>
            <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
              Keep submitting content and engaging with the community to unlock achievements!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

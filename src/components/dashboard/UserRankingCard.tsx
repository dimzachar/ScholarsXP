'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, TrendingDown, Minus, Users, Award } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserRank {
  weekly: number
  allTime: number
  totalUsers: number
  percentile?: number
  trend?: 'up' | 'down' | 'stable'
}

interface UserRankingCardProps {
  rank: UserRank
  className?: string
  showTrend?: boolean
  showPercentile?: boolean
}

const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-4 w-4 text-green-600" />
    case 'down':
      return <TrendingDown className="h-4 w-4 text-red-600" />
    case 'stable':
      return <Minus className="h-4 w-4 text-yellow-600" />
    default:
      return null
  }
}

const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return 'text-green-600'
    case 'down':
      return 'text-red-600'
    case 'stable':
      return 'text-yellow-600'
    default:
      return 'text-muted-foreground'
  }
}

const getRankBadgeVariant = (rank: number, totalUsers: number) => {
  const percentage = (rank / totalUsers) * 100
  if (percentage <= 10) return 'default' // Top 10%
  if (percentage <= 25) return 'secondary' // Top 25%
  return 'outline' // Rest
}

const getRankDescription = (rank: number, totalUsers: number) => {
  const percentage = (rank / totalUsers) * 100
  if (percentage <= 5) return 'Elite performer'
  if (percentage <= 10) return 'Top performer'
  if (percentage <= 25) return 'Strong performer'
  if (percentage <= 50) return 'Above average'
  return 'Keep improving'
}

export function UserRankingCard({ 
  rank, 
  className, 
  showTrend = true,
  showPercentile = true 
}: UserRankingCardProps) {
  if (!rank) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Your Ranking
          </CardTitle>
          <CardDescription>See how you compare to other scholars</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No ranking data available</p>
        </CardContent>
      </Card>
    )
  }

  const weeklyPercentile = ((rank.totalUsers - rank.weekly + 1) / rank.totalUsers) * 100
  const allTimePercentile = ((rank.totalUsers - rank.allTime + 1) / rank.totalUsers) * 100

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Your Ranking
          </span>
          {showTrend && rank.trend && (
            <div className={cn("flex items-center gap-1", getTrendColor(rank.trend))}>
              {getTrendIcon(rank.trend)}
              <span className="text-sm font-medium capitalize">{rank.trend}</span>
            </div>
          )}
        </CardTitle>
        <CardDescription>
          {getRankDescription(rank.weekly, rank.totalUsers)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Weekly Ranking */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">This Week</span>
              <Badge variant={getRankBadgeVariant(rank.weekly, rank.totalUsers)}>
                #{rank.weekly}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {rank.totalUsers} scholars
              </span>
              {showPercentile && (
                <span className="text-muted-foreground">
                  Top {weeklyPercentile.toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {/* All-Time Ranking */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">All Time</span>
              <Badge variant={getRankBadgeVariant(rank.allTime, rank.totalUsers)}>
                #{rank.allTime}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <Award className="h-4 w-4" />
                Overall standing
              </span>
              {showPercentile && (
                <span className="text-muted-foreground">
                  Top {allTimePercentile.toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {/* Performance Insights */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Performance Insight</h4>
              <p className="text-xs text-muted-foreground">
                {rank.weekly < rank.allTime 
                  ? `You're performing better this week! You've moved up ${rank.allTime - rank.weekly} positions.`
                  : rank.weekly > rank.allTime
                  ? `Focus on consistency to improve your weekly ranking.`
                  : `You're maintaining steady performance across time periods.`
                }
              </p>
            </div>
          </div>

          {/* Additional Stats */}
          {rank.percentile && showPercentile && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">
                  {rank.percentile.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Percentile</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary">
                  {Math.max(0, rank.totalUsers - rank.weekly)}
                </div>
                <div className="text-xs text-muted-foreground">Behind you</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

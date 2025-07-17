"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Crown
} from 'lucide-react'

interface LeaderboardUser {
  id: string
  username: string
  email: string
  totalXp: number
  weeklyXp: number
  rank: number
  previousRank?: number
  profileImageUrl?: string
  isCurrentUser?: boolean
}

interface LeaderboardWidgetProps {
  users?: LeaderboardUser[]
  currentUser?: LeaderboardUser
  className?: string
  onViewFull?: () => void
}



function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="h-5 w-5 text-yellow-500" />
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />
    case 3:
      return <Award className="h-5 w-5 text-amber-600" />
    default:
      return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
  }
}

function getTrendIcon(current: number, previous?: number) {
  if (!previous) return <Minus className="h-4 w-4 text-muted-foreground" />

  if (current < previous) {
    return <TrendingUp className="h-4 w-4 text-success" />
  } else if (current > previous) {
    return <TrendingDown className="h-4 w-4 text-destructive" />
  } else {
    return <Minus className="h-4 w-4 text-muted-foreground" />
  }
}

function getRankBadgeColor(rank: number) {
  if (rank <= 3) return "bg-gradient-to-r from-warning to-warning text-warning-foreground"
  if (rank <= 10) return "bg-gradient-to-r from-info to-info text-info-foreground"
  return "bg-muted text-muted-foreground"
}

function LeaderboardUserRow({ user, position }: { user: LeaderboardUser; position: number }) {
  const rankChange = user.previousRank ? user.previousRank - user.rank : 0

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
      user.isCurrentUser 
        ? "bg-primary/10 border border-primary/20 shadow-sm" 
        : "hover:bg-muted/50"
    )}>
      {/* Rank */}
      <div className="flex items-center justify-center w-8">
        {getRankIcon(user.rank)}
      </div>

      {/* Avatar */}
      <Avatar className="h-10 w-10">
        <AvatarImage src={user.profileImageUrl} />
        <AvatarFallback className={cn(
          "text-sm font-medium",
          user.isCurrentUser ? "bg-primary text-primary-foreground" : ""
        )}>
          {user.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* User Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            "font-medium truncate",
            user.isCurrentUser ? "text-primary" : ""
          )}>
            {user.isCurrentUser ? 'You' : user.username}
          </p>
          {user.isCurrentUser && (
            <Badge variant="outline" className="text-xs">You</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{user.totalXp.toLocaleString()} XP</span>
          <span>•</span>
          <span>+{user.weeklyXp} this week</span>
        </div>
      </div>

      {/* Trend Indicator */}
      <div className="flex items-center gap-1">
        {getTrendIcon(user.rank, user.previousRank)}
        {rankChange !== 0 && (
          <span className={cn(
            "text-xs font-medium",
            rankChange > 0 ? "text-green-600" : "text-red-600"
          )}>
            {Math.abs(rankChange)}
          </span>
        )}
      </div>
    </div>
  )
}

export function LeaderboardWidget({
  users = [],
  currentUser,
  className,
  onViewFull
}: LeaderboardWidgetProps) {
  const topUsers = users.slice(0, 5)
  const showCurrentUser = currentUser && !topUsers.find(u => u.id === currentUser.id)
  const hasData = users.length > 0

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Leaderboard
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Weekly
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {hasData ? (
          <>
            {/* Top 5 Users */}
            {topUsers.map((user, index) => (
              <LeaderboardUserRow key={user.id} user={user} position={index + 1} />
            ))}

            {/* Current User (if not in top 5) */}
            {showCurrentUser && (
              <>
                <div className="flex items-center justify-center py-2">
                  <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
                  <span className="px-3 text-xs text-muted-foreground">Your Position</span>
                  <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
                </div>
                <LeaderboardUserRow user={currentUser} position={currentUser.rank} />
              </>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="text-center py-8">
            <Trophy className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No leaderboard data yet</p>
            <p className="text-xs text-muted-foreground/70">
              Start submitting content to see rankings!
            </p>
          </div>
        )}

        {/* View Full Leaderboard Button */}
        <div className="pt-3 border-t">
          <Button
            variant="outline"
            className="w-full justify-center"
            onClick={onViewFull}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Leaderboard
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

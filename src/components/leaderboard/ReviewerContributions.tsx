'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { 
  Users,
  Star,
  Clock,
  TrendingUp,
  Award,
  MessageSquare,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'

interface ReviewerContribution {
  reviewerId: string
  reviewer: {
    username: string
    email: string
    role: string
  }
  totalReviews: number
  averageScore: number
  averageTimeSpent: number | null
  averageQuality: number | null
  onTimeRate: number
  contributionScore: number
  recentReviews: Array<{
    submissionId: string
    submissionTitle: string
    xpScore: number
    timeSpent: number | null
    qualityRating: number | null
    isLate: boolean
    createdAt: string
  }>
}

interface ReviewerContributionsProps {
  contributions: ReviewerContribution[]
  timeframe?: 'week' | 'month' | 'all'
  showDetails?: boolean
}

export default function ReviewerContributions({ 
  contributions, 
  timeframe = 'week',
  showDetails = true 
}: ReviewerContributionsProps) {
  const getContributionLevel = (score: number) => {
    if (score >= 90) return { level: 'Excellent', color: 'text-green-600', bgColor: 'bg-green-100' }
    if (score >= 75) return { level: 'Good', color: 'text-blue-600', bgColor: 'bg-blue-100' }
    if (score >= 60) return { level: 'Fair', color: 'text-yellow-600', bgColor: 'bg-yellow-100' }
    return { level: 'Needs Improvement', color: 'text-red-600', bgColor: 'bg-red-100' }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-blue-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground text-xs">Not rated</span>
    
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-xs">({rating}/5)</span>
      </div>
    )
  }

  const formatTimeframe = (timeframe: string) => {
    switch (timeframe) {
      case 'week': return 'This Week'
      case 'month': return 'This Month'
      case 'all': return 'All Time'
      default: return 'Current Period'
    }
  }

  if (contributions.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <div className="text-lg font-medium mb-2">No Reviewer Contributions</div>
          <div className="text-sm text-muted-foreground">
            No reviewer activity found for the selected timeframe.
          </div>
        </CardContent>
      </Card>
    )
  }

  // Sort by contribution score
  const sortedContributions = [...contributions].sort((a, b) => b.contributionScore - a.contributionScore)

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Reviewer Contributions - {formatTimeframe(timeframe)}
          </CardTitle>
          <CardDescription>
            Performance metrics and contribution analysis for peer reviewers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{contributions.length}</div>
              <div className="text-sm text-muted-foreground">Active Reviewers</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {contributions.reduce((sum, c) => sum + c.totalReviews, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Reviews</div>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {(contributions.reduce((sum, c) => sum + c.averageScore, 0) / contributions.length).toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground">Avg Score</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {(contributions.reduce((sum, c) => sum + c.onTimeRate, 0) / contributions.length).toFixed(0)}%
              </div>
              <div className="text-sm text-muted-foreground">On-Time Rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Reviewer Cards */}
      <div className="grid gap-4">
        {sortedContributions.map((contribution, index) => {
          const contributionLevel = getContributionLevel(contribution.contributionScore)
          
          return (
            <Card key={contribution.reviewerId} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>
                          {contribution.reviewer.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {index < 3 && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white">{index + 1}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold">{contribution.reviewer.username}</div>
                      <div className="text-sm text-muted-foreground">{contribution.reviewer.email}</div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {contribution.reviewer.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={`${contributionLevel.bgColor} ${contributionLevel.color}`}>
                      {contributionLevel.level}
                    </Badge>
                    <div className="text-2xl font-bold mt-1">{contribution.contributionScore}</div>
                    <div className="text-xs text-muted-foreground">Contribution Score</div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Performance Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="font-bold text-lg">{contribution.totalReviews}</div>
                    <div className="text-xs text-muted-foreground">Reviews</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className={`font-bold text-lg ${getScoreColor(contribution.averageScore)}`}>
                      {contribution.averageScore.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Score</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="font-bold text-lg">
                      {contribution.averageTimeSpent ? `${contribution.averageTimeSpent.toFixed(0)}m` : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Time</div>
                  </div>
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className={`font-bold text-lg ${
                      contribution.onTimeRate >= 90 ? 'text-green-600' : 
                      contribution.onTimeRate >= 70 ? 'text-blue-600' : 'text-red-600'
                    }`}>
                      {contribution.onTimeRate.toFixed(0)}%
                    </div>
                    <div className="text-xs text-muted-foreground">On Time</div>
                  </div>
                </div>

                {/* Quality Rating */}
                {contribution.averageQuality && (
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm font-medium">Review Quality</span>
                    </div>
                    {renderStars(contribution.averageQuality)}
                  </div>
                )}

                {/* Contribution Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Contribution Level</span>
                    <span className="text-sm text-muted-foreground">{contribution.contributionScore}/100</span>
                  </div>
                  <Progress value={contribution.contributionScore} className="h-2" />
                </div>

                {/* Recent Reviews */}
                {showDetails && contribution.recentReviews.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Recent Reviews
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {contribution.recentReviews.slice(0, 3).map((review, reviewIndex) => (
                        <div key={reviewIndex} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                          <div className="flex-1 truncate">
                            <div className="font-medium truncate">{review.submissionTitle}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString()}
                              {review.timeSpent && ` • ${review.timeSpent}m`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {review.isLate && (
                              <AlertTriangle className="h-3 w-3 text-red-600" />
                            )}
                            <div className={`font-medium ${getScoreColor(review.xpScore)}`}>
                              {review.xpScore}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performance Indicators */}
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <div className="flex items-center gap-4">
                    {contribution.onTimeRate >= 90 && (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        Reliable
                      </div>
                    )}
                    {contribution.averageScore >= 75 && (
                      <div className="flex items-center gap-1 text-blue-600">
                        <Award className="h-3 w-3" />
                        High Quality
                      </div>
                    )}
                    {contribution.totalReviews >= 10 && (
                      <div className="flex items-center gap-1 text-purple-600">
                        <TrendingUp className="h-3 w-3" />
                        Active
                      </div>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    Rank #{index + 1}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

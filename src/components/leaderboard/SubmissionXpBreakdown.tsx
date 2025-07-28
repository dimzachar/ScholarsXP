'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Award,
  Bot,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react'

interface SubmissionXpBreakdownProps {
  submission: {
    id: string
    title: string
    platform: string
    taskTypes: string[]
    status: string
    aiXp: number
    peerXp: number | null
    finalXp: number | null
    originalityScore: number | null
    consensusScore: number | null
    reviewCount: number
    user: {
      username: string
      role: string
    }
    peerReviews: Array<{
      reviewerId: string
      xpScore: number
      reviewer: {
        username: string
      }
    }>
  }
  showDetails?: boolean
}

export default function SubmissionXpBreakdown({ 
  submission, 
  showDetails = true 
}: SubmissionXpBreakdownProps) {
  const getXpColor = (xp: number | null) => {
    if (xp === null) return 'text-muted-foreground'
    if (xp >= 80) return 'text-green-600'
    if (xp >= 60) return 'text-blue-600'
    if (xp >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'FINALIZED':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'UNDER_PEER_REVIEW':
        return <Clock className="h-4 w-4 text-blue-600" />
      case 'FLAGGED':
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const calculateProgress = () => {
    let progress = 0
    if (submission.aiXp > 0) progress += 33
    if (submission.peerXp !== null) progress += 33
    if (submission.finalXp !== null) progress += 34
    return progress
  }

  const getXpTrend = () => {
    if (!submission.peerXp || !submission.finalXp) return null
    
    const avgScore = (submission.aiXp + submission.peerXp) / 2
    const difference = submission.finalXp - avgScore
    
    if (Math.abs(difference) < 5) return null
    
    return {
      direction: difference > 0 ? 'up' : 'down',
      amount: Math.abs(difference),
      percentage: ((difference / avgScore) * 100).toFixed(1)
    }
  }

  const trend = getXpTrend()

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {getStatusIcon(submission.status)}
              {submission.title}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span>{submission.user.username}</span>
              <Badge variant="outline" className="text-xs">
                {submission.platform}
              </Badge>
              {submission.taskTypes.map((type, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
            </CardDescription>
          </div>
          {submission.finalXp && (
            <div className="text-right">
              <div className={`text-2xl font-bold ${getXpColor(submission.finalXp)}`}>
                {submission.finalXp}
              </div>
              <div className="text-xs text-muted-foreground">Final XP</div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* XP Progress Bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Processing Progress</span>
            <span className="text-sm text-muted-foreground">{calculateProgress()}%</span>
          </div>
          <Progress value={calculateProgress()} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>AI Review</span>
            <span>Peer Review</span>
            <span>Finalized</span>
          </div>
        </div>

        {/* XP Breakdown */}
        <div className="grid grid-cols-3 gap-4">
          {/* AI XP */}
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Bot className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">AI XP</span>
            </div>
            <div className={`text-xl font-bold ${getXpColor(submission.aiXp)}`}>
              {submission.aiXp}
            </div>
            {submission.originalityScore && (
              <div className="text-xs text-muted-foreground mt-1">
                {(submission.originalityScore * 100).toFixed(0)}% original
              </div>
            )}
          </div>

          {/* Peer XP */}
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Users className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Peer XP</span>
            </div>
            <div className={`text-xl font-bold ${getXpColor(submission.peerXp)}`}>
              {submission.peerXp || 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {submission.reviewCount}/3 reviews
              {submission.consensusScore && (
                <div>{(submission.consensusScore * 100).toFixed(0)}% consensus</div>
              )}
            </div>
          </div>

          {/* Final XP */}
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-2">
              <Award className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">Final XP</span>
            </div>
            <div className={`text-xl font-bold ${getXpColor(submission.finalXp)}`}>
              {submission.finalXp || 'Pending'}
            </div>
            {trend && (
              <div className={`text-xs flex items-center justify-center gap-1 mt-1 ${
                trend.direction === 'up' ? 'text-green-600' : 'text-red-600'
              }`}>
                {trend.direction === 'up' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend.percentage}%
              </div>
            )}
          </div>
        </div>

        {/* XP Flow Visualization */}
        {showDetails && (
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="text-sm font-medium mb-3">XP Calculation Flow</div>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                  <Bot className="h-5 w-5 text-blue-600" />
                </div>
                <div className="font-medium">{submission.aiXp}</div>
                <div className="text-xs text-muted-foreground">AI Score</div>
              </div>
              
              <div className="flex-1 h-px bg-border mx-3 relative">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                  +
                </div>
              </div>
              
              <div className="text-center">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div className="font-medium">{submission.peerXp || '?'}</div>
                <div className="text-xs text-muted-foreground">Peer Avg</div>
              </div>
              
              <div className="flex-1 h-px bg-border mx-3 relative">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
                  =
                </div>
              </div>
              
              <div className="text-center">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                  <Award className="h-5 w-5 text-purple-600" />
                </div>
                <div className="font-medium">{submission.finalXp || '?'}</div>
                <div className="text-xs text-muted-foreground">Final XP</div>
              </div>
            </div>
          </div>
        )}

        {/* Peer Review Details */}
        {showDetails && submission.peerReviews.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Individual Peer Reviews</div>
            <div className="grid gap-2">
              {submission.peerReviews.map((review, index) => (
                <div key={review.reviewerId} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <div className="text-sm">{review.reviewer.username}</div>
                  <div className={`font-medium ${getXpColor(review.xpScore)}`}>
                    {review.xpScore} XP
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Summary */}
        <div className="pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(submission.status)}
              <span>{submission.status.replace('_', ' ')}</span>
            </div>
            <div>
              {submission.reviewCount < 3 && (
                <span className="text-orange-600">
                  {3 - submission.reviewCount} more review{3 - submission.reviewCount !== 1 ? 's' : ''} needed
                </span>
              )}
              {submission.reviewCount >= 3 && submission.status !== 'FINALIZED' && (
                <span className="text-blue-600">Ready for finalization</span>
              )}
              {submission.status === 'FINALIZED' && (
                <span className="text-green-600">Complete</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

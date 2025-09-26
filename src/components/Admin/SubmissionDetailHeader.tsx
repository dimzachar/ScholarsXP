'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { 
  ExternalLink, 
  Calendar, 
  User, 
  Award,
  Flag,
  Clock,
  TrendingUp
} from 'lucide-react'
import Link from 'next/link'

interface SubmissionDetailHeaderProps {
  submission: {
    id: string
    title: string
    content: string
    url: string
    platform: string
    taskTypes: string[]
    status: string
    aiXp: number
    peerXp: number | null
    finalXp: number | null
  originalityScore: number | null
  consensusScore: number | null
  reviewCount: number
  flagCount: number
  createdAt: string
  updatedAt: string
  weekNumber: number
  aiEvaluation?: {
    status: string | null
  } | null
  aiEvaluationSettings?: {
    globallyEnabled: boolean
    hasEvaluation: boolean
  }
  user: {
    id: string
    username: string
    email: string
    role: string
      totalXp: number
    }
  }
}

export default function SubmissionDetailHeader({ submission }: SubmissionDetailHeaderProps) {
  const envAiDisabled = (process.env.NEXT_PUBLIC_AI_DISABLED || 'false') === 'true'
  const isLegacy = Boolean(
    submission.platform?.toUpperCase().includes('LEGACY') ||
    submission.taskTypes.some(task => task.toUpperCase() === 'LEGACY')
  )
  const aiGloballyEnabled = submission.aiEvaluationSettings?.globallyEnabled ?? !envAiDisabled
  const hasAiEvaluationData = submission.aiEvaluationSettings?.hasEvaluation ?? Boolean(
    submission.aiEvaluation && submission.aiEvaluation.status === 'COMPLETED'
  )
  const showAiMetric = hasAiEvaluationData && !isLegacy
  const aiEvaluationEnabled = showAiMetric && aiGloballyEnabled
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINALIZED': return 'bg-green-100 text-green-800 border-green-200'
      case 'UNDER_PEER_REVIEW': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'AI_REVIEWED': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'PENDING': return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'FLAGGED': return 'bg-red-100 text-red-800 border-red-200'
      case 'REJECTED': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getXpStatusColor = (xp: number | null) => {
    if (xp === null) return 'text-muted-foreground'
    if (xp >= 80) return 'text-green-600 dark:text-green-300'
    if (xp >= 60) return 'text-blue-600 dark:text-blue-300'
    if (xp >= 40) return 'text-yellow-600 dark:text-yellow-300'
    return 'text-red-600 dark:text-red-300'
  }

  const calculateProgress = () => {
    if (submission.status === 'FINALIZED') return 100
    let progress = 0
    if (showAiMetric) {
      if (submission.aiXp > 0) progress += 33
      if (submission.peerXp !== null) progress += 33
      if (submission.finalXp !== null) progress += 34
    } else {
      if (submission.peerXp !== null) progress += 50
      if (submission.finalXp !== null) progress += 50
    }
    return Math.min(100, progress)
  }

  const reviewSummaryIntro = showAiMetric
    ? (aiEvaluationEnabled ? 'AI evaluation' : 'archived AI evaluation')
    : (aiGloballyEnabled ? 'initial review' : 'initial review (AI disabled)')
  const peerSummary = submission.peerXp !== null
    ? `and peer review (${submission.reviewCount} reviews)`
    : 'but is pending peer review'
  const finalSummary = submission.finalXp !== null
    ? `Final XP of ${submission.finalXp} has been awarded.`
    : 'Final XP calculation is pending.'
  const legacySummary = `This legacy submission reflects imported peer XP that already matches the final award. ${finalSummary}`
  const nonLegacySummary = `This submission has been processed through ${reviewSummaryIntro} ${peerSummary}. ${finalSummary}`

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <CardTitle className="text-xl">
                {submission.title || 'Untitled Submission'}
              </CardTitle>
              <Badge className={getStatusColor(submission.status)}>
                {submission.status.replace('_', ' ')}
              </Badge>
              {submission.flagCount > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Flag className="h-3 w-3" />
                  {submission.flagCount} flag{submission.flagCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <CardDescription className="text-base">
              {submission.content?.substring(0, 200)}
              {submission.content?.length > 200 && '...'}
            </CardDescription>
          </div>
          <Link href={submission.url} target="_blank">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Original
            </Button>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* XP Metrics */}
        <div className={`grid ${showAiMetric ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'} gap-4 mb-6`}>
          {showAiMetric && (
            <div className="text-center p-4 rounded-lg border border-blue-200/60 bg-blue-50 dark:bg-slate-900/60 dark:border-blue-500/30">
              <div className={`text-2xl font-bold ${getXpStatusColor(submission.aiXp)} dark:text-blue-200`}>
                {submission.aiXp}
              </div>
              <div className="text-sm text-muted-foreground">
                {aiEvaluationEnabled ? 'AI XP' : 'AI XP (archived)'}
              </div>
              {submission.originalityScore && (
                <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                  {(submission.originalityScore * 100).toFixed(0)}% original
                </div>
              )}
            </div>
          )}
          
          <div className="text-center p-4 rounded-lg border border-green-200/60 bg-green-50 dark:bg-emerald-900/40 dark:border-emerald-500/30">
            <div className={`text-2xl font-bold ${getXpStatusColor(submission.peerXp)} dark:text-emerald-200`}>
              {submission.peerXp ?? 'N/A'}
            </div>
            <div className="text-sm text-muted-foreground">Peer XP</div>
            {submission.consensusScore && (
              <div className="text-xs text-green-600 dark:text-green-300 mt-1">
                {(submission.consensusScore * 100).toFixed(0)}% consensus
              </div>
            )}
          </div>
          
          <div className="text-center p-4 rounded-lg border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-emerald-100/80 to-white dark:from-emerald-950 dark:via-emerald-900/70 dark:to-slate-950/80 dark:border-emerald-500/40 shadow-sm">
            <div className={`text-2xl font-bold ${getXpStatusColor(submission.finalXp)} dark:text-emerald-200`}>
              {submission.finalXp ?? 'Pending'}
            </div>
            <div className="text-sm text-muted-foreground">Final XP</div>
            {aiEvaluationEnabled && submission.finalXp !== null && submission.aiXp !== null && (
              <div className="text-xs text-emerald-600 dark:text-emerald-300 mt-1">
                {submission.finalXp > submission.aiXp ? '+' : ''}
                {submission.finalXp - submission.aiXp} vs AI
              </div>
            )}
          </div>
          
          <div className="text-center p-4 rounded-lg border border-orange-200/60 bg-orange-50 dark:bg-amber-900/40 dark:border-amber-500/30">
            <div className="text-2xl font-bold text-orange-600 dark:text-amber-200">
              {submission.reviewCount}
            </div>
            <div className="text-sm text-muted-foreground">Reviews</div>
            <div className="text-xs text-orange-600 dark:text-amber-300 mt-1">
              {submission.reviewCount >= 3 ? 'Complete' : `${Math.max(0, 3 - submission.reviewCount)} needed`}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Processing Progress</span>
            <span className="text-sm text-muted-foreground">{calculateProgress()}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${calculateProgress()}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            {showAiMetric ? (
              <>
                <span>AI Review</span>
                <span>Peer Review</span>
                <span>Finalized</span>
              </>
            ) : (
              <>
                <span>Peer Review</span>
                <span>Finalized</span>
              </>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{submission.user.username}</div>
              <div className="text-muted-foreground">{submission.user.email}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Submitted</div>
              <div className="text-muted-foreground">{formatDate(submission.createdAt)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Week {submission.weekNumber}</div>
              <div className="text-muted-foreground">User Total: {submission.user.totalXp} XP</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-muted-foreground">{formatDate(submission.updatedAt)}</div>
            </div>
          </div>
        </div>

        {/* Task Types and Platform */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {submission.platform}
            </Badge>
            {submission.taskTypes.map((taskType, index) => (
              <Badge key={index} variant="outline">
                Task {taskType}
              </Badge>
            ))}
          </div>
        </div>

        {/* Quick Stats Summary */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-sm text-muted-foreground">
            <strong>Summary:</strong>{' '}
            {isLegacy ? legacySummary : nonLegacySummary}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

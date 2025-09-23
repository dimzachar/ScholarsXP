'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ExternalLink,
  MessageSquare,
  Twitter,
  FileText,
  Star,
  Clock,
  AlertTriangle,
  CheckCircle,
  Save,
  Eye,
  Flag,
  Target
} from 'lucide-react'
import {
  getXpForTier as getXpForTierV2,
  resolveTaskFromPlatform as resolveTaskFromPlatformV2
} from '@/lib/xp-rules-v2'

interface Submission {
  id: string
  url: string
  platform: string
  taskTypes: string[]
  aiXp: number
  originalityScore?: number
  user: {
    username: string
  }
  createdAt: string
}

interface ReviewCriteria {
  originality: number
  quality: number
  relevance: number
  educational: number
}

interface PeerReviewCardProps {
  submission: Submission
  assignment?: {
    id: string
    deadline: string
    timeRemaining?: { hours: number; minutes: number }
    isOverdue?: boolean
  }
  readOnly?: boolean
  onReviewSubmit: (
    submissionId: string,
    reviewData: {
      xpScore: number
      comments: string
      criteria: ReviewCriteria
      timeSpent: number
      qualityRating: number
      category?: 'strategy' | 'guide' | 'technical'
      tier?: 'basic' | 'average' | 'awesome'
    }
  ) => void
  onSaveDraft?: (submissionId: string, draftData: any) => void
  onFlag?: (submissionId: string, reason: string, description: string) => void
}

export default function PeerReviewCard({
  submission,
  assignment,
  readOnly,
  onReviewSubmit,
  onSaveDraft,
  onFlag
}: PeerReviewCardProps) {
  const task = resolveTaskFromPlatformV2(submission.platform)
  const [category, setCategory] = useState<'strategy' | 'guide' | 'technical'>('strategy')
  const [tier, setTier] = useState<'basic' | 'average' | 'awesome'>('average')
  const computedXp = task ? getXpForTierV2(task, category, tier) : 0

  const [xpScore, setXpScore] = useState(computedXp)
  const [comments, setComments] = useState('')
  const [criteria, setCriteria] = useState<ReviewCriteria>({ originality: 4, quality: 4, relevance: 4, educational: 4 })
  const [qualityRating, setQualityRating] = useState(4)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDraft, setIsDraft] = useState(false)
  const [showFlagDialog, setShowFlagDialog] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [flagDescription, setFlagDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Time tracking
  const [startTime] = useState(Date.now())
  const [timeSpent, setTimeSpent] = useState(0)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000 / 60))
    }, 60000)
    return () => clearInterval(interval)
  }, [startTime])

  useEffect(() => {
    if (!onSaveDraft) return
    const auto = setInterval(() => {
      if (comments.trim()) handleSaveDraft()
    }, 120000)
    return () => clearInterval(auto)
  }, [comments, xpScore, criteria, onSaveDraft])

  useEffect(() => setXpScore(computedXp), [computedXp])
  useEffect(() => {
    if (comments.trim().length >= 20 && error) setError(null)
  }, [comments, error])

  const handleSubmit = async () => {
    if (readOnly) return
    if (!comments.trim() || comments.trim().length < 20) {
      setError('Please provide detailed comments (minimum 20 characters).')
      return
    }
    setIsSubmitting(true)
    try {
      await onReviewSubmit(submission.id, {
        xpScore,
        comments: comments.trim(),
        criteria,
        timeSpent: Math.max(timeSpent, 1),
        qualityRating,
        category,
        tier
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!onSaveDraft || readOnly) return
    setIsDraft(true)
    try {
      await onSaveDraft(submission.id, { xpScore, comments, criteria, qualityRating, timeSpent })
      setLastSaved(new Date())
    } finally {
      setIsDraft(false)
    }
  }

  const handleFlag = async () => {
    if (!onFlag || !flagReason.trim() || readOnly) return
    await onFlag(submission.id, flagReason, flagDescription.trim())
    setShowFlagDialog(false)
    setFlagReason('')
    setFlagDescription('')
  }

  const getPlatformIcon = () => {
    if (submission.platform === 'Twitter') return <Twitter className="h-4 w-4" aria-hidden="true" />
    if (submission.platform === 'Medium') return <FileText className="h-4 w-4" aria-hidden="true" />
    return <ExternalLink className="h-4 w-4" aria-hidden="true" />
  }

  const getDeadlineStatus = () => {
    if (!assignment) return null
    if (assignment.isOverdue) {
      return { color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20', icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, text: 'Overdue' }
    }
    if (assignment.timeRemaining) {
      const { hours, minutes } = assignment.timeRemaining
      const isUrgent = hours < 6
      return {
        color: isUrgent ? 'text-warning' : 'text-info',
        bg: isUrgent ? 'bg-warning/10 border-warning/20' : 'bg-info/10 border-info/20',
        icon: <Clock className="h-4 w-4" aria-hidden="true" />,
        text: `${hours}h ${minutes}m remaining`
      }
    }
    return null
  }

  const deadlineStatus = getDeadlineStatus()

  const CategorySelector = () => (
    <fieldset className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-labelledby="category-legend">
      <legend id="category-legend" className="sr-only">Category</legend>
      {(['strategy','guide','technical'] as const).map((c) => {
        const selected = category === c
        const variant = selected ? 'default' : 'outline'
        return (
          <Button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            size="sm"
            variant={variant as any}
            onClick={() => setCategory(c)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                const order = ['strategy','guide','technical'] as const
                const idx = order.indexOf(category)
                setCategory(order[(idx + 1) % order.length])
              }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                const order = ['strategy','guide','technical'] as const
                const idx = order.indexOf(category)
                setCategory(order[(idx - 1 + order.length) % order.length])
              }
            }}
          >
            {c.charAt(0).toUpperCase()+c.slice(1)}
          </Button>
        )
      })}
    </fieldset>
  )

  const TierSelector = () => (
    <fieldset className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-labelledby="tier-legend">
      <legend id="tier-legend" className="sr-only">Quality Tier</legend>
      {(['basic','average','awesome'] as const).map((t) => {
        const selected = tier === t
        const variant = selected ? 'default' : 'outline'
        return (
          <Button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            size="sm"
            variant={variant as any}
            onClick={() => setTier(t)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                const order = ['basic','average','awesome'] as const
                const idx = order.indexOf(tier)
                setTier(order[(idx + 1) % order.length])
              }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                const order = ['basic','average','awesome'] as const
                const idx = order.indexOf(tier)
                setTier(order[(idx - 1 + order.length) % order.length])
              }
            }}
          >
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </Button>
        )
      })}
    </fieldset>
  )

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="flex items-center gap-1">
              {getPlatformIcon()}
              {submission.platform}
            </Badge>
            {submission.taskTypes.map((type) => (
              <Badge key={type} variant="secondary">Task {type}</Badge>
            ))}
            {submission.originalityScore && (
              <Badge variant="outline" className="text-purple">
                {Math.round(submission.originalityScore * 100)}% Original
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {submission.user.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-xs text-right">
              <div className="font-medium leading-tight">{submission.user.username}</div>
              <div className="text-muted-foreground">{new Date(submission.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {/* Two-column layout: left steps, right content stack */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Steps */}
          <div className="lg:col-span-4">
            <nav aria-label="Review steps" className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold mb-4">Review Steps</div>
              <ol className="space-y-5">
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center" aria-hidden="true">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">Step 1: Evaluation</div>
                    <p className="text-xs text-muted-foreground">Select category and quality tier. XP is automatic.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-muted text-foreground/80 flex items-center justify-center" aria-hidden="true">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">Step 2: Comments</div>
                    <p className="text-xs text-muted-foreground">Provide constructive comments (min 20 characters).</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-success/10 text-success flex items-center justify-center" aria-hidden="true">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">Step 3: Submit</div>
                    <p className="text-xs text-muted-foreground">Finalize and submit your review.</p>
                  </div>
                </li>
              </ol>
            </nav>
          </div>

          {/* Right: Content stack (URL -> two cards -> actions) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Content URL bar (spans full right column) */}
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Content URL</div>
                  <div className="text-sm truncate">
                    <span className="text-primary">{submission.url}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Time spent: {timeSpent} min
                    {lastSaved && (
                      <span className="ml-2 flex items-center gap-1">
                        <Save className="h-3 w-3" aria-hidden="true" />
                        Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {deadlineStatus && (
                      <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded border ${deadlineStatus.bg}`}>
                        {deadlineStatus.icon}
                        <span className={`text-xs ${deadlineStatus.color}`}>{deadlineStatus.text}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={submission.url} target="_blank" rel="noopener noreferrer" aria-label="Open content in a new tab">
                      <Eye className="h-4 w-4 mr-2" aria-hidden="true" />
                      View Content
                    </a>
                  </Button>
                  {onFlag && (
                    <Button variant="outline" size="sm" onClick={() => setShowFlagDialog(true)} className="text-destructive hover:text-destructive/80">
                      <Flag className="h-4 w-4 mr-2" aria-hidden="true" />
                      Flag
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Two sub-columns under URL bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div className="text-sm font-semibold">Category</div>
                </div>
                <CategorySelector />
                <Separator className="my-4" />
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div className="text-sm font-semibold">Quality Tier</div>
                </div>
                <TierSelector />
                <div className="mt-3 text-sm text-muted-foreground">
                  Awarded XP: <span className="font-medium text-foreground">{xpScore}</span>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="text-sm font-semibold">Detailed Comments</div>
                <span className="text-destructive">*</span>
              </div>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Provide specific, constructive feedback about the content. Explain your ratings and suggest improvements..."
                className="min-h-[160px] resize-none"
                aria-required
                aria-invalid={comments.trim().length>0 && comments.trim().length<20}
                aria-describedby="comments-help comments-count"
                disabled={isSubmitting || !!readOnly}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span id="comments-count" aria-live="polite">{comments.length} characters (minimum 20)</span>
                <span id="comments-help">Be specific and constructive</span>
              </div>
              </div>
            </div>

            {/* Actions under the two sub-columns */}
            {!readOnly && (
              <div className="flex items-center justify-end gap-3">
                {error && (
                  <Alert variant="destructive" className="mr-auto">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {onSaveDraft && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSaveDraft}
                    disabled={isDraft}
                  >
                    {isDraft ? 'Saving…' : 'Save Draft'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setCategory('strategy')
                    setTier('average')
                    setComments('')
                    setCriteria({ originality: 4, quality: 4, relevance: 4, educational: 4 })
                    setQualityRating(4)
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" size="lg" onClick={handleSubmit} disabled={isSubmitting || !comments.trim() || comments.length < 20}>
                  {isSubmitting ? 'Submitting…' : 'Submit Review'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {showFlagDialog && (
          <Alert className="border-destructive/20 bg-destructive/10 mt-6">
            <Flag className="h-4 w-4 text-destructive" aria-hidden="true" />
            <AlertDescription className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Reason for flagging:</Label>
                <select
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="w-full mt-1 p-2 border rounded"
                >
                  <option value="">Select a reason...</option>
                  <option value="INAPPROPRIATE">Inappropriate content</option>
                  <option value="SPAM">Spam or low quality</option>
                  <option value="PLAGIARISM">Plagiarism</option>
                  <option value="OFF_TOPIC">Off-topic</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium">Additional details:</Label>
                <Textarea
                  value={flagDescription}
                  onChange={(e) => setFlagDescription(e.target.value)}
                  placeholder="Provide specific details about the issue..."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={handleFlag} disabled={!flagReason}>Flag Content</Button>
                <Button variant="outline" size="sm" onClick={() => setShowFlagDialog(false)}>Cancel</Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

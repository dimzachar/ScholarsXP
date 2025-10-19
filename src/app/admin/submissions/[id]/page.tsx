'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import { sanitizeUrl } from '@/lib/url-sanitizer'
import SubmissionDetailHeader from '@/components/Admin/SubmissionDetailHeader'
import XpBreakdownSection from '@/components/Admin/XpBreakdownSection'
import PeerReviewsSection from '@/components/Admin/PeerReviewsSection'
import XpTransactionHistory from '@/components/Admin/XpTransactionHistory'

interface SubmissionDetail {
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
  peerReviews: Array<{
    id: string
    reviewerId: string
    xpScore: number
    comments: string | null
    timeSpent: number | null
    qualityRating: number | null
    isLate: boolean
    createdAt: string
    reviewer: {
      username: string
      email: string
    }
  }>
  reviewAssignments: Array<{
    id: string
    reviewerId: string
    assignedAt: string
    deadline: string
    status: string
    completedAt: string | null
    releasedAt: string | null
    releaseReason: string | null
    reviewer: {
      username: string
      email: string
    }
  }>
}

interface AssignmentAgeInfo {
  label: string
  hours: number | null
}

function describeAssignmentAge(assignedAt: string): AssignmentAgeInfo {
  const assignedDate = new Date(assignedAt)

  if (Number.isNaN(assignedDate.getTime())) {
    return { label: 'Unknown', hours: null }
  }

  const diffMs = Date.now() - assignedDate.getTime()
  const safeDiff = diffMs < 0 ? 0 : diffMs
  const hours = Math.floor(safeDiff / (1000 * 60 * 60))

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    const dayLabel = `${days}d`
    const label = remainingHours > 0 ? `${dayLabel} ${remainingHours}h` : dayLabel
    return { label, hours }
  }

  return { label: `${hours}h`, hours }
}

function assignmentIsStale(assignment: {
  assignedAt: string
  status: string
  releasedAt: string | null
}): boolean {
  if (assignment.releasedAt) {
    return false
  }

  if (assignment.status !== 'PENDING') {
    return false
  }

  const age = describeAssignmentAge(assignment.assignedAt)
  return typeof age.hours === 'number' && age.hours >= 50
}

export default function AdminSubmissionDetailPage() {
  const { user: _user, userProfile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const submissionId = params.id as string

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loadingSubmission, setLoadingSubmission] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [reshufflingId, setReshufflingId] = useState<string | null>(null)
  const [assignmentNotice, setAssignmentNotice] = useState<string | null>(null)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  const fetchSubmissionDetails = useCallback(async () => {
    try {
      setLoadingSubmission(true)
      setError(null)
      setAssignmentNotice(null)
      setAssignmentError(null)

      const response = await fetch(`/api/admin/submissions/${submissionId}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch submission: ${response.status}`)
      }

      const data = await response.json()
      setSubmission(data.submission)
    } catch (error) {
      console.error('Error fetching submission details:', error)
      setError(error instanceof Error ? error.message : 'Failed to load submission details')
    } finally {
      setLoadingSubmission(false)
    }
  }, [submissionId])

  useEffect(() => {
    if (!loading && userProfile?.role !== 'ADMIN') {
      router.push('/dashboard')
      return
    }

    if (submissionId) {
      fetchSubmissionDetails()
    }
  }, [submissionId, userProfile?.role, loading, router, fetchSubmissionDetails])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINALIZED':
      case 'COMPLETED':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'UNDER_PEER_REVIEW':
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'AI_REVIEWED':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'PENDING':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'REASSIGNED':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'MISSED':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'FLAGGED':
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const handleAutoAssign = useCallback(async () => {
    if (!submissionId || assigning) return
    try {
      setAssigning(true)
      setError(null)
      const response = await fetch('/api/admin/assignments/auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ submissionId })
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = data?.message || `Failed to assign reviewers: ${response.status}`
        setError(message)
        return
      }

      await fetchSubmissionDetails()
    } catch (autoError) {
      console.error('Error auto-assigning reviewers:', autoError)
      setError('Unable to assign reviewers automatically. Please try again.')
    } finally {
      setAssigning(false)
    }
  }, [submissionId, assigning, fetchSubmissionDetails])

  const handleReshuffle = useCallback(async (assignmentId: string) => {
    if (!assignmentId) {
      return
    }

    try {
      setReshufflingId(assignmentId)
      setAssignmentNotice(null)
      setAssignmentError(null)

      const response = await fetch(`/api/admin/reviews/${assignmentId}/reshuffle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      let data: any = {}

      try {
        data = await response.json()
      } catch {
        data = {}
      }

      if (!response.ok) {
        if (response.status === 409 && data?.needsManualFollowUp) {
          await fetchSubmissionDetails()
          setAssignmentNotice('No replacement reviewer available. Assignment marked for manual follow-up.')
        } else if (response.status === 409 && data?.alreadyProcessed) {
          await fetchSubmissionDetails()
          setAssignmentNotice('Assignment already processed. Latest details have been refreshed.')
        } else if (response.status === 404) {
          setAssignmentError('Assignment not found. It may have already been processed.')
        } else {
          setAssignmentError(data?.message || 'Failed to reshuffle reviewer. Please try again.')
        }
        return
      }

      await fetchSubmissionDetails()

      setAssignmentNotice(
        data?.dryRun
          ? 'Reshuffle dry-run completed successfully.'
          : 'Reviewer reshuffled successfully.'
      )
    } catch (reshuffleError) {
      console.error('Error reshuffling reviewer assignment:', reshuffleError)
      setAssignmentError('Unable to reshuffle reviewer. Please try again.')
    } finally {
      setReshufflingId(null)
    }
  }, [fetchSubmissionDetails])

  if (loading || loadingSubmission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !submission) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
        <div className="container mx-auto px-4 py-8">
          <Alert className="max-w-2xl mx-auto">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Submission not found'}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const staleAssignments = submission.reviewAssignments.filter(assignmentIsStale)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Submission Details</h1>
              <p className="text-muted-foreground">
                Comprehensive XP management and review oversight
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchSubmissionDetails}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {/* deepcode ignore DOMXSS: submission.url validated at entry via security.validateURL() - only Twitter/X, Reddit, Medium, Notion, LinkedIn allowed. Additional defense-in-depth via sanitizeUrl. */}
            <Link href={sanitizeUrl(submission.url)} target="_blank">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Original
              </Button>
            </Link>
          </div>
        </div>

        {/* Submission Overview */}
        <SubmissionDetailHeader submission={submission} />

        {/* Detailed Tabs */}
        <Tabs defaultValue="xp-breakdown" className="space-y-6">
          <TabsList className={`grid w-full ${submission.platform === 'LEGACY' ? 'grid-cols-3' : 'grid-cols-4'}`}>
            <TabsTrigger value="xp-breakdown">XP Breakdown</TabsTrigger>
            <TabsTrigger value="peer-reviews">Peer Reviews</TabsTrigger>
            {submission.platform !== 'LEGACY' && (
              <TabsTrigger value="transactions">XP History</TabsTrigger>
            )}
            <TabsTrigger value="assignments">Review Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="xp-breakdown">
            <XpBreakdownSection
              submission={submission}
              onUpdate={fetchSubmissionDetails}
            />
          </TabsContent>

          <TabsContent value="peer-reviews">
            <PeerReviewsSection
              submissionId={submission.id}
              peerReviews={submission.peerReviews}
              onUpdate={fetchSubmissionDetails}
            />
          </TabsContent>

          {submission.platform !== 'LEGACY' && (
            <TabsContent value="transactions">
              <XpTransactionHistory submissionId={submission.id} />
            </TabsContent>
          )}

          <TabsContent value="assignments">
            <Card>
              <CardHeader>
                <CardTitle>Review Assignments</CardTitle>
                <CardDescription>
                  Reviewer assignment management and status tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assignmentNotice && (
                  <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900">
                    <AlertDescription>{assignmentNotice}</AlertDescription>
                  </Alert>
                )}

                {assignmentError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{assignmentError}</AlertDescription>
                  </Alert>
                )}

                {staleAssignments.length > 0 && (
                  <Alert className="mb-4 border-red-200 bg-red-50 text-red-900">
                    <AlertDescription>
                      {staleAssignments.length === 1
                        ? '1 pending reviewer is stale (50h+ without progress).'
                        : `${staleAssignments.length} pending reviewers are stale (50h+ without progress).`}
                    </AlertDescription>
                  </Alert>
                )}

                {submission.reviewAssignments.length > 0 ? (
                  <div className="space-y-4">
                    {submission.reviewAssignments.length < 3 && (
                      <div className="flex justify-end">
                        <Button size="sm" onClick={handleAutoAssign} disabled={assigning}>
                          {assigning ? 'Assigning.' : 'Re-assign reviewers'}
                        </Button>
                      </div>
                    )}
                    {submission.reviewAssignments.map(assignment => {
                      const ageInfo = describeAssignmentAge(assignment.assignedAt)
                      const stale = assignmentIsStale(assignment)
                      const showReshuffle = assignment.status === 'PENDING' && !assignment.releasedAt

                      return (
                        <div key={assignment.id} className="rounded-lg border p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              <div className="font-medium">{assignment.reviewer.username}</div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <div>Assigned: {formatDate(assignment.assignedAt)}</div>
                                <div>Deadline: {formatDate(assignment.deadline)}</div>
                                {assignment.releasedAt && (
                                  <div>Released: {formatDate(assignment.releasedAt)}</div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {!assignment.releasedAt && ageInfo.hours !== null && (
                                  <Badge
                                    className={`border ${stale ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}
                                  >
                                    {stale ? `Stale • ${ageInfo.label}` : `Age • ${ageInfo.label}`}
                                  </Badge>
                                )}
                                {assignment.releaseReason && (
                                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                    Release reason: {assignment.releaseReason}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 md:flex-row md:items-center">
                              <Badge className={getStatusColor(assignment.status)}>
                                {assignment.status.replace(/_/g, ' ')}
                              </Badge>
                              {showReshuffle && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleReshuffle(assignment.id)}
                                  disabled={reshufflingId === assignment.id}
                                >
                                  {reshufflingId === assignment.id ? 'Reshuffling…' : 'Reshuffle'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAutoAssign} disabled={assigning}>
                        {assigning ? 'Assigning.' : 'Assign reviewers'}
                      </Button>
                    </div>
                    <div className="text-center py-8 text-muted-foreground">
                      No review assignments found
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

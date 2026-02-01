'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { isAdmin } from '@/lib/roles'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Shuffle
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
    reviewer: {
      username: string
      email: string
    }
  }>
}



export default function AdminSubmissionDetailPage() {
  const { user, isLoading: loading } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()
  const router = useRouter()
  const params = useParams()
  const submissionId = params.id as string

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loadingSubmission, setLoadingSubmission] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [reshuffling, setReshuffling] = useState(false)
  const [reshuffleNotice, setReshuffleNotice] = useState<string | null>(null)
  const [reshuffleError, setReshuffleError] = useState<string | null>(null)
  const [debuggingConsensus, setDebuggingConsensus] = useState(false)
  const [consensusDebugResult, setConsensusDebugResult] = useState<any>(null)
  const [consensusDebugError, setConsensusDebugError] = useState<string | null>(null)

  const fetchSubmissionDetails = useCallback(async () => {
    try {
      setLoadingSubmission(true)
      setError(null)

      const response = await authenticatedFetch(`/api/admin/submissions/${submissionId}`)
      
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
  }, [submissionId, authenticatedFetch])

  useEffect(() => {
    // Only redirect if we're not loading and the user is not an admin
    if (!loading && user && !isAdmin(user.role)) {
      router.push('/dashboard')
      return
    }

    // Only fetch submission if we have an ID and user is loading or is admin
    if (submissionId && (loading || (user && isAdmin(user.role)))) {
      fetchSubmissionDetails()
    }
  }, [submissionId, user?.role, loading, router, fetchSubmissionDetails])



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

  const handleAutoAssign = useCallback(async () => {
    if (!submissionId || assigning) return
    try {
      setAssigning(true)
      setError(null)
      const response = await authenticatedFetch('/api/admin/assignments/auto', {
        method: 'POST',
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

  const handleManualReshuffle = useCallback(async (assignmentId?: string) => {
    if (!submissionId || reshuffling) return
    
    try {
      setReshuffling(true)
      setReshuffleNotice(null)
      setReshuffleError(null)

      const body: any = { reason: 'manual:admin' }
      if (assignmentId) {
        body.assignmentIds = [assignmentId]
      }

      const response = await authenticatedFetch(`/api/admin/submissions/${submissionId}/manual-reshuffle`, {
        method: 'POST',
        body: JSON.stringify(body)
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setReshuffleError(data?.message || 'Failed to reshuffle. Please try again.')
        return
      }

      await fetchSubmissionDetails()

      if (data.reshuffledCount > 0) {
        if (assignmentId) {
          setReshuffleNotice(
            `Successfully reshuffled reviewer! New reviewer assigned.`
          )
        } else {
          setReshuffleNotice(
            `Bulk reshuffle completed! Reshuffled ${data.reshuffledCount} out of ${data.totalProcessed} assignments.`
          )
        }
      } else {
        setReshuffleNotice(data?.message || 'No assignments were reshuffled.')
      }
    } catch (reshuffleError) {
      console.error('Error performing reshuffle:', reshuffleError)
      setReshuffleError('Unable to perform reshuffle. Please try again.')
    } finally {
      setReshuffling(false)
    }
  }, [submissionId, reshuffling, fetchSubmissionDetails, authenticatedFetch])

  const handleConsensusDebug = useCallback(async () => {
    if (!submissionId || debuggingConsensus) return
    
    try {
      setDebuggingConsensus(true)
      setConsensusDebugResult(null)
      setConsensusDebugError(null)

      const response = await authenticatedFetch(`/api/admin/submissions/${submissionId}/consensus-debug`, {
        method: 'POST',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setConsensusDebugError(data?.error?.error || 'Failed to debug consensus. Please try again.')
        return
      }

      setConsensusDebugResult(data)
      
      // If consensus was successfully calculated, refresh the submission to see the updated status
      if (data.data?.consensus?.calculated) {
        await fetchSubmissionDetails()
      }
    } catch (debugError) {
      console.error('Error debugging consensus:', debugError)
      setConsensusDebugError('Unable to debug consensus. Please try again.')
    } finally {
      setDebuggingConsensus(false)
    }
  }, [submissionId, debuggingConsensus, fetchSubmissionDetails, authenticatedFetch])

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
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={handleConsensusDebug}
                  disabled={debuggingConsensus}
                >
                  {debuggingConsensus ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Debugging...
                    </>
                  ) : (
                    <>
                      🔍 Debug Consensus
                    </>
                  )}
                </Button>
              </div>

              {consensusDebugResult && (
                <Alert className="border-blue-200 bg-blue-50 text-blue-900">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="font-medium">Consensus Debug Result:</div>
                      <div className="text-sm">
                        <strong>Message:</strong> {consensusDebugResult.message}
                      </div>
                      {consensusDebugResult.data?.consensus?.calculated && (
                        <div className="text-sm">
                          <strong>Final XP:</strong> {consensusDebugResult.data.consensus.finalXp} • 
                          <strong>Confidence:</strong> {consensusDebugResult.data.consensus.confidence}
                        </div>
                      )}
                      {!consensusDebugResult.data?.consensus?.calculated && (
                        <div className="text-sm">
                          <strong>Reason:</strong> {consensusDebugResult.data.consensus.reason}
                        </div>
                      )}
                      <div className="text-sm">
                        <strong>Should Attempt Consensus:</strong> {consensusDebugResult.data.debugInfo.consensusAnalysis.shouldAttemptConsensus ? 'Yes' : 'No'}
                      </div>
                      <div className="text-sm">
                        <strong>Active Assignments:</strong> {consensusDebugResult.data.debugInfo.assignments.active}
                      </div>
                      <div className="text-sm">
                        <strong>Peer Reviews:</strong> {consensusDebugResult.data.debugInfo.reviews.count}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {consensusDebugError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{consensusDebugError}</AlertDescription>
                </Alert>
              )}

              <PeerReviewsSection
                submissionId={submission.id}
                peerReviews={submission.peerReviews}
                onUpdate={fetchSubmissionDetails}
              />
            </div>
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
                {reshuffleNotice && (
                  <Alert className="mb-4 border-green-200 bg-green-50 text-green-900">
                    <AlertDescription>{reshuffleNotice}</AlertDescription>
                  </Alert>
                )}

                {reshuffleError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{reshuffleError}</AlertDescription>
                  </Alert>
                )}

                {submission.reviewAssignments.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-end gap-2">
                      {submission.reviewAssignments.filter(a => a.status !== 'REASSIGNED').length < 3 && (
                        <Button size="sm" onClick={handleAutoAssign} disabled={assigning}>
                          {assigning ? 'Assigning…' : 'Re-assign reviewers'}
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleManualReshuffle()}
                        disabled={reshuffling || submission.reviewAssignments.filter(a => a.status === 'PENDING' || a.status === 'MISSED').length === 0}
                      >
                        {reshuffling ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Reshuffling...
                          </>
                        ) : (
                          <>
                            <Shuffle className="h-4 w-4 mr-2" />
                            Bulk Reshuffle
                          </>
                        )}
                      </Button>
                    </div>
                    {submission.reviewAssignments.map((assignment) => (
                      <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">{assignment.reviewer.username}</div>
                          <div className="text-sm text-muted-foreground">
                            Assigned: {formatDate(assignment.assignedAt)} • 
                            Deadline: {formatDate(assignment.deadline)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(assignment.status)}>
                            {assignment.status.replace('_', ' ')}
                          </Badge>
                          {(assignment.status === 'PENDING' || assignment.status === 'MISSED') && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleManualReshuffle(assignment.id)}
                              disabled={reshuffling}
                            >
                              Reshuffle
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleAutoAssign} disabled={assigning}>
                        {assigning ? 'Assigning…' : 'Assign reviewers'}
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

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowLeft, 
  ExternalLink, 
  Calendar, 
  User, 
  Award,
  AlertTriangle,
  RefreshCw,
  Edit
} from 'lucide-react'
import Link from 'next/link'
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
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const submissionId = params.id as string

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loadingSubmission, setLoadingSubmission] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && userProfile?.role !== 'ADMIN') {
      router.push('/dashboard')
      return
    }

    if (submissionId) {
      fetchSubmissionDetails()
    }
  }, [submissionId, userProfile?.role, loading])

  const fetchSubmissionDetails = async () => {
    try {
      setLoadingSubmission(true)
      setError(null)

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
  }



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
            <Link href={submission.url} target="_blank">
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
                {submission.reviewAssignments.length > 0 ? (
                  <div className="space-y-4">
                    {submission.reviewAssignments.map((assignment) => (
                      <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">{assignment.reviewer.username}</div>
                          <div className="text-sm text-muted-foreground">
                            Assigned: {formatDate(assignment.assignedAt)} • 
                            Deadline: {formatDate(assignment.deadline)}
                          </div>
                        </div>
                        <Badge className={getStatusColor(assignment.status)}>
                          {assignment.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No review assignments found
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

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SubmissionReviewRow from '@/components/SubmissionReviewRow'
import AuthGuard from '@/components/Auth/AuthGuard'
import { ReviewerGuard } from '@/components/Auth/RoleGuard'
import { api, handleApiError } from '@/lib/api-client'
import { useAuth } from '@/contexts/AuthContext'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ResponsiveStatCard, createStatCardData } from '@/components/ui/responsive-stat-card'
import { 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Star,
  TrendingUp,
  
} from 'lucide-react'

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

interface PendingReview {
  submission: Submission
  assignment: {
    id: string
    deadline: string
    timeRemaining?: { hours: number; minutes: number }
    isOverdue?: boolean
  }
}

interface AssignmentResponse {
  assignments: Array<{
    id: string
    deadline: string
    timeRemaining?: { hours: number; minutes: number }
    isOverdue?: boolean
    submission?: Submission
  }>
}

interface ReviewSubmissionPayload {
  xpScore: number
  comments: string
  criteria: {
    originality: number
    quality: number
    relevance: number
    educational: number
  }
  timeSpent: number
  qualityRating: number
  category?: 'strategy' | 'guide' | 'technical'
  tier?: 'basic' | 'average' | 'awesome'
  isRejected?: boolean
}

export default function ReviewPage() {
  const { userProfile } = useAuth()
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [adminPendingSubmissions, setAdminPendingSubmissions] = useState<Submission[]>([])
  const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine')
  const [adminSearch, setAdminSearch] = useState('')
  const [adminPlatformFilter, setAdminPlatformFilter] = useState<string>('all')
  const [expandedMineId, setExpandedMineId] = useState<string | null>(null)
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null)

  useEffect(() => {
    fetchPendingReviews()
  }, [])

  // Admin: fetch all pending submissions (read-only list)
  useEffect(() => {
    const fetchAdminPending = async () => {
      if (userProfile?.role !== 'ADMIN') return
      try {
        const res = await fetch('/api/peer-reviews/pending')
        if (!res.ok) return
        const json = await res.json()
        interface ApiSubmission {
          id: string
          url: string
          platform: string
          taskTypes?: string[]
          aiXp?: number
          originalityScore?: number | null
          user?: { username?: string }
          createdAt: string
        }
        const list = (json.data?.submissions || json.submissions || []) as ApiSubmission[]
        const mapped: Submission[] = list.map((s: ApiSubmission) => ({
          id: s.id,
          url: s.url,
          platform: s.platform,
          taskTypes: s.taskTypes || [],
          aiXp: s.aiXp || 0,
          originalityScore: s.originalityScore ?? undefined,
          user: { username: s.user?.username || 'Unknown' },
          createdAt: s.createdAt
        }))
        setAdminPendingSubmissions(mapped)
      } catch (e) {
        console.error('Failed to load admin pending submissions', e)
      }
    }

    fetchAdminPending()
  }, [userProfile?.role])

  const filteredAdminSubmissions = adminPendingSubmissions.filter((s) => {
    const matchesSearch = adminSearch
      ? [s.url, s.platform, s.user?.username].filter(Boolean).join(' ').toLowerCase().includes(adminSearch.toLowerCase())
      : true
    const matchesPlatform = adminPlatformFilter === 'all' || s.platform?.toLowerCase() === adminPlatformFilter.toLowerCase()
    return matchesSearch && matchesPlatform
  })

  const fetchPendingReviews = async () => {
    try {
      const data = await api.get<AssignmentResponse>('/api/assignments/my?status=pending')
      const assignments = data.assignments || []

      const mappedReviews: PendingReview[] = assignments
        .filter((assignment) => assignment.submission)
        .map((assignment) => {
          const submission = assignment.submission as Submission

          return {
            submission,
            assignment: {
              id: assignment.id,
              deadline: assignment.deadline,
              timeRemaining: assignment.timeRemaining,
              isOverdue: assignment.isOverdue
            }
          }
        })

      setPendingReviews(mappedReviews)
    } catch (error) {
      console.error('Error fetching pending reviews:', error)
      setMessage(handleApiError(error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleReviewSubmit = async (
    submissionId: string,
    reviewData: ReviewSubmissionPayload
  ) => {
    try {
      await api.post('/api/peer-reviews', {
        submissionId,
        ...reviewData
      })

      setMessage('Review submitted successfully! +5 XP earned')
      // Remove the reviewed submission from the list
      setPendingReviews(prev => prev.filter(item => item.submission.id !== submissionId))
    } catch (error) {
      console.error('Error submitting review:', error)
      setMessage(handleApiError(error).message)
    }
  }

  if (loading) {
    return (
      <AuthGuard>
        <ReviewerGuard>
          <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>Loading Reviews</span>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-4">Peer Review Dashboard</h1>
                <p className="text-muted-foreground">Loading pending reviews...</p>
              </div>
            </div>
          </div>
        </ReviewerGuard>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <ReviewerGuard>
        <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 pb-24 md:pb-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>Peer Review</span>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Peer Review Dashboard
          </h1>
          
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Review your assigned items and monitor the platform queue (admin read-only)
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
          <ResponsiveStatCard
            data={createStatCardData('Pending Reviews', pendingReviews.length, { 
              color: 'primary',
              icon: Clock,
              subtitle: 'Items assigned to you'
            })}
            showProgress={false}
            showTrend={false}
          />
          <ResponsiveStatCard
            data={createStatCardData('XP per Review', 5, { 
              color: 'secondary',
              icon: Star,
              subtitle: 'Earned when you submit'
            })}
            showProgress={false}
            showTrend={false}
          />
          <ResponsiveStatCard
            data={createStatCardData('Deadline Window', 72, { 
              color: 'destructive',
              icon: AlertCircle,
              subtitle: 'Hours to complete reviews'
            })}
            showProgress={false}
            showTrend={false}
          />
        </div>

        {message && (
          <Alert
            className="mb-6"
            variant={message.includes('successfully') ? 'default' : 'destructive'}
            role="status"
            aria-live="polite"
          >
            {message.includes('successfully') ? (
              <CheckCircle className="h-5 w-5" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            )}
            <AlertDescription className="font-medium">{message}</AlertDescription>
          </Alert>
        )}

        {/* Tabs: My assignments vs Admin queue */}
        <Tabs defaultValue="mine" value={activeTab} onValueChange={(v) => setActiveTab(v as 'mine' | 'all')} className="mt-2">
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-2">
            <TabsTrigger value="mine">
              My Assignments
              <Badge variant="secondary" className="ml-2">{pendingReviews.length}</Badge>
            </TabsTrigger>
            {userProfile?.role === 'ADMIN' && (
              <TabsTrigger value="all">
                All Pending (Admin)
                <Badge variant="secondary" className="ml-2">{adminPendingSubmissions.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Mine */}
          <TabsContent value="mine" className="space-y-6 mt-4">
            {pendingReviews.length === 0 ? (
              <div className="text-center py-12 md:py-16">
                <Card className="border-0 shadow-xl max-w-md mx-auto">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">No Pending Reviews</h2>
                    <p className="text-muted-foreground mb-6">
                      You’re all caught up. New assignments will appear here.
                    </p>
                    {userProfile?.role === 'ADMIN' && (
                      <div className="text-xs text-muted-foreground">Switch to “All Pending (Admin)” to audit the queue.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
                      Review Guidelines (V2)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5" aria-hidden="true" />
                        <div>
                          <p className="font-medium">Choose Category + Tier</p>
                          <p className="text-muted-foreground">Select strategy/guide/technical and Basic/Average/Awesome. XP is computed.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-primary mt-0.5" aria-hidden="true" />
                        <div>
                          <p className="font-medium">Platform Fit</p>
                          <p className="text-muted-foreground">A = Twitter thread/article; B = Medium/Reddit 2000+ words.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-success mt-0.5" aria-hidden="true" />
                        <div>
                          <p className="font-medium">Qualitative Criteria</p>
                          <p className="text-muted-foreground">Use sliders/comments for feedback; they do not change XP.</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {pendingReviews.map(({ submission, assignment }) => (
                  <SubmissionReviewRow
                    key={submission.id}
                    submission={submission}
                    assignment={assignment}
                    open={expandedMineId === submission.id}
                    onOpenChange={(open) => setExpandedMineId(open ? submission.id : null)}
                    onReviewSubmit={handleReviewSubmit}
                  />
                ))}
              </>
            )}
          </TabsContent>

          {/* All (Admin) */}
          {userProfile?.role === 'ADMIN' && (
            <TabsContent value="all" className="space-y-6 mt-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Input
                        placeholder="Search by URL, platform, or author"
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                        aria-label="Search pending submissions"
                      />
                    </div>
                    <div className="flex items-center gap-2 md:justify-end overflow-x-auto md:overflow-visible -mx-1 px-1">
                      {['all','Twitter','Medium'].map((p) => (
                        <Button
                          key={p}
                          onClick={() => setAdminPlatformFilter(p)}
                          variant={adminPlatformFilter===p ? 'default' : 'outline'}
                          size="sm"
                          aria-pressed={adminPlatformFilter===p}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {filteredAdminSubmissions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No matching submissions.</div>
              ) : (
                filteredAdminSubmissions.map((submission) => (
                  <SubmissionReviewRow
                    key={`admin-${submission.id}`}
                    submission={submission}
                    open={expandedAdminId === submission.id}
                    onOpenChange={(open) => setExpandedAdminId(open ? submission.id : null)}
                    readOnly
                    onReviewSubmit={() => { /* no-op */ }}
                  />
                ))
              )}
            </TabsContent>
          )}
        </Tabs>
        </div>
        </div>
      </ReviewerGuard>
    </AuthGuard>
  )
}

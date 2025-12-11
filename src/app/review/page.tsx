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
  Twitter,
  FileText,
  ExternalLink,
  MessageSquareText,
  Award,
  Medal,
  ChevronUp
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
  assignedReviewers?: Array<{
    id: string
    username?: string | null
    email?: string | null
  }>
}

interface PendingReview {
  submission: Submission
  assignment: {
    id: string
    deadline: string
    status?: 'PENDING' | 'IN_PROGRESS' | 'MISSED' | 'COMPLETED'
    timeRemaining?: { hours: number; minutes: number }
    isOverdue?: boolean
    weekendExtension?: boolean
  }
}

interface AssignmentResponse {
  assignments: Array<{
    id: string
    deadline: string
    status?: 'PENDING' | 'IN_PROGRESS' | 'MISSED' | 'COMPLETED'
    timeRemaining?: { hours: number; minutes: number }
    isOverdue?: boolean
    weekendExtension?: boolean
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

// Types for My Reviews section
interface UserReview {
  id: string
  xpScore: number | null
  comments?: string | null
  timeSpent?: number | null
  qualityRating?: number | null
  isLate?: boolean | null
  createdAt: string
  daysAgo?: number
  reviewType: 'given' | 'received'
  submission?: {
    id: string
    url: string
    platform: string
    taskTypes?: string[]
    status?: string
    user?: { username?: string | null }
  }
  submissionAuthor?: string | null
  submissionPlatform?: string | null
  submissionTaskTypes?: string[] | null
  reviewerName?: string | null
  reviewRewardXp?: number | null
  reviewRewardXpBase?: number | null
  reviewRewardXpBonus?: number | null
}

interface UserReviewStats {
  total: number
  averageScore: number
  averageQuality: number
  lateReviews: number
  averageTimeSpent: number
  totalXpFromReviews: number
}

interface UserReviewsResponse {
  reviews: UserReview[]
  stats: UserReviewStats
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
    totalPages: number
    currentPage: number
  }
  filters: {
    type: 'given' | 'received'
    sortBy: string
    sortOrder: 'asc' | 'desc'
  }
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
  // Admin tab: show more/less
  const [showAllAdmin, setShowAllAdmin] = useState<boolean>(false)
  // My Reviews state
  const [myReviews, setMyReviews] = useState<UserReview[]>([])
  const [myReviewsStats, setMyReviewsStats] = useState<UserReviewStats | null>(null)
  const [myReviewsLoading, setMyReviewsLoading] = useState<boolean>(true)
  const [myReviewsError, setMyReviewsError] = useState<string>('')
  // Show More/Less like changelog
  const [showAllMyReviews, setShowAllMyReviews] = useState<boolean>(false)
  const hasMoreMyReviews = myReviews.length > 5
  const displayedMyReviews = showAllMyReviews ? myReviews : myReviews.slice(0, 5)
  // Back to top like changelog
  const [mounted, setMounted] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    fetchPendingReviews()
  }, [])

  // Fetch user's own reviews (given)
  useEffect(() => {
    const fetchMyReviews = async () => {
      try {
        setMyReviewsLoading(true)
        const res = await fetch(`/api/user/reviews?type=given&limit=10&offset=0`, { cache: 'no-store' })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || 'Failed to fetch user reviews')
        }
        const json: UserReviewsResponse = await res.json()
        setMyReviews(json.reviews || [])
        setMyReviewsStats(json.stats)
      } catch (e) {
        const err = e as Error
        setMyReviewsError(err.message || 'Unable to load your reviews')
      } finally {
        setMyReviewsLoading(false)
      }
    }
    fetchMyReviews()
  }, [])

  // Back to Top behavior (copied style from changelog)
  useEffect(() => {
    setMounted(true)
    const handleScroll = () => setShowBackToTop(window.scrollY > 200)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
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
          reviewAssignments?: Array<{
            id: string
            status?: string
            reviewer?: {
              id: string
              username?: string | null
              email?: string | null
            }
          }>
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
          createdAt: s.createdAt,
          assignedReviewers: (s.reviewAssignments || [])
            .map((assignment) => assignment.reviewer)
            .filter((reviewer): reviewer is NonNullable<typeof reviewer> => Boolean(reviewer))
            .map((reviewer) => ({
              id: reviewer.id,
              username: reviewer.username || reviewer.email || 'Unknown',
              email: reviewer.email || null
            }))
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
      ? [
          s.url,
          s.platform,
          s.user?.username,
          ...(s.assignedReviewers || []).map((reviewer) => reviewer?.username || reviewer?.email)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(adminSearch.toLowerCase())
      : true
    const matchesPlatform = adminPlatformFilter === 'all' || s.platform?.toLowerCase() === adminPlatformFilter.toLowerCase()
    return matchesSearch && matchesPlatform
  })
  // Sort by latest and apply show more/less for Admin tab
  const adminSortedSubmissions = [...filteredAdminSubmissions].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime()
    const bTime = new Date(b.createdAt).getTime()
    return bTime - aTime
  })
  const hasMoreAdmin = adminSortedSubmissions.length > 5
  const displayedAdminSubmissions = showAllAdmin ? adminSortedSubmissions : adminSortedSubmissions.slice(0, 5)

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
              status: assignment.status,
              timeRemaining: assignment.timeRemaining,
              isOverdue: assignment.isOverdue,
              weekendExtension: assignment.weekendExtension
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

      setMessage('Review submitted successfully! +50 XP earned')
      // Remove the reviewed submission from the list
      setPendingReviews(prev => prev.filter(item => item.submission.id !== submissionId))
    } catch (error) {
      console.error('Error submitting review:', error)
      setMessage(handleApiError(error).message)
    }
  }

  // Utils for My Reviews UI
  const ensureProtocol = (value: string) =>
    value?.startsWith('http://') || value?.startsWith('https://') ? value : `https://${value}`

  const formatUrlHost = (rawUrl?: string) => {
    if (!rawUrl) return ''
    try {
      const parsed = new URL(ensureProtocol(rawUrl))
      const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : ''
      const suffix = parsed.search || parsed.hash ? '' : ''
      const combined = `${parsed.hostname}${path}${suffix}`
      return combined.length > 64 ? combined.slice(0, 63) + '…' : combined
    } catch {
      return rawUrl.length > 64 ? rawUrl.slice(0, 63) + '…' : rawUrl
    }
  }

  if (loading) {
    return (
      <AuthGuard>
        <ReviewerGuard>
          <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
            <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>Loading Reviews</span>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-4">Review Space</h1>
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
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8 pb-24 md:pb-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Reviews
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            Work through your assignments.
          </p>
        </div>

        {/* How to Review panel (placed above stats) */}
        <Card
          className="border-0 shadow-lg mb-6"
          role="region"
          aria-labelledby="how-to-review-heading"
        >
          <CardHeader>
            <CardTitle id="how-to-review-heading" className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
              How to Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* Task A */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                  <Twitter className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">Task A — Twitter</p>
                  <p className="text-muted-foreground">
                    Review Twitter threads only. Look for a cohesive thread with 5+ tweets.
                  </p>
                </div>
              </div>

              {/* Task B */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-secondary/10 p-2 text-secondary-foreground">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">Task B — Reddit / Notion / Medium</p>
                  <p className="text-muted-foreground">
                    Eligible posts must be 2000+ characters. Platforms allowed: Reddit, Notion, or Medium.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
            data={createStatCardData('XP per Review', 50, { 
              color: 'secondary',
              icon: Star,
              subtitle: 'Earned when you submit'
            })}
            showProgress={false}
            showTrend={false}
          />
          <ResponsiveStatCard
            data={createStatCardData('Deadline Window', 48, { 
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
                          <p className="text-muted-foreground">Task A: Twitter threads only (5+ tweets). Task B: Reddit/Notion/Medium (2000+ characters).</p>
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

              {displayedAdminSubmissions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No matching submissions.</div>
              ) : (
                displayedAdminSubmissions.map((submission) => (
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

              {hasMoreAdmin && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowAllAdmin(!showAllAdmin)}
                    className="transition-all duration-300 ease-in-out hover:scale-105"
                  >
                    {showAllAdmin ? 'Show Less' : 'Show More'}
                  </Button>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
        {/* My Reviews */}
        <div className="mt-10">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>My Reviews</span>
                {myReviewsStats && (
                  <span className="text-sm font-normal text-muted-foreground">{myReviewsStats.total} total</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Minimal stat strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg Score</div>
                  <div className="text-lg font-medium text-foreground">{myReviewsStats?.averageScore ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Late</div>
                  <div className="text-lg font-medium text-foreground">{myReviewsStats?.lateReviews ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg Time</div>
                  <div className="text-lg font-medium text-foreground">{myReviewsStats?.averageTimeSpent ?? 0}m</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">XP Earned</div>
                  <div className="text-lg font-medium text-foreground">{myReviewsStats?.totalXpFromReviews ?? 0}</div>
                </div>
              </div>

              {/* List */}
              {myReviewsLoading && myReviews.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">Loading your reviews…</div>
              )}
              {myReviewsError && (
                <Alert className="mb-4" variant="destructive">
                  <AlertCircle className="h-5 w-5" aria-hidden />
                  <AlertDescription>{myReviewsError}</AlertDescription>
                </Alert>
              )}
              {!myReviewsLoading && myReviews.length === 0 && !myReviewsError && (
                <div className="text-center py-12">
                  <div className="text-sm text-muted-foreground">No reviews yet. Start by completing assignments above.</div>
                </div>
              )}

              <div className="space-y-3">
                {displayedMyReviews.map((r) => {
                  const platform = r.submissionPlatform || r.submission?.platform || 'Unknown'
                  const url = r.submission?.url
                  const host = formatUrlHost(url)
                  return (
                    <Card key={r.id} className="border border-border/60 bg-background/80 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          {/* Left: subject */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="shrink-0">
                                {platform}
                              </Badge>
                              {r.submissionTaskTypes?.slice(0, 3).map((t) => (
                                <Badge key={t} variant="secondary">{t}</Badge>
                              ))}
                              {r.isLate && (
                                <Badge variant="destructive">Late</Badge>
                              )}
                            </div>
                            {url && (
                              <a
                                href={ensureProtocol(url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                title={url}
                              >
                                {host}
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                              </a>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground">
                              Reviewed {r.daysAgo ?? Math.floor((Date.now() - new Date(r.createdAt).getTime()) / (1000*60*60*24))}d ago
                              {r.submissionAuthor && <span className="mx-1.5" aria-hidden>{'\u00B7'}</span>}
                              {r.submissionAuthor && <span>by {r.submissionAuthor}</span>}
                            </div>
                          </div>

                          {/* Right: metrics */}
                          <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 text-right">
                            <div className="rounded-md bg-muted/30 px-2 py-1.5">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">XP</div>
                              <div className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground">
                                <Award className="h-3.5 w-3.5 text-primary" aria-hidden />
                                {r.xpScore ?? '-'}
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/30 px-2 py-1.5">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Review XP</div>
                              <div className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground">
                                <Medal className="h-3.5 w-3.5 text-primary" aria-hidden />
                                {(() => {
                                  const base = r.reviewRewardXpBase ?? null
                                  const bonus = r.reviewRewardXpBonus ?? null
                                  if (base && base > 0 && bonus && bonus > 0) return `${base}+${bonus}`
                                  if (r.reviewRewardXp != null) return r.reviewRewardXp
                                  if (base != null) return base
                                  return '-'
                                })()}
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/30 px-2 py-1.5">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</div>
                              <div className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground">
                                <Clock className="h-3.5 w-3.5" aria-hidden />
                                {(r.timeSpent ?? 0)}m
                              </div>
                            </div>
                          </div>
                        </div>

                        {r.comments && (
                          <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-foreground/90">
                            <div className="mb-1 flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-muted-foreground">
                              <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                              Feedback
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{r.comments}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {hasMoreMyReviews && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setShowAllMyReviews(!showAllMyReviews)}
                    className="transition-all duration-300 ease-in-out hover:scale-105"
                  >
                    {showAllMyReviews ? 'Show Less' : 'Show More'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {/* Back to Top Button (like changelog) */}
        {mounted && (
          <div
            className={`fixed bottom-5 right-5 z-50 transition-all duration-300 ease-in-out ${
              showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
          >
            <div className="group relative">
              <Button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
                aria-label="Back to top"
              >
                <ChevronUp className="h-5 w-5" />
              </Button>
              <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="bg-popover text-popover-foreground px-2 py-1 rounded text-sm whitespace-nowrap shadow-md border">
                  Back to Top
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
        </div>
      </ReviewerGuard>
    </AuthGuard>
  )
}

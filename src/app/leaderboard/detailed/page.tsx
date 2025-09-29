'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Pagination, PaginationInfo } from '@/components/ui/pagination'
import { 
  ArrowLeft, 
  Download, 
  Filter, 
  RefreshCw, 
  Trophy,
  Award,
  Users,
  Bot,
  AlertTriangle,
  ExternalLink,
  Search
} from 'lucide-react'
import Link from 'next/link'
import { sanitizeUrl } from '@/lib/url-sanitizer'

const aiDisabled = (process.env.NEXT_PUBLIC_AI_DISABLED || 'false').toLowerCase() === 'true'

interface DetailedSubmission {
  id: string
  title: string
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
  createdAt: string
  weekNumber: number
  user: {
    username: string
    email: string
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

interface DetailedLeaderboardData {
  submissions: DetailedSubmission[]
  totalCount: number
  pagination: PaginationInfo
  weeklyStats: {
    totalSubmissions: number
    averageXp: number
    topPerformer: string
  }
}

export default function DetailedLeaderboardPage() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<DetailedLeaderboardData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      return parseInt(searchParams.get('page') || '1')
    }
    return 1
  })
  const [pageSize] = useState(20)
  const [exporting, setExporting] = useState(false)
  const hasInitiallyLoaded = useRef(false)
  const lastFetchedPage = useRef(0) // Track the last page we fetched
  const aiXpColumnLabel = aiDisabled ? 'Initial XP (legacy)' : 'AI XP'

  // Filters - Initialize from URL parameters
  const [filters, setFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      return {
        week: searchParams.get('week') || '',
        user: searchParams.get('user') || '',
        taskType: searchParams.get('taskType') || '',
        platform: searchParams.get('platform') || '',
        minXp: searchParams.get('minXp') || '',
        maxXp: searchParams.get('maxXp') || ''
      }
    }
    return {
      week: '',
      user: '',
      taskType: '',
      platform: '',
      minXp: '',
      maxXp: ''
    }
  })

  const fetchDetailedLeaderboard = useCallback(async (isPagination = false) => {
    try {
      // Only show full loading for initial load or filter changes, not pagination
      if (!isPagination) {
        setLoadingData(true)
      }
      setError(null)

      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') params.append(key, value)
      })

      // Add pagination parameters
      params.append('page', currentPage.toString())
      params.append('limit', pageSize.toString())
      params.append('refreshCache', 'true')

      const response = await fetch(`/api/leaderboard/detailed?${params.toString()}`, {
        cache: 'no-store'
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch detailed leaderboard: ${response.status}`)
      }

      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching detailed leaderboard:', error)
      setError(error instanceof Error ? error.message : 'Failed to load detailed leaderboard')
    } finally {
      if (!isPagination) {
        setLoadingData(false)
      }
    }
  }, [filters, currentPage, pageSize])

  // Initial load useEffect
  useEffect(() => {
    if (!loading && userProfile && !hasInitiallyLoaded.current) {
      if (!user || (userProfile.role !== 'ADMIN' && userProfile.role !== 'REVIEWER')) {
        router.push('/leaderboard')
        return
      }
      hasInitiallyLoaded.current = true
      lastFetchedPage.current = currentPage // Track that we're fetching this page
      fetchDetailedLeaderboard(false) // Initial load
    }
  }, [user?.id, userProfile?.role, loading, router, currentPage, fetchDetailedLeaderboard, user, userProfile])

  // Pagination useEffect - triggers when currentPage changes after initial load
  useEffect(() => {
    // Only fetch if we haven't already fetched this page and we have completed initial load
    if (!loading && userProfile && user && hasInitiallyLoaded.current && currentPage !== lastFetchedPage.current) {
      lastFetchedPage.current = currentPage
      fetchDetailedLeaderboard(true) // Pagination
    }
  }, [currentPage, loading, userProfile, user, fetchDetailedLeaderboard])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    setCurrentPage(1) // Reset to first page when applying filters
    lastFetchedPage.current = 1 // Set to 1 since we're going to page 1

    // Update URL to reflect current filters and reset page
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') params.append(key, value)
    })
    params.append('page', '1')

    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)

    fetchDetailedLeaderboard(false) // This is a filter change, not pagination
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)

    // Update URL to reflect current page and filters
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') params.append(key, value)
    })
    params.append('page', page.toString())

    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)
  }

  const clearFilters = () => {
    setFilters({
      week: '',
      user: '',
      taskType: '',
      platform: '',
      minXp: '',
      maxXp: ''
    })
    setCurrentPage(1) // Reset to first page when clearing filters
    lastFetchedPage.current = 1 // Set to 1 since we're going to page 1

    // Update URL to clear all filters and reset page
    const newUrl = `${window.location.pathname}?page=1`
    window.history.replaceState({}, '', newUrl)

    fetchDetailedLeaderboard(false) // Trigger new API request to reload data
  }

  const exportData = async () => {
    if (!data || exporting) return

    try {
      setExporting(true)

      const baseParams = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') baseParams.append(key, value)
      })
      baseParams.append('refreshCache', 'true')

      const totalPages = data.pagination?.totalPages ?? 1
      const limit = data.pagination?.limit ?? pageSize
      const currentDataPage = data.pagination?.page ?? currentPage
      const pageSubmissions = new Map<number, DetailedSubmission[]>()

      pageSubmissions.set(currentDataPage, data.submissions)

      if (totalPages > 1) {
        const pageNumbers: number[] = []
        for (let page = 1; page <= totalPages; page++) {
          if (page !== currentDataPage) {
            pageNumbers.push(page)
          }
        }

        if (pageNumbers.length > 0) {
          const maxConcurrentRequests = Math.min(
            pageNumbers.length,
            typeof navigator !== 'undefined' && navigator.hardwareConcurrency
              ? Math.max(2, Math.floor(navigator.hardwareConcurrency / 2))
              : 8
          )

          const queue = [...pageNumbers]

          const fetchPage = async (page: number) => {
            const pageParams = new URLSearchParams(baseParams)
            pageParams.set('page', page.toString())
            pageParams.set('limit', limit.toString())

            pageParams.set('refreshCache', 'true')

            const response = await fetch(`/api/leaderboard/detailed?${pageParams.toString()}`,
              { cache: 'no-store' }
            )
            if (!response.ok) {
              throw new Error(`Failed to fetch page ${page} for export`)
            }

            const pageData: DetailedLeaderboardData = await response.json()
            pageSubmissions.set(page, pageData.submissions)
          }

          const workers = Array.from({ length: maxConcurrentRequests }, async () => {
            while (queue.length > 0) {
              const nextPage = queue.shift()
              if (typeof nextPage === 'number') {
                await fetchPage(nextPage)
              }
            }
          })

          await Promise.all(workers)
        }
      }

      const sortedPages = Array.from(pageSubmissions.keys()).sort((a, b) => a - b)
      const seenSubmissionIds = new Set<string>()
      const orderedSubmissions: DetailedSubmission[] = []

      sortedPages.forEach((page) => {
        const items = pageSubmissions.get(page) ?? []
        items.forEach((submission) => {
          if (!seenSubmissionIds.has(submission.id)) {
            seenSubmissionIds.add(submission.id)
            orderedSubmissions.push(submission)
          }
        })
      })

      const headers = ['Username', 'Title', 'Platform', 'Task Types', aiXpColumnLabel, 'Peer XP', 'Final XP', 'Reviews', 'Week', 'Status']
      const csvContent = [
        headers.join(','),
        ...orderedSubmissions.map(sub => [
          sub.user.username,
          `"${sub.title}"`,
          sub.platform,
          sub.taskTypes.join(';'),
          sub.aiXp,
          sub.peerXp || 'N/A',
          sub.finalXp || 'Pending',
          sub.reviewCount,
          sub.weekNumber,
          sub.status
        ].join(','))
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `detailed-leaderboard-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting detailed leaderboard:', error)
      window.alert('Failed to export detailed leaderboard. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINALIZED': return 'bg-green-100 text-green-800'
      case 'UNDER_PEER_REVIEW': return 'bg-blue-100 text-blue-800'
      case 'AI_REVIEWED': return 'bg-yellow-100 text-yellow-800'
      case 'PENDING': return 'bg-gray-100 text-gray-800'
      case 'FLAGGED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getXpColor = (xp: number | null) => {
    if (xp === null) return 'text-muted-foreground'
    if (xp >= 80) return 'text-green-600'
    if (xp >= 60) return 'text-blue-600'
    if (xp >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const totalSubmissionsDisplay = data?.totalCount ?? data?.weeklyStats?.totalSubmissions ?? 0

  if (loading || loadingData) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
        <div className="container mx-auto px-4 py-8">
          <Alert className="max-w-2xl mx-auto">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-4 sm:py-8 pb-40 sm:pb-8">
        {/* Mobile-Optimized Header */}
        <div className="mb-6 sm:mb-8">
          {/* Back Button - Full Width on Mobile */}
          <div className="mb-4">
            <Link href="/leaderboard">
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Leaderboard
              </Button>
            </Link>
          </div>

          {/* Title Section */}
          <div className="mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 mb-2">
              <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-600" />
              Detailed Leaderboard
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Transparent submission-level XP breakdown and analysis
            </p>
          </div>

          {/* Action Buttons - Stacked on Mobile */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDetailedLeaderboard(false)}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportData}
              className="w-full sm:w-auto"
              disabled={!data || exporting}
              aria-busy={exporting}
            >
              {exporting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {/* Mobile-Optimized Summary Stats */}
        {data?.weeklyStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 sm:mb-8">
            <Card>
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-blue-600 mb-1">
                  {totalSubmissionsDisplay}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  {data.filters?.applied > 0 ? 'Filtered Submissions' : 'Total Submissions'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-1">
                  {data.weeklyStats.averageXp.toFixed(1)}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  {data.filters?.applied > 0 ? 'Filtered Avg XP' : 'Average XP'}
                </div>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2 lg:col-span-1">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="text-2xl sm:text-3xl font-bold text-purple-600 mb-1 truncate">
                  {data.weeklyStats.topPerformer}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  {data.filters?.applied > 0 ? 'Top in Filter' : 'Top Performer'}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Mobile-Optimized Filters */}
        <Card className="mb-6 sm:mb-8">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
              Filters & Search
            </CardTitle>
            <CardDescription className="text-sm">
              Filter submissions by various criteria for detailed analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary Filters - Always Visible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="user" className="text-sm font-medium">User</Label>
                <Input
                  id="user"
                  placeholder="Username"
                  value={filters.user}
                  onChange={(e) => handleFilterChange('user', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="week" className="text-sm font-medium">Week</Label>
                <Input
                  id="week"
                  type="number"
                  placeholder="Week number"
                  value={filters.week}
                  onChange={(e) => handleFilterChange('week', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Secondary Filters - Collapsible on Mobile */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="taskType" className="text-sm font-medium">Task Type</Label>
                  <Select value={filters.taskType} onValueChange={(value) => handleFilterChange('taskType', value)}>
                    <SelectTrigger id="taskType" className="mt-1">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="LEGACY">Legacy Submissions</SelectItem>
                      <SelectItem value="A">Task A</SelectItem>
                      <SelectItem value="B">Task B</SelectItem>
                      <SelectItem value="C">Task C</SelectItem>
                      <SelectItem value="D">Task D</SelectItem>
                      <SelectItem value="E">Task E</SelectItem>
                      <SelectItem value="F">Task F</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="platform" className="text-sm font-medium">Platform</Label>
                  <Select value={filters.platform} onValueChange={(value) => handleFilterChange('platform', value)}>
                    <SelectTrigger id="platform" className="mt-1">
                      <SelectValue placeholder="All platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      <SelectItem value="LEGACY">Legacy Platform</SelectItem>
                      <SelectItem value="Twitter">Twitter</SelectItem>
                      <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="minXp" className="text-sm font-medium">Min XP</Label>
                  <Input
                    id="minXp"
                    type="number"
                    placeholder="0"
                    value={filters.minXp}
                    onChange={(e) => handleFilterChange('minXp', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="maxXp" className="text-sm font-medium">Max XP</Label>
                  <Input
                    id="maxXp"
                    type="number"
                    placeholder="100"
                    value={filters.maxXp}
                    onChange={(e) => handleFilterChange('maxXp', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons - Full Width on Mobile */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button onClick={applyFilters} className="w-full sm:w-auto">
                <Search className="h-4 w-4 mr-2" />
                Apply Filters
              </Button>
              <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mobile-Optimized Submissions Table */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg sm:text-xl">Submission-Level XP Breakdown</CardTitle>
            <CardDescription className="text-sm">
              Detailed view of all submissions with transparent XP calculations
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Filtered Results Indicator */}
            {data?.filters?.applied > 0 && data?.submissions?.length > 0 && (
              <div className="mx-4 sm:mx-6 mt-4 sm:mt-6 mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  <span className="font-medium">Filtered Results:</span> Showing {data.totalCount} submissions matching your criteria
                  {data.pagination && ` (Page ${data.pagination.page} of ${data.pagination.totalPages})`}
                </p>
              </div>
            )}

            {!data || data.submissions.length === 0 ? (
              <div className="text-center py-8 px-4 text-muted-foreground">
                <Trophy className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-4 opacity-50" />
                <div className="text-base sm:text-lg font-medium mb-2">No Submissions Found</div>
                <div className="text-sm">
                  Try adjusting your filters or check back later for new submissions.
                </div>
              </div>
            ) : (
              <>
                {/* Mobile Table Scroll Hint */}
                <div className="block sm:hidden px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b">
                  ← Scroll horizontally to view all columns →
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[800px]"> {/* Ensure minimum width for proper table display */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Submission</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Bot className="h-4 w-4 text-blue-600" />
                          {aiXpColumnLabel}
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4 text-green-600" />
                          Peer XP
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Award className="h-4 w-4 text-purple-600" />
                          Final XP
                        </div>
                      </TableHead>
                      <TableHead>Reviews</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Week</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.submissions.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                                {submission.user.username.charAt(0).toUpperCase()}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-left truncate">{submission.user.username}</div>
                              <Badge variant="outline" className="text-xs mt-1">
                                {submission.user.role}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="font-medium truncate">{submission.title}</div>
                          <div className="text-sm text-muted-foreground">{submission.platform}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{submission.platform}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {submission.taskTypes.map((type, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`font-bold ${getXpColor(submission.aiXp)}`}>
                            {submission.aiXp}
                          </div>
                          {submission.originalityScore && (
                            <div className="text-xs text-muted-foreground">
                              {(submission.originalityScore * 100).toFixed(0)}% orig
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`font-bold ${getXpColor(submission.peerXp)}`}>
                            {submission.peerXp || 'N/A'}
                          </div>
                          {submission.consensusScore && (
                            <div className="text-xs text-muted-foreground">
                              {(submission.consensusScore * 100).toFixed(0)}% consensus
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`font-bold text-lg ${getXpColor(submission.finalXp)}`}>
                            {submission.finalXp || 'Pending'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-center">
                            <div className="font-medium">{submission.reviewCount}</div>
                            <div className="text-xs text-muted-foreground">
                              {submission.reviewCount >= 3 ? 'Complete' : `${3 - submission.reviewCount} needed`}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(submission.status)}>
                            {submission.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {submission.weekNumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Link href={sanitizeUrl(submission.url)} target="_blank">
                              <Button variant="ghost" size="sm" title="View original">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                            {userProfile?.role === 'ADMIN' && (
                              <Link href={`/admin/submissions/${submission.id}`}>
                                <Button variant="ghost" size="sm" title="Admin details">
                                  <Award className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </div>
                </div>
              </>
            )}

            {/* Mobile-Optimized Pagination */}
            {data?.pagination && data.pagination.totalPages > 1 && (
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t px-4 sm:px-6 mb-8 sm:mb-0">
                <Pagination
                  pagination={data.pagination}
                  onPageChange={handlePageChange}
                  showPageSizeSelector={false}
                  loading={loadingData}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

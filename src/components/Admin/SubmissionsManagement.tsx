'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Edit,
  Trash2,
  Eye,
  ArrowUpDown,
  Award,
  FileText,
  AlertTriangle
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pagination } from '@/components/ui/pagination'

const DEFAULT_REVIEWERS_REQUIRED = Number(process.env.NEXT_PUBLIC_MIN_REVIEWERS_REQUIRED || '3') || 3

interface Submission {
  id: string
  title: string
  content: string
  url: string
  platform: string
  taskType: string
  status: string
  xpAwarded: number
  aiXp: number | null
  peerXp: number | null
  finalXp: number | null
  createdAt: string
  user: {
    id: string
    username: string
    email: string
    role: string
    totalXp: number
  }
  metrics: {
    avgPeerScore: number | null
    reviewProgress: {
      assigned: number
      completed: number
      pending: number
    }
    reviewCount: number
  }
}

interface SubmissionsManagementProps {
  className?: string
}

export default function SubmissionsManagement({ className }: SubmissionsManagementProps) {
  const { user, isLoading: loading, isAdmin } = usePrivyAuthSync()
  const { getAuthHeaders } = useAuthenticatedFetch()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [exportingData, setExportingData] = useState(false)
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [bulkReshuffleModal, setBulkReshuffleModal] = useState({ open: false, reason: '' })
  const [bulkReshuffleProgress, setBulkReshuffleProgress] = useState({
    open: false,
    status: 'pending',
    processed: 0,
    total: 0,
    message: 'Initializing bulk reshuffle...',
    errors: [] as string[]
  })
  const [modifyXpModal, setModifyXpModal] = useState({ open: false })
  const [modifyXpForm, setModifyXpForm] = useState({ xpAwarded: '', reason: '' })
  const [modifyXpLoading, setModifyXpLoading] = useState(false)

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  })

  // Filter state - Initialize with URL parameters
  const initialUserId = searchParams?.get('userId') || ''
  const [filters, setFilters] = useState({
    status: '',
    platform: '',
    taskType: '',
    dateFrom: '',
    dateTo: '',
    search: '',
    flagged: false,
    // Seed from URL search params on first render to avoid an initial unfiltered fetch
    userId: initialUserId
  })

  // Sort state
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  // Stats state
  const [stats, setStats] = useState({
    statusCounts: {} as Record<string, number>,
    totalSubmissions: 0,
    reshuffleNeeded: 0 // Add this for submissions under peer review that need reshuffling
  })

  // Dynamic filter options (fetched from API)
  const [filterOptions, setFilterOptions] = useState({
    platforms: [] as string[],
    taskTypes: [] as string[]
  })

  // Quick Edit Modal State
  const [quickEditModal, setQuickEditModal] = useState<{
    open: boolean
    submission: Submission | null
  }>({
    open: false,
    submission: null
  })
  const [quickEditForm, setQuickEditForm] = useState({
    status: '',
    reason: ''
  })
  const [quickEditLoading, setQuickEditLoading] = useState(false)

  const fetchSubmissions = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingSubmissions(true)

      // Pagination is always initialized via state defaults

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
        // Only add cache busting on explicit refresh, not every request
        ...(forceRefresh ? { _t: Date.now().toString() } : {})
      })

      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          if (key === 'flagged') {
            params.append(key, value.toString())
          } else {
            params.append(key, value as string)
          }
        }
      })

      const apiUrl = `/api/admin/submissions?${params.toString()}`

      const response = await fetch(apiUrl, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...getAuthHeaders(),
        }
      })

      if (response.ok) {
        const responseData = await response.json()
        const data = responseData.data || responseData // Handle both nested and flat response structures
        setSubmissions(data.submissions || [])
        const incoming = data.pagination || {
          page: 1,
          limit: 20,
          totalCount: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
        setPagination(prev => {
          const same = prev.page === incoming.page &&
            prev.limit === incoming.limit &&
            prev.totalCount === incoming.totalCount &&
            prev.totalPages === incoming.totalPages &&
            prev.hasNextPage === incoming.hasNextPage &&
            prev.hasPrevPage === incoming.hasPrevPage
          return same ? prev : incoming
        })
        setStats(data.stats || {
          statusCounts: {},
          totalSubmissions: 0
        })

        // Update dynamic filter options from response
        console.log('📋 API response filterOptions:', data.filterOptions)
        if (data.filterOptions) {
          setFilterOptions(data.filterOptions)
        } else {
          console.warn('⚠️ No filterOptions in API response')
        }
      }
    } catch (error) {
      console.error('Error fetching submissions:', error)
    } finally {
      setLoadingSubmissions(false)
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, filters, getAuthHeaders])

  useEffect(() => {
    // Only fetch when user is loaded with privyUserId and is admin, and pagination is initialized
    if (!loading && isAdmin && user?.privyUserId && pagination) {
      fetchSubmissions()
    }
  }, [pagination, filters, sortBy, sortOrder, user?.role, user?.privyUserId, loading, fetchSubmissions, isAdmin])

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 })) // Reset to first page
  }

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const handleSelectSubmission = (submissionId: string) => {
    setSelectedSubmissions(prev =>
      prev.includes(submissionId)
        ? prev.filter(id => id !== submissionId)
        : [...prev, submissionId]
    )
  }

  const handleSelectAll = () => {
    if (selectedSubmissions.length === submissions.length) {
      setSelectedSubmissions([])
    } else {
      setSelectedSubmissions(submissions.map(s => s.id))
    }
  }

  const handleBulkAction = async (action: string, data?: any) => {
    if (selectedSubmissions.length === 0) return null

    setBulkLoading(true)
    setBulkMessage(null)

    try {
      const response = await fetch('/api/admin/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          submissionIds: selectedSubmissions,
          data
        })
      })

      const result = await response.json()

      if (response.ok) {
        fetchSubmissions(true)
        setSelectedSubmissions([])
        setBulkMessage({ text: result.message || `Successfully performed ${action} on ${result.count || selectedSubmissions.length} submissions`, type: 'success' })
        setTimeout(() => setBulkMessage(null), 3000)
        return result
      } else {
        setBulkMessage({ text: result.message || 'Failed to perform bulk action', type: 'error' })
        return { success: false, message: result.message || 'Failed to perform bulk action' }
      }
    } catch (error) {
      console.error('Error performing bulk action:', error)
      const errorMsg = 'Network error: Unable to perform bulk action'
      setBulkMessage({ text: errorMsg, type: 'error' })
      return { success: false, message: errorMsg }
    } finally {
      setBulkLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      setExportingData(true)

      // Fetch all submissions for export using pagination to bypass API limits
      const allSubmissions: Submission[] = []
      let currentPage = 1
      let hasMorePages = true
      const pageSize = 100 // Use maximum allowed page size

      while (hasMorePages) {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: pageSize.toString(),
          status: filters.status || '',
          platform: filters.platform || '',
          taskType: filters.taskType || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || '',
          search: filters.search || '',
          flagged: filters.flagged ? 'true' : ''
        })

        const response = await fetch(`/api/admin/submissions?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`Failed to fetch submissions page ${currentPage} for export`)
        }

        const responseData = await response.json()
        const data = responseData.data || responseData
        const pageSubmissions = data.submissions || []

        // Add submissions from this page to our collection
        allSubmissions.push(...pageSubmissions)

        // Check if there are more pages
        const pagination = data.pagination
        hasMorePages = pagination?.hasNextPage || false

        console.log(`Export page ${currentPage - 1}: fetched ${pageSubmissions.length} submissions, hasNextPage: ${hasMorePages}, total so far: ${allSubmissions.length}`)

        currentPage++

        // Safety check to prevent infinite loops
        if (currentPage > 100) {
          console.warn('Export stopped at page 100 to prevent infinite loop')
          break
        }
      }

      console.log(`Export fetched ${allSubmissions.length} submissions across ${currentPage - 1} pages`)

      // Validate we got submissions
      if (allSubmissions.length === 0) {
        console.warn('No submissions found for export')
        return
      }

      // Create CSV content
      const headers = [
        'ID',
        'Title',
        'URL',
        'Platform',
        'Task Type',
        'Status',
        'Username',
        'User Email',
        'User Role',
        'Legacy XP (read-only)',
        'Peer XP',
        'Final XP',
        'Review Count',
        'Created Date',
        'User Total XP'
      ]

      // Helper function to escape CSV values
      const escapeCSV = (value: unknown): string => {
        if (value === null || value === undefined) return 'N/A'
        const str = String(value)
        // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const csvContent = [
        headers.join(','),
        ...allSubmissions.map((submission: Submission) => [
          escapeCSV(submission.id),
          escapeCSV(submission.title),
          escapeCSV(submission.url),
          escapeCSV(submission.platform),
          escapeCSV(submission.taskType),
          escapeCSV(submission.status),
          escapeCSV(submission.user.username),
          escapeCSV(submission.user.email),
          escapeCSV(submission.user.role),
          escapeCSV(submission.aiXp),
          escapeCSV(submission.peerXp),
          escapeCSV(submission.finalXp),
          escapeCSV(submission.metrics.reviewCount),
          escapeCSV(new Date(submission.createdAt).toLocaleDateString()),
          escapeCSV(submission.user.totalXp)
        ].join(','))
      ].join('\n')

      // Add BOM for proper UTF-8 encoding in Excel
      const csvWithBOM = '\uFEFF' + csvContent

      // Download CSV
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename = `submissions-export-${new Date().toISOString().split('T')[0]}.csv`
      a.download = filename
      a.click()
      window.URL.revokeObjectURL(url)

      console.log(`✅ Export completed: ${filename} with ${allSubmissions.length} submissions`)

    } catch (error) {
      console.error('Error exporting submissions:', error)
      // You could add a toast notification here for better UX
    } finally {
      setExportingData(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-warning/10 text-warning'
      case 'AI_REVIEWED': return 'bg-info/10 text-info'
      case 'UNDER_PEER_REVIEW': return 'bg-purple/10 text-purple'
      case 'FINALIZED': return 'bg-success/10 text-success'
      case 'REJECTED': return 'bg-destructive/10 text-destructive'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  // Quick Edit Functions
  const openQuickEdit = (submission: Submission) => {
    setQuickEditModal({
      open: true,
      submission
    })
    setQuickEditForm({
      status: submission.status,
      reason: ''
    })
  }

  const closeQuickEdit = () => {
    setQuickEditModal({
      open: false,
      submission: null
    })
    setQuickEditForm({
      status: '',
      reason: ''
    })
  }

  const handleQuickEditSubmit = async () => {
    if (!quickEditModal.submission) return

    setQuickEditLoading(true)
    try {
      const response = await fetch(`/api/admin/submissions/${quickEditModal.submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStatus',
          data: {
            status: quickEditForm.status,
            reason: quickEditForm.reason
          }
        })
      })

      if (response.ok) {
        fetchSubmissions(true)
        closeQuickEdit()
      } else {
        console.error('Failed to update submission')
      }
    } catch (error) {
      console.error('Error updating submission:', error)
    } finally {
      setQuickEditLoading(false)
    }
  }

  // Handle bulk reshuffle of missed reviewers for ALL submissions
  const handleBulkReshuffle = async () => {
    setBulkReshuffleModal({ open: true, reason: '' })
  }

  const handleBulkReshuffleConfirm = async (reason: string) => {
    if (!reason || reason.trim().length < 5) {
      setBulkMessage({
        text: 'Reason is required and must be at least 5 characters long.',
        type: 'error'
      })
      return
    }

    // Close initial modal and open progress modal
    setBulkReshuffleModal({ open: false, reason: '' })

    // Initialize progress modal
    setBulkReshuffleProgress({
      open: true,
      status: 'processing',
      processed: 0,
      total: 0,
      message: 'Initializing bulk reshuffle...',
      errors: []
    })

    try {
      console.log('🔄 Starting bulk reshuffle with reason:', reason.trim())

      // Perform the bulk reshuffle directly - the API will return count information
      const response = await fetch('/api/admin/bulk-reshuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim()
        })
      })

      console.log('📊 Bulk reshuffle response status:', response.status)

      const result = await response.json()
      console.log('📊 Bulk reshuffle result:', result)

      if (response.ok) {
        console.log('✅ Bulk reshuffle successful, refreshing submissions...')

        // Update progress modal with completion message
        setBulkReshuffleProgress(prev => ({
          ...prev,
          status: 'completed',
          processed: result.count || 0,
          total: result.count || 0,
          message: `Successfully reshuffled ${result.count || 'all'} submissions!`,
          errors: result.errors || []
        }))

        // Wait a moment to show completion message, then close
        setTimeout(() => {
          setBulkReshuffleProgress({
            open: false,
            status: 'pending',
            processed: 0,
            total: 0,
            message: '',
            errors: []
          })
          fetchSubmissions(true)
        }, 3000)

        setBulkMessage({
          text: result.message || `Successfully reshuffled missed reviewers for ${result.count || 'multiple'} submissions`,
          type: 'success'
        })
        setTimeout(() => setBulkMessage(null), 5000) // Extended to 5 seconds for bulk operations
      } else {
        console.error('❌ Bulk reshuffle failed:', result)

        // Update progress modal with error
        setBulkReshuffleProgress(prev => ({
          ...prev,
          status: 'error',
          message: result.error || 'Failed to reshuffle submissions',
          errors: [...prev.errors, result.error || 'Unknown error occurred']
        }))

        setBulkMessage({
          text: result.error || 'Failed to reshuffle submissions',
          type: 'error'
        })
        setTimeout(() => setBulkMessage(null), 7000) // Extended timeout for error messages
      }
    } catch (error) {
      console.error('💥 Network error performing bulk reshuffle:', error)

      // Update progress modal with error
      setBulkReshuffleProgress(prev => ({
        ...prev,
        status: 'error',
        message: 'Network error occurred',
        errors: [...prev.errors, error instanceof Error ? error.message : 'Network error: Unable to perform bulk reshuffle. Please check your connection and try again.']
      }))

      const errorMsg = 'Network error: Unable to perform bulk reshuffle. Please check your connection and try again.'
      setBulkMessage({ text: errorMsg, type: 'error' })
      setTimeout(() => setBulkMessage(null), 7000)
    }
    // Note: Not setting bulkLoading to false here as we're using the progress modal instead
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Submissions Management
          </h2>
          <p className="text-muted-foreground">
            Manage and moderate all platform submissions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchSubmissions(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportingData}
          >
            {exportingData ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </div>
      </div>

      {/* User Filter Indicator */}
      {filters.userId && (
        <div className="mb-6">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    User Filter Active
                  </Badge>
                  <span className="text-sm text-blue-700">
                    Showing submissions for user ID: <code className="bg-blue-100 px-1 rounded">{filters.userId}</code>
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilters(prev => ({ ...prev, userId: '' }))
                    router.push('/admin')
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Clear Filter
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-info">
              {stats?.totalSubmissions || 0}
            </div>
            <div className="text-sm text-muted-foreground">Total Submissions</div>
          </CardContent>
        </Card>
        {stats?.statusCounts && Object.entries(stats.statusCounts).map(([status, count]) => (
          status !== 'AI_REVIEWED' ? (
            <Card key={status}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">
                  {count}
                </div>
                <div className="text-sm text-muted-foreground">{status}</div>
              </CardContent>
            </Card>
          ) : null
        ))}

        {/* Separate card for submissions that need reshuffling */}
        <Card key="RESHUFFLE_NEEDED" className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {stats?.reshuffleNeeded || 0}
            </div>
            <div className="text-sm text-yellow-700 font-medium">RESHUFFLE NEEDED</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search submissions..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="AI_REVIEWED">AI Reviewed</SelectItem>
                  <SelectItem value="UNDER_PEER_REVIEW">Peer Review</SelectItem>
                  <SelectItem value="RESHUFFLE_NEEDED">Reshuffle Needed</SelectItem>
                  <SelectItem value="FINALIZED">Completed</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="platform">Platform</Label>
              <Select value={filters.platform} onValueChange={(value) => handleFilterChange('platform', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All platforms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {filterOptions.platforms.map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="taskType">Task Type</Label>
              <Select value={filters.taskType} onValueChange={(value) => handleFilterChange('taskType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {filterOptions.taskTypes.map((taskType) => (
                    <SelectItem key={taskType} value={taskType}>
                      Type {taskType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
              id="flagged"
              checked={filters.flagged}
              onCheckedChange={(checked) => handleFilterChange('flagged', checked)}
            />
            <Label htmlFor="flagged">Show only flagged content</Label>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedSubmissions.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {selectedSubmissions.length} selected
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Bulk actions for selected submissions
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('updateStatus', { status: 'FINALIZED' })}
                  disabled={bulkLoading}
                >
                  Mark Complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkAction('updateStatus', { status: 'REJECTED' })}
                  disabled={bulkLoading}
                >
                  Reject
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModifyXpModal({ open: true })}
                  disabled={bulkLoading}
                >
                  <Award className="h-4 w-4 mr-2" />
                  Modify XP
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleBulkAction('delete')}
                  disabled={bulkLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSubmissions([])}
                  disabled={bulkLoading}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
            {bulkMessage && (
              <div className={`mt-2 p-2 rounded-md ${bulkMessage.type === 'success'
                ? 'bg-green-100 border border-green-200 text-green-800'
                : 'bg-red-100 border border-red-200 text-red-800'
                } text-sm`}
              >
                {bulkMessage.text}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Global Actions */}
      {/* <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground">
                Global actions for all submissions
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkReshuffle}
                disabled={bulkLoading}
                title="Reshuffle missed reviewers for ALL submissions under peer review (no selection needed)"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reshuffle All Missed
              </Button>
            </div>
          </div>
          {bulkMessage && (
            <div className={`mt-2 p-2 rounded-md ${
              bulkMessage.type === 'success'
                ? 'bg-green-100 border border-green-200 text-green-800'
                : 'bg-red-100 border border-red-200 text-red-800'
            } text-sm`}
            >
              {bulkMessage.text}
            </div>
          )}
        </CardContent>
      </Card> */}

      {/* Bulk Reshuffle Modal */}
      <Dialog open={bulkReshuffleModal.open} onOpenChange={(open) => !open && setBulkReshuffleModal({ open: false, reason: '' })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Bulk Reshuffle Missed Reviewers
            </DialogTitle>
            <DialogDescription>
              Reshuffle all missed reviewers for submissions under peer review. This will replace inactive reviewers with new eligible reviewers across ALL submissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="text-sm text-muted-foreground">
                  This action will process <strong>ALL submissions</strong> under peer review status. Only reviewers with missed deadlines will be reshuffled. The operation cannot be undone.
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reshuffleReason">Reason for Reshuffling (Required)</Label>
              <Textarea
                id="reshuffleReason"
                placeholder="Enter reason for reshuffling missed reviewers (minimum 5 characters)..."
                value={bulkReshuffleModal.reason || ''}
                onChange={(e) => setBulkReshuffleModal(prev => ({ ...prev, reason: e.target.value }))}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This reason will be logged in the audit trail and helps track administrative actions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkReshuffleModal({ open: false, reason: '' })}
              disabled={bulkLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const reason = bulkReshuffleModal.reason?.trim() || ''
                if (!reason || reason.length < 5) {
                  setBulkMessage({
                    text: 'Reason is required and must be at least 5 characters long.',
                    type: 'error'
                  })
                  return
                }
                setBulkReshuffleModal({ open: false, reason: '' })
                await handleBulkReshuffleConfirm(reason)
              }}
              disabled={bulkLoading || !bulkReshuffleModal.reason?.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Reshuffle All Missed Reviewers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modify XP Modal */}
      <Dialog open={modifyXpModal.open} onOpenChange={(open) => !open && setModifyXpModal({ open: false })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Modify XP for {selectedSubmissions.length} Submission{selectedSubmissions.length !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Set the final XP amount for the selected submissions. This will update user totals and create an audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="xpAwarded">XP Amount</Label>
              <Input
                id="xpAwarded"
                type="number"
                placeholder="Enter XP amount"
                value={modifyXpForm.xpAwarded}
                onChange={(e) => setModifyXpForm(prev => ({ ...prev, xpAwarded: e.target.value }))}
                min="0"
                step="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for XP modification..."
                value={modifyXpForm.reason}
                onChange={(e) => setModifyXpForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifyXpModal({ open: false })} disabled={modifyXpLoading}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!modifyXpForm.xpAwarded || selectedSubmissions.length === 0) return
                setModifyXpLoading(true)
                try {
                  const result = await handleBulkAction('updateXp', {
                    xpAwarded: parseInt(modifyXpForm.xpAwarded),
                    reason: modifyXpForm.reason || 'Bulk XP modification'
                  })
                  if (result.success) {
                    setModifyXpModal({ open: false })
                    setModifyXpForm({ xpAwarded: '', reason: '' })
                  }
                } catch (error) {
                  console.error('Modify XP error:', error)
                } finally {
                  setModifyXpLoading(false)
                }
              }}
              disabled={modifyXpLoading || !modifyXpForm.xpAwarded}
            >
              {modifyXpLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Update XP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Submissions Table */}
      <Card>
        <CardContent className="p-0">
          {loadingSubmissions ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedSubmissions.length === submissions.length && submissions.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer w-[200px]"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-1">
                      Title
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[150px]">User</TableHead>
                  <TableHead className="w-[100px]">Platform</TableHead>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead
                    className="cursor-pointer w-[120px]"
                    onClick={() => handleSort('xpAwarded')}
                  >
                    <div className="flex items-center gap-1">
                      XP Details
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[80px]">Reviews</TableHead>
                  <TableHead
                    className="cursor-pointer w-[100px]"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center gap-1">
                      Created
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => {
                  const normalizedUrl = submission.url
                    ? submission.url.startsWith('http')
                      ? submission.url
                      : `https://${submission.url}`
                    : ''
                  const contentPreview = submission.content || ''
                  const reviewProgress = submission.metrics?.reviewProgress || { completed: 0, assigned: 0, pending: 0 }
                  const completedReviews = reviewProgress.completed ?? 0
                  const expectedReviewsRaw = reviewProgress.assigned ?? 0
                  const expectedReviews = expectedReviewsRaw > 0
                    ? expectedReviewsRaw
                    : Math.max(DEFAULT_REVIEWERS_REQUIRED, completedReviews)
                  const pendingReviews = reviewProgress.pending ?? Math.max(0, expectedReviews - completedReviews)
                  const averagePeerScore = submission.metrics?.avgPeerScore
                  const reviewTooltip = pendingReviews > 0
                    ? `${completedReviews} completed, ${pendingReviews} pending of ${expectedReviews} reviews`
                    : `${completedReviews} of ${expectedReviews} reviews completed`

                  return (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSubmissions.includes(submission.id)}
                          onCheckedChange={() => handleSelectSubmission(submission.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-[200px] space-y-1">
                        <div className="truncate font-medium" title={submission.title}>{submission.title}</div>
                        {submission.url ? (
                          <a
                            href={normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-sm text-primary hover:underline"
                          >
                            {submission.url}
                          </a>
                        ) : (
                          <div className="text-sm text-muted-foreground truncate">
                            {contentPreview.length > 100
                              ? `${contentPreview.substring(0, 100)}...`
                              : contentPreview}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        <div className="font-medium truncate" title={submission.user.username}>{submission.user.username}</div>
                        <div className="text-sm text-muted-foreground truncate" title={submission.user.email}>{submission.user.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{submission.platform}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{submission.taskType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(submission.status)}>
                          {submission.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-blue-600">AI:</span>
                            <span className="font-medium">{submission.aiXp || 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-green-600">Peer:</span>
                            <span className="font-medium">{submission.peerXp || 'N/A'}</span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1">
                            <span className="text-purple-600 font-medium">Final:</span>
                            <span className="font-bold">{submission.finalXp || 'Pending'}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm" title={reviewTooltip}>
                          {completedReviews}/{expectedReviews}
                        </div>
                        {averagePeerScore !== undefined && averagePeerScore !== null && (
                          <div className="text-xs text-muted-foreground">
                            Avg: {averagePeerScore.toFixed(1)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(submission.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/admin/submissions/${submission.id}`)}
                            title="View submission details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openQuickEdit(submission)}
                            title="Quick edit submission"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 pt-6 border-t">
          <Pagination
            pagination={pagination}
            onPageChange={handlePageChange}
            showPageSizeSelector={false}
            loading={loadingSubmissions}
          />
        </div>
      )}
      {/* Bulk Reshuffle Progress Modal */}
      <Dialog open={bulkReshuffleProgress.open} onOpenChange={(open) => !open && setBulkReshuffleProgress(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Bulk Reshuffle Progress
            </DialogTitle>
            <DialogDescription>
              Reshuffling missed reviewers across all submissions. Please wait while the process completes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{bulkReshuffleProgress.processed} of {bulkReshuffleProgress.total} submissions processed</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: bulkReshuffleProgress.total > 0
                      ? `${(bulkReshuffleProgress.processed / bulkReshuffleProgress.total) * 100}%`
                      : '0%'
                  }}
                ></div>
              </div>
            </div>

            {/* Current Status */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <div className="h-4 w-4 bg-blue-100 rounded-full mt-0.5 flex-shrink-0"></div>
                <div className="text-sm">
                  <span className="font-medium">Status: </span>
                  <span className="text-blue-700 capitalize">{bulkReshuffleProgress.message}</span>
                </div>
              </div>
            </div>

            {/* Processing Details */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Processing Details:</div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>• Processing submissions under peer review status</div>
                <div>• Reassigning missed reviewers to new eligible reviewers</div>
                <div>• Updating submission review progress</div>
                <div>• Refreshing admin dashboard after completion</div>
              </div>
            </div>

            {/* Error Messages */}
            {bulkReshuffleProgress.errors.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-destructive">Errors ({bulkReshuffleProgress.errors.length}):</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {bulkReshuffleProgress.errors.map((error, index) => (
                    <div key={index} className="text-xs text-destructive/80 bg-destructive/5 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Estimated Time */}
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-xs text-yellow-700">
                <span className="font-medium">Note: </span>
                This process may take several minutes depending on the number of submissions. Please keep this window open.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkReshuffleProgress({ open: false, status: 'pending', processed: 0, total: 0, message: '', errors: [] })}
              disabled={bulkReshuffleProgress.status === 'processing'}
            >
              {bulkReshuffleProgress.status === 'processing' ? 'Processing...' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Edit Modal */}
      <Dialog open={quickEditModal.open} onOpenChange={(open) => !open && closeQuickEdit()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Quick Edit Submission
            </DialogTitle>
            <DialogDescription>
              Quickly update the status of this submission. For detailed editing, use the View button.
            </DialogDescription>
          </DialogHeader>

          {quickEditModal.submission && (
            <div className="space-y-4">
              {/* Submission Info */}
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-1">{quickEditModal.submission.title}</h4>
                <p className="text-xs text-muted-foreground">
                  by {quickEditModal.submission.user.username} • {quickEditModal.submission.platform}
                </p>
              </div>

              {/* Status Selection */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="w-full p-2 border rounded-md"
                  value={quickEditForm.status}
                  onChange={(e) => setQuickEditForm(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="PENDING">Pending</option>
                  <option value="AI_REVIEWED">AI Reviewed</option>
                  <option value="UNDER_PEER_REVIEW">Peer Review</option>
                  <option value="FINALIZED">Completed</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter reason for status change..."
                  value={quickEditForm.reason}
                  onChange={(e) => setQuickEditForm(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeQuickEdit} disabled={quickEditLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleQuickEditSubmit}
              disabled={quickEditLoading || !quickEditForm.status}
            >
              {quickEditLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


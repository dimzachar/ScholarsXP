'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
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
  Award
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pagination } from '@/components/ui/pagination'
// Guards are handled at route level; no direct usage here

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

export default function AdminSubmissionsPage() {
  const { user: _user, userProfile, loading, session } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([])
  
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
    totalSubmissions: 0
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

  const fetchSubmissions = React.useCallback(async () => {
    try {
      setLoadingSubmissions(true)

      // Pagination is always initialized via state defaults

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder
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
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
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
      }
    } catch (error) {
      console.error('Error fetching submissions:', error)
    } finally {
      setLoadingSubmissions(false)
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, filters])

  useEffect(() => {
    // Only fetch when user is loaded and is admin
    if (!loading && userProfile?.role === 'ADMIN') {
      fetchSubmissions()
    }
  }, [fetchSubmissions, userProfile?.role, loading])

  const handleFilterChange = (key: string, value: string | boolean) => {
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

  const handleBulkAction = async (action: string, data?: Record<string, unknown>) => {
    if (selectedSubmissions.length === 0) return

    try {
      const response = await fetch('/api/admin/submissions', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action,
          submissionIds: selectedSubmissions,
          data
        })
      })

      if (response.ok) {
        fetchSubmissions()
        setSelectedSubmissions([])
      }
    } catch (error) {
      console.error('Error performing bulk action:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-warning/10 text-warning'
      case 'AI_REVIEWED': return 'bg-info/10 text-info'
      case 'PEER_REVIEW': return 'bg-purple/10 text-purple'
      case 'COMPLETED': return 'bg-success/10 text-success'
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
        fetchSubmissions()
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (userProfile?.role !== 'ADMIN') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Submission Management</h1>
            <p className="text-muted-foreground">
              Manage and moderate all platform submissions
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchSubmissions}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
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
                      router.push('/admin/submissions')
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
            <Card key={status}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">
                  {count}
                </div>
                <div className="text-sm text-muted-foreground">{status}</div>
              </CardContent>
            </Card>
          ))}
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
                    <SelectItem value="PEER_REVIEW">Peer Review</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
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
                    <SelectItem value="TWITTER">Twitter</SelectItem>
                    <SelectItem value="LINKEDIN">LinkedIn</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="YOUTUBE">YouTube</SelectItem>
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
                    <SelectItem value="A">Type A</SelectItem>
                    <SelectItem value="B">Type B</SelectItem>
                    <SelectItem value="C">Type C</SelectItem>
                    <SelectItem value="D">Type D</SelectItem>
                    <SelectItem value="E">Type E</SelectItem>
                    <SelectItem value="F">Type F</SelectItem>
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
                <span className="text-sm text-muted-foreground">
                  {selectedSubmissions.length} submissions selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('updateStatus', { status: 'COMPLETED' })}
                  >
                    Mark Complete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('updateStatus', { status: 'REJECTED' })}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleBulkAction('delete')}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                    onClick={() => {
                      // TODO: Implement bulk XP modification
                      console.log('Bulk XP modification for:', selectedSubmissions)
                    }}
                  >
                    <Award className="h-4 w-4 mr-2" />
                    Modify XP
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSubmissions([])}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                      className="cursor-pointer"
                      onClick={() => handleSort('title')}
                    >
                      <div className="flex items-center gap-1">
                        Title
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => handleSort('xpAwarded')}
                    >
                      <div className="flex items-center gap-1">
                        XP Details
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Reviews</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('createdAt')}
                    >
                      <div className="flex items-center gap-1">
                        Created
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSubmissions.includes(submission.id)}
                          onCheckedChange={() => handleSelectSubmission(submission.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate font-medium">{submission.title}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {submission.content.substring(0, 100)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{submission.user.username}</div>
                        <div className="text-sm text-muted-foreground">{submission.user.email}</div>
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
                        <div className="text-sm">
                          {submission.metrics.reviewProgress.completed}/{submission.metrics.reviewProgress.assigned}
                        </div>
                        {submission.metrics.avgPeerScore && (
                          <div className="text-xs text-muted-foreground">
                            Avg: {submission.metrics.avgPeerScore.toFixed(1)}
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
                  ))}
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
      </div>

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
                  <option value="PEER_REVIEW">Peer Review</option>
                  <option value="COMPLETED">Completed</option>
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

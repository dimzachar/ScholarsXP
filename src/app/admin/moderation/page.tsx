'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Shield,
  Eye,
  Check,
  X,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ExternalLink
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ContentFlag {
  id: string
  reason: string
  severity: string
  status: string
  description: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  adminNotes: string | null
  submission: {
    id: string
    title: string
    content: string
    url: string
    platform: string
    taskType: string
    status: string
    user: {
      id: string
      username: string
      email: string
    }
  }
  flaggedBy: {
    id: string
    username: string
    email: string
    role: string
  }
  resolvedBy: {
    id: string
    username: string
    email: string
    role: string
  } | null
}

export default function AdminModerationPage() {
  const { user: _user, loading } = useAuth()
  const _router = useRouter()
  const [contentFlags, setContentFlags] = useState<ContentFlag[]>([])
  const [loadingFlags, setLoadingFlags] = useState(true)
  const [selectedFlags, setSelectedFlags] = useState<string[]>([])
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  })

  // Filter state
  const [filters, setFilters] = useState({
    status: '',
    reason: '',
    severity: '',
    dateFrom: '',
    dateTo: ''
  })

  // Sort state
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  // Stats state
  const [stats, setStats] = useState({
    statusCounts: {} as Record<string, number>,
    reasonCounts: {} as Record<string, number>,
    severityCounts: {} as Record<string, number>,
    totalFlags: 0,
    pendingFlags: 0
  })

  // Dialog states
  const [resolveDialog, setResolveDialog] = useState(false)
  const [dismissDialog, setDismissDialog] = useState(false)
  const [viewDialog, setViewDialog] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<ContentFlag | null>(null)
  const [resolution, setResolution] = useState('')
  const [adminNotes, setAdminNotes] = useState('')

  const fetchContentFlags = useCallback(async () => {
    try {
      setLoadingFlags(true)
      
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder
      })

      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value as string)
        }
      })

      const response = await fetch(`/api/admin/moderation?${params.toString()}`)
      
      if (response.ok) {
        const data = await response.json()
        setContentFlags(data.contentFlags)
        setPagination(data.pagination)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching content flags:', error)
    } finally {
      setLoadingFlags(false)
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, filters])

  useEffect(() => {
    fetchContentFlags()
  }, [fetchContentFlags])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 })) // Reset to first page
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const handleSelectFlag = (flagId: string) => {
    setSelectedFlags(prev => 
      prev.includes(flagId)
        ? prev.filter(id => id !== flagId)
        : [...prev, flagId]
    )
  }

  const handleSelectAll = () => {
    if (selectedFlags.length === contentFlags.length) {
      setSelectedFlags([])
    } else {
      setSelectedFlags(contentFlags.map(f => f.id))
    }
  }

  const handleBulkAction = async (action: string, data?: Record<string, unknown>) => {
    if (selectedFlags.length === 0) return

    try {
      const response = await fetch('/api/admin/moderation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          flagIds: selectedFlags,
          data
        })
      })

      if (response.ok) {
        fetchContentFlags()
        setSelectedFlags([])
        setResolveDialog(false)
        setDismissDialog(false)
        setResolution('')
        setAdminNotes('')
      }
    } catch (error) {
      console.error('Error performing bulk action:', error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'LOW': return 'bg-success/10 text-success'
      case 'MEDIUM': return 'bg-warning/10 text-warning'
      case 'HIGH': return 'bg-warning/20 text-warning'
      case 'CRITICAL': return 'bg-destructive/10 text-destructive'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-warning/10 text-warning'
      case 'RESOLVED': return 'bg-success/10 text-success'
      case 'DISMISSED': return 'bg-muted text-muted-foreground'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const getReasonIcon = (reason: string) => {
    switch (reason) {
      case 'SPAM': return '🚫'
      case 'INAPPROPRIATE': return '⚠️'
      case 'PLAGIARISM': return '📋'
      case 'MISINFORMATION': return '❌'
      case 'HARASSMENT': return '🛡️'
      default: return '🏴'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-destructive" />
              Content Moderation
            </h1>
            <p className="text-muted-foreground">
              Review and moderate flagged content
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchContentFlags}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-destructive/20 bg-destructive/10">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-destructive">
                {stats.pendingFlags}
              </div>
              <div className="text-sm text-destructive">Pending Review</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-info">
                {stats.totalFlags}
              </div>
              <div className="text-sm text-muted-foreground">Total Flags</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-success">
                {stats.statusCounts.RESOLVED || 0}
              </div>
              <div className="text-sm text-muted-foreground">Resolved</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-muted-foreground">
                {stats.statusCounts.DISMISSED || 0}
              </div>
              <div className="text-sm text-muted-foreground">Dismissed</div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="DISMISSED">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="reason">Reason</Label>
                <Select value={filters.reason} onValueChange={(value) => handleFilterChange('reason', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All reasons" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All reasons</SelectItem>
                    <SelectItem value="SPAM">Spam</SelectItem>
                    <SelectItem value="INAPPROPRIATE">Inappropriate</SelectItem>
                    <SelectItem value="PLAGIARISM">Plagiarism</SelectItem>
                    <SelectItem value="MISINFORMATION">Misinformation</SelectItem>
                    <SelectItem value="HARASSMENT">Harassment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="severity">Severity</Label>
                <Select value={filters.severity} onValueChange={(value) => handleFilterChange('severity', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All severities</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
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
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedFlags.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedFlags.length} flags selected
                </span>
                <div className="flex items-center gap-2">
                  <Dialog open={resolveDialog} onOpenChange={setResolveDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Check className="h-4 w-4 mr-2" />
                        Resolve
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Resolve Content Flags</DialogTitle>
                        <DialogDescription>
                          Resolve {selectedFlags.length} selected flags.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="resolution">Resolution</Label>
                          <Select value={resolution} onValueChange={setResolution}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select resolution" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CONTENT_REMOVED">Content Removed</SelectItem>
                              <SelectItem value="USER_WARNED">User Warned</SelectItem>
                              <SelectItem value="CONTENT_EDITED">Content Edited</SelectItem>
                              <SelectItem value="NO_ACTION">No Action Required</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="adminNotes">Admin Notes</Label>
                          <Textarea
                            id="adminNotes"
                            placeholder="Add notes about the resolution..."
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setResolveDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={() => handleBulkAction('resolve', { resolution, adminNotes })}>
                          Resolve Flags
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={dismissDialog} onOpenChange={setDismissDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <X className="h-4 w-4 mr-2" />
                        Dismiss
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Dismiss Content Flags</DialogTitle>
                        <DialogDescription>
                          Dismiss {selectedFlags.length} selected flags as false positives.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="adminNotes">Admin Notes</Label>
                          <Textarea
                            id="adminNotes"
                            placeholder="Reason for dismissing these flags..."
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDismissDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={() => handleBulkAction('dismiss', { adminNotes })}>
                          Dismiss Flags
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Content Flags Table */}
        <Card>
          <CardContent className="p-0">
            {loadingFlags ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedFlags.length === contentFlags.length && contentFlags.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Flagged By</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('createdAt')}
                    >
                      <div className="flex items-center gap-1">
                        Flagged
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contentFlags.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedFlags.includes(flag.id)}
                          onCheckedChange={() => handleSelectFlag(flag.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="font-medium truncate">{flag.submission.title}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          by {flag.submission.user.username}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">{flag.submission.platform}</Badge>
                          <Badge variant="outline">{flag.submission.taskType}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{getReasonIcon(flag.reason)}</span>
                          <span className="text-sm">{flag.reason}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(flag.severity)}>
                          {flag.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(flag.status)}>
                          {flag.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{flag.flaggedBy.username}</div>
                          <div className="text-muted-foreground">{flag.flaggedBy.role}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(flag.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedFlag(flag)
                              setViewDialog(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => window.open(flag.submission.url, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
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
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} flags
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={!pagination.hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={!pagination.hasNextPage}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* View Flag Detail Dialog */}
        <Dialog open={viewDialog} onOpenChange={setViewDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Content Flag Details</DialogTitle>
            </DialogHeader>
            {selectedFlag && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Flag Information</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>Reason:</strong> {selectedFlag.reason}</div>
                      <div><strong>Severity:</strong> {selectedFlag.severity}</div>
                      <div><strong>Status:</strong> {selectedFlag.status}</div>
                      <div><strong>Flagged by:</strong> {selectedFlag.flaggedBy.username}</div>
                      <div><strong>Date:</strong> {new Date(selectedFlag.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Submission Information</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>Title:</strong> {selectedFlag.submission.title}</div>
                      <div><strong>Author:</strong> {selectedFlag.submission.user.username}</div>
                      <div><strong>Platform:</strong> {selectedFlag.submission.platform}</div>
                      <div><strong>Task Type:</strong> {selectedFlag.submission.taskType}</div>
                      <div><strong>Status:</strong> {selectedFlag.submission.status}</div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Flag Description</h4>
                  <p className="text-sm bg-muted p-3 rounded">
                    {selectedFlag.description || 'No description provided'}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Content Preview</h4>
                  <div className="text-sm bg-muted p-3 rounded max-h-40 overflow-y-auto">
                    {selectedFlag.submission.content.substring(0, 500)}
                    {selectedFlag.submission.content.length > 500 && '...'}
                  </div>
                </div>

                {selectedFlag.resolution && (
                  <div>
                    <h4 className="font-medium mb-2">Resolution</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>Resolution:</strong> {selectedFlag.resolution}</div>
                      {selectedFlag.resolvedBy && (
                        <div><strong>Resolved by:</strong> {selectedFlag.resolvedBy.username}</div>
                      )}
                      {selectedFlag.resolvedAt && (
                        <div><strong>Resolved at:</strong> {new Date(selectedFlag.resolvedAt).toLocaleString()}</div>
                      )}
                      {selectedFlag.adminNotes && (
                        <div>
                          <strong>Admin Notes:</strong>
                          <p className="bg-muted p-2 rounded mt-1">{selectedFlag.adminNotes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialog(false)}>
                Close
              </Button>
              <Button 
                onClick={() => selectedFlag && window.open(selectedFlag.submission.url, '_blank')}
              >
                View Original Content
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

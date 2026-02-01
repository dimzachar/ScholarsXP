'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AuthGuard from '@/components/Auth/AuthGuard'
import { AdminGuard } from '@/components/Auth/RoleGuard'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { REVIEWER_ROLES, isAdmin } from '@/lib/roles'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, Loader2, PauseCircle, PlayCircle, RefreshCw, Shield, Users, XCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type AvailabilityMode = 'available' | 'temporary' | 'indefinite'

interface ReviewerRecord {
  id: string
  username: string | null
  email: string
  role: string
  totalXp: number
  missedReviews?: number
  activeAssignments?: number
  lastActiveAt?: string | null
  lastLoginAt?: string | null
  createdAt?: string
  reviewerOptOut?: boolean
  reviewerOptOutUntil?: string | null
  reviewerOptOutActive?: boolean
  metrics?: {
    totalReviews?: number
    submissionSuccessRate?: number
    reliabilityScore?: number | null
  }
}

export default function ReviewerAvailabilityPage() {
  const { user: _user } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()
  const [reviewers, setReviewers] = useState<ReviewerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<string>('username')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedReviewer, setSelectedReviewer] = useState<ReviewerRecord | null>(null)
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>('available')
  const [availabilityDate, setAvailabilityDate] = useState('')

  const fetchReviewers = useCallback(async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams({
        limit: '200',
        includeLogin: '1'
      })

      const serverSortable = new Set(['username', 'role', 'lastActiveAt', 'createdAt'])
      if (serverSortable.has(sortBy)) {
        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)
      } else {
        // Default server order; client will sort afterwards
        params.set('sortBy', 'username')
        params.set('sortOrder', 'asc')
      }

      const response = await authenticatedFetch(`/api/admin/users?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to load reviewer availability')
      }

      const data = await response.json()
      let reviewerCandidates: ReviewerRecord[] = (data.users || []).filter(
        (user: ReviewerRecord) => user && REVIEWER_ROLES.includes(user.role as any)
      )

      // Client-side sort for unsupported keys
      if (!serverSortable.has(sortBy)) {
        const getVal = (u: ReviewerRecord) => {
          if (sortBy === 'reviews') return u.metrics?.totalReviews ?? 0
          if (sortBy === 'lastLoginAt') return u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0
          if (sortBy === 'reliability') return u.metrics?.reliabilityScore ?? 0
          return 0
        }
        reviewerCandidates = reviewerCandidates.sort((a, b) => {
          const va = getVal(a) as number
          const vb = getVal(b) as number
          return sortOrder === 'asc' ? va - vb : vb - va
        })
      }

      setReviewers(reviewerCandidates)
    } catch (error) {
      console.error('Error fetching reviewer availability:', error)
      toast.error('Unable to load reviewer availability data')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, sortBy, sortOrder])

  useEffect(() => {
    fetchReviewers()
  }, [fetchReviewers])

  // Calculate pool eligibility and priority for a reviewer
  const getPoolEligibility = useCallback((reviewer: ReviewerRecord, allReviewers: ReviewerRecord[]): { 
    inPool: boolean
    reasons: string[]
    priority?: number
    priorityNote?: string 
  } => {
    const reasons: string[] = []
    const MAX_ACTIVE_ASSIGNMENTS = 5
    const MIN_XP_REQUIRED = 50
    const MAX_MISSED_REVIEWS = 3

    // Check if opted out
    if (reviewer.reviewerOptOutActive) {
      reasons.push(reviewer.reviewerOptOut ? 'Paused indefinitely' : 'Temporarily paused')
    }

    // Check missed reviews
    if ((reviewer.missedReviews || 0) > MAX_MISSED_REVIEWS) {
      reasons.push(`Too many missed reviews (${reviewer.missedReviews})`)
    }

    // Check XP requirement (ADMINs and DEVELOPERs exempt)
    if ((reviewer.totalXp || 0) < MIN_XP_REQUIRED && !isAdmin(reviewer.role)) {
      reasons.push(`Insufficient XP (${reviewer.totalXp || 0}/${MIN_XP_REQUIRED})`)
    }

    // Check workload cap
    if ((reviewer.activeAssignments || 0) >= MAX_ACTIVE_ASSIGNMENTS) {
      reasons.push(`At capacity (${reviewer.activeAssignments}/${MAX_ACTIVE_ASSIGNMENTS} assignments)`)
    }

    const inPool = reasons.length === 0

    // Calculate priority rank among eligible reviewers
    if (inPool) {
      const eligibleReviewers = allReviewers.filter(r => {
        if (r.reviewerOptOutActive) return false
        if ((r.missedReviews || 0) > MAX_MISSED_REVIEWS) return false
        if ((r.totalXp || 0) < MIN_XP_REQUIRED && !isAdmin(r.role)) return false
        if ((r.activeAssignments || 0) >= MAX_ACTIVE_ASSIGNMENTS) return false
        return true
      })

      // Sort by workload (asc) then XP (desc) - same as reviewer-pool.ts
      const sorted = [...eligibleReviewers].sort((a, b) => {
        const aAssign = a.activeAssignments || 0
        const bAssign = b.activeAssignments || 0
        if (aAssign !== bAssign) return aAssign - bAssign
        return (b.totalXp || 0) - (a.totalXp || 0)
      })

      const priority = sorted.findIndex(r => r.id === reviewer.id) + 1
      const totalEligible = sorted.length

      let priorityNote = ''
      if (priority <= 3) {
        priorityNote = 'High priority - likely to be selected'
      } else if (priority <= Math.ceil(totalEligible / 2)) {
        priorityNote = 'Medium priority'
      } else {
        priorityNote = 'Low priority - higher XP reviewers selected first'
      }

      return { inPool, reasons, priority, priorityNote }
    }

    return { inPool, reasons }
  }, [])

  const summary = useMemo(() => {
    const total = reviewers.length
    const paused = reviewers.filter(r => r.reviewerOptOutActive).length
    const indefinite = reviewers.filter(r => r.reviewerOptOut === true).length
    const temporary = Math.max(paused - indefinite, 0)
    const inPool = reviewers.filter(r => getPoolEligibility(r, reviewers).inPool).length

    return { total, paused, indefinite, temporary, inPool }
  }, [reviewers, getPoolEligibility])

  const resetDialogState = () => {
    setDialogOpen(false)
    setSelectedReviewer(null)
    setAvailabilityMode('available')
    setAvailabilityDate('')
  }

  const openDialogForReviewer = (reviewer: ReviewerRecord) => {
    setSelectedReviewer(reviewer)

    if (reviewer.reviewerOptOut) {
      setAvailabilityMode('indefinite')
      setAvailabilityDate('')
    } else if (reviewer.reviewerOptOutUntil) {
      const untilDate = new Date(reviewer.reviewerOptOutUntil)
      if (!Number.isNaN(untilDate.getTime()) && untilDate.getTime() > Date.now()) {
        setAvailabilityMode('temporary')
        setAvailabilityDate(untilDate.toISOString().slice(0, 10))
      } else {
        setAvailabilityMode('available')
        setAvailabilityDate('')
      }
    } else {
      setAvailabilityMode('available')
      setAvailabilityDate('')
    }

    setDialogOpen(true)
  }

  const applyAvailability = async (
    reviewer: ReviewerRecord,
    payload: {
      reviewerOptOut: boolean
      reviewerOptOutUntil: string | null
      mode: AvailabilityMode
    }
  ) => {
    try {
      setUpdatingUserId(reviewer.id)

      const response = await authenticatedFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'setReviewAvailability',
          userIds: [reviewer.id],
          data: {
            reviewerOptOut: payload.reviewerOptOut,
            reviewerOptOutUntil: payload.reviewerOptOutUntil,
            mode: payload.mode
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update review availability')
      }

      toast.success('Review availability updated')
      await fetchReviewers()
      resetDialogState()
    } catch (error) {
      console.error('Error updating review availability:', error)
      toast.error('Could not update reviewer availability')
    } finally {
      setUpdatingUserId(null)
    }
  }

  const handleQuickToggle = async (reviewer: ReviewerRecord) => {
    await applyAvailability(reviewer, {
      reviewerOptOut: reviewer.reviewerOptOutActive ? false : true,
      reviewerOptOutUntil: reviewer.reviewerOptOutActive ? null : null,
      mode: reviewer.reviewerOptOutActive ? 'available' : 'indefinite'
    })
  }

  const handleDialogSubmit = async () => {
    if (!selectedReviewer) return

    if (availabilityMode === 'temporary') {
      if (!availabilityDate) {
        toast.error('Select a date when the reviewer should return')
        return
      }

      const until = new Date(availabilityDate)
      until.setUTCHours(23, 59, 59, 999)

      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        toast.error('Choose a future date for reviewer return')
        return
      }

      await applyAvailability(selectedReviewer, {
        reviewerOptOut: false,
        reviewerOptOutUntil: until.toISOString(),
        mode: 'temporary'
      })
      return
    }

    if (availabilityMode === 'indefinite') {
      await applyAvailability(selectedReviewer, {
        reviewerOptOut: true,
        reviewerOptOutUntil: null,
        mode: 'indefinite'
      })
      return
    }

    await applyAvailability(selectedReviewer, {
      reviewerOptOut: false,
      reviewerOptOutUntil: null,
      mode: 'available'
    })
  }

  const formatStatus = (reviewer: ReviewerRecord) => {
    if (reviewer.reviewerOptOut) {
      return 'Paused (indefinite)'
    }

    if (reviewer.reviewerOptOutActive && reviewer.reviewerOptOutUntil) {
      return `Paused until ${new Date(reviewer.reviewerOptOutUntil).toLocaleDateString()}`
    }

    return 'Available for auto-assign'
  }

  const renderStatusBadge = (reviewer: ReviewerRecord) => {
    if (reviewer.reviewerOptOut) {
      return <Badge variant="destructive">Paused indefinitely</Badge>
    }

    if (reviewer.reviewerOptOutActive && reviewer.reviewerOptOutUntil) {
      return <Badge variant="outline">Paused until {new Date(reviewer.reviewerOptOutUntil).toLocaleDateString()}</Badge>
    }

    return <Badge variant="secondary">Auto-assign enabled</Badge>
  }

  const formatLastActive = (isoDate?: string | null) => {
    if (!isoDate) return '-'
    const d = new Date(isoDate)
    if (Number.isNaN(d.getTime())) return '-'
    const diffMs = Date.now() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return 'Today'
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 30) return `${diffDays} days ago`
    return d.toLocaleDateString()
  }

  const onSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  return (
    <AuthGuard>
      <AdminGuard>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Reviewer Availability
                </CardTitle>
                <CardDescription>
                  Control which admins and reviewers receive automatic peer review assignments.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchReviewers} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Total reviewers</p>
                  <p className="text-2xl font-semibold">{summary.total}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                  <p className="text-sm text-muted-foreground">In active pool</p>
                  <p className="text-2xl font-semibold text-green-700 dark:text-green-400">{summary.inPool}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Temporarily paused</p>
                  <p className="text-2xl font-semibold">{summary.temporary}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Indefinitely paused</p>
                  <p className="text-2xl font-semibold">{summary.indefinite}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button className="flex items-center gap-1" onClick={() => onSort('username')}>
                          Reviewer
                          {sortBy === 'username' ? (
                            <span className="text-xs text-muted-foreground">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button className="flex items-center gap-1" onClick={() => onSort('role')}>
                          Role
                          {sortBy === 'role' ? (
                            <span className="text-xs text-muted-foreground">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        <button className="flex items-center gap-1" onClick={() => onSort('reviews')}>
                          Reviews
                          {sortBy === 'reviews' ? (
                            <span className="text-xs text-muted-foreground">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        <button className="flex items-center gap-1" onClick={() => onSort('lastLoginAt')}>
                          Last Login
                          {sortBy === 'lastLoginAt' ? (
                            <span className="text-xs text-muted-foreground">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        <button className="flex items-center gap-1" onClick={() => onSort('reliability')}>
                          Reliability
                          {sortBy === 'reliability' ? (
                            <span className="text-xs text-muted-foreground">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead>In Pool</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground">Loading reviewer availability…</p>
                        </TableCell>
                      </TableRow>
                    ) : reviewers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No reviewers found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      reviewers.map(reviewer => {
                        const displayName = reviewer.username || reviewer.email.split('@')[0]
                        return (
                          <TableRow key={reviewer.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{displayName}</span>
                                <span className="text-xs text-muted-foreground">{reviewer.email}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={isAdmin(reviewer.role) ? 'destructive' : 'secondary'} className="flex w-fit items-center gap-1">
                                <Shield className="h-3.5 w-3.5" />
                                {reviewer.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {reviewer.metrics?.totalReviews ?? 0}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {formatLastActive(reviewer.lastLoginAt ?? reviewer.lastActiveAt ?? null)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {reviewer.metrics?.reliabilityScore !== null && reviewer.metrics?.reliabilityScore !== undefined
                                ? `${Math.round(reviewer.metrics.reliabilityScore * 100)}%`
                                : '-'
                              }
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const { inPool, reasons, priority, priorityNote } = getPoolEligibility(reviewer, reviewers)
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center justify-center gap-1">
                                          {inPool ? (
                                            <>
                                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                                              {priority && (
                                                <span className="text-xs text-muted-foreground">#{priority}</span>
                                              )}
                                            </>
                                          ) : (
                                            <XCircle className="h-5 w-5 text-red-500" />
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {inPool ? (
                                          <div className="space-y-1">
                                            <p className="font-medium">Priority #{priority} of {summary.inPool}</p>
                                            <p className="text-sm text-muted-foreground">{priorityNote}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              XP: {reviewer.totalXp || 0} | Active: {reviewer.activeAssignments || 0}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="space-y-1">
                                            <p className="font-medium">Excluded from pool:</p>
                                            <ul className="list-disc pl-4 text-sm">
                                              {reasons.map((reason, i) => (
                                                <li key={i}>{reason}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )
                              })()}
                            </TableCell>
                            <TableCell>{renderStatusBadge(reviewer)}</TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                              {formatStatus(reviewer)}
                            </TableCell>
                            <TableCell className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuickToggle(reviewer)}
                                disabled={updatingUserId === reviewer.id}
                              >
                                {updatingUserId === reviewer.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : reviewer.reviewerOptOutActive ? (
                                  <PlayCircle className="mr-2 h-4 w-4" />
                                ) : (
                                  <PauseCircle className="mr-2 h-4 w-4" />
                                )}
                                {reviewer.reviewerOptOutActive ? 'Enable' : 'Pause'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openDialogForReviewer(reviewer)}
                              >
                                <CalendarClock className="mr-2 h-4 w-4" />
                                Schedule
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={(open) => !open ? resetDialogState() : setDialogOpen(open)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Review Availability</DialogTitle>
                <DialogDescription>
                  Choose how this reviewer should participate in automatic peer review assignments.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="availability-mode">Availability</Label>
                  <Select
                    value={availabilityMode}
                    onValueChange={(value: AvailabilityMode) => setAvailabilityMode(value)}
                  >
                    <SelectTrigger id="availability-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available for auto-assign</SelectItem>
                      <SelectItem value="temporary">Pause until specific date</SelectItem>
                      <SelectItem value="indefinite">Pause indefinitely</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {availabilityMode === 'temporary' && (
                  <div className="space-y-2">
                    <Label htmlFor="availability-date">Return date</Label>
                    <Input
                      id="availability-date"
                      type="date"
                      value={availabilityDate}
                      onChange={(event) => setAvailabilityDate(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The reviewer will automatically rejoin the assignment pool on the selected day.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetDialogState}>
                  Cancel
                </Button>
                <Button onClick={handleDialogSubmit} disabled={updatingUserId === selectedReviewer?.id}>
                  {updatingUserId === selectedReviewer?.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminGuard>
    </AuthGuard>
  )
}

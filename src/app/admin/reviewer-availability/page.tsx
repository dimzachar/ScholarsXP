'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AuthGuard from '@/components/Auth/AuthGuard'
import { AdminGuard } from '@/components/Auth/RoleGuard'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { CalendarClock, Loader2, PauseCircle, PlayCircle, RefreshCw, Shield, Users } from 'lucide-react'

type AvailabilityMode = 'available' | 'temporary' | 'indefinite'

interface ReviewerRecord {
  id: string
  username: string | null
  email: string
  role: string
  reviewerOptOut?: boolean
  reviewerOptOutUntil?: string | null
  reviewerOptOutActive?: boolean
  metrics?: {
    totalReviews?: number
    submissionSuccessRate?: number
  }
}

export default function ReviewerAvailabilityPage() {
  const { session } = useAuth()
  const [reviewers, setReviewers] = useState<ReviewerRecord[]>([])
  const [loading, setLoading] = useState(true)
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
        sortBy: 'username',
        sortOrder: 'asc'
      })

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load reviewer availability')
      }

      const data = await response.json()
      const reviewerCandidates: ReviewerRecord[] = (data.users || []).filter(
        (user: ReviewerRecord) => user && ['REVIEWER', 'ADMIN'].includes(user.role)
      )

      setReviewers(reviewerCandidates)
    } catch (error) {
      console.error('Error fetching reviewer availability:', error)
      toast.error('Unable to load reviewer availability data')
    } finally {
      setLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    fetchReviewers()
  }, [fetchReviewers])

  const summary = useMemo(() => {
    const total = reviewers.length
    const paused = reviewers.filter(r => r.reviewerOptOutActive).length
    const indefinite = reviewers.filter(r => r.reviewerOptOut === true).length
    const temporary = Math.max(paused - indefinite, 0)

    return { total, paused, indefinite, temporary }
  }, [reviewers])

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

      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Total reviewers</p>
                  <p className="text-2xl font-semibold">{summary.total}</p>
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
                      <TableHead>Reviewer</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground">Loading reviewer availability…</p>
                        </TableCell>
                      </TableRow>
                    ) : reviewers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
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
                              <Badge variant={reviewer.role === 'ADMIN' ? 'destructive' : 'secondary'} className="flex w-fit items-center gap-1">
                                <Shield className="h-3.5 w-3.5" />
                                {reviewer.role}
                              </Badge>
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

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { formatReliabilityPercent } from '@/lib/reviewer-ranking'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────── */

interface ReliabilitySnapshot {
  id: string
  userId: string
  username: string | null
  score: number
  formulaId: string
  delta: number | null
  source: string
  snapshotDate: string
}

interface ReliabilityAggregate {
  date: string
  avgScore: number
  minScore: number
  maxScore: number
  reviewerCount: number
}

interface ReliabilityHistoryResponse {
  snapshots: ReliabilitySnapshot[]
  aggregate: ReliabilityAggregate[]
  total: number
  page: number
  pageSize: number
}

/* ── Helpers ────────────────────────────────────────── */

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDelta(delta: number | null): { text: string; sign: 'pos' | 'neg' | 'zero' } {
  if (delta == null) {
    return { text: '—', sign: 'zero' }
  }
  if (delta === 0) {
    return { text: '0', sign: 'zero' }
  }
  if (delta > 0) {
    return { text: `+${(delta * 100).toFixed(1)}%`, sign: 'pos' }
  }
  return { text: `${(delta * 100).toFixed(1)}%`, sign: 'neg' }
}

const DAY_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
] as const

const SOURCE_META: Record<string, { badgeClass: string; label: string }> = {
  daily_cron: { badgeClass: 'bg-primary/10 text-primary', label: 'Daily Cron' },
  review_submitted: { badgeClass: 'bg-emerald-500/10 text-emerald-600', label: 'Review Submitted' },
  vote_validation: { badgeClass: 'bg-purple-500/10 text-purple-600', label: 'Vote Validation' },
  missed_review: { badgeClass: 'bg-rose-500/10 text-rose-600', label: 'Missed Review' },
  admin_penalty: { badgeClass: 'bg-amber-500/10 text-amber-600', label: 'Admin Penalty' },
}

function sourceBadgeClass(source: string): string {
  return SOURCE_META[source]?.badgeClass ?? 'bg-muted text-muted-foreground'
}

function sourceLabel(source: string): string {
  return SOURCE_META[source]?.label ?? source.replace(/_/g, ' ')
}

/* ── Custom Tooltip ─────────────────────────────────── */

function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-sm">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-medium">
          Avg: {formatReliabilityPercent(entry.value)}
        </p>
      ))}
    </div>
  )
}

/* ── Component ──────────────────────────────────────── */

export default function ReliabilityHistoryTab() {
  const { authenticatedFetch } = useAuthenticatedFetch()

  /* ── State ── */
  const [data, setData] = useState<ReliabilityHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)

  const [days, setDays] = useState(30)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  /* ── All reviewers for the dropdown (fetched separately) ── */
  const [allReviewers, setAllReviewers] = useState<Array<{ id: string; username: string }>>([])

  useEffect(() => {
    authenticatedFetch('/api/admin/analytics/reviewers')
      .then(r => r.json())
      .then(json => {
        const reviewers = json?.reviewers ?? []
        setAllReviewers(
          reviewers.map((r: any) => ({
            id: r.id,
            username: r.username || r.email?.split('@')[0] || 'Unknown',
          }))
        )
      })
      .catch(() => {
        // Non-critical — fall back to snapshot-derived list
      })
  }, [authenticatedFetch])

  /* ── Fallback user list from snapshots (when API fetch fails) ── */
  const users = useMemo<Array<{ id: string; username: string }>>(() => {
    if (!data || allReviewers.length > 0) return []
    const seen = new Set<string>()
    const result: Array<{ id: string; username: string }> = []
    for (const s of data.snapshots) {
      if (!seen.has(s.userId)) {
        seen.add(s.userId)
        result.push({ id: s.userId, username: s.username ?? 'Unknown' })
      }
    }
    return result.sort((a, b) => a.username.localeCompare(b.username))
  }, [data, allReviewers.length])

  /* ── Fetch ── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        days: String(days),
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      })
      if (selectedUserId) {
        params.set('userId', selectedUserId)
      }

      const res = await authenticatedFetch(
        `/api/admin/reliability-history?${params.toString()}`
      )
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        throw new Error(`API error ${res.status}: ${text}`)
      }

      const json = await res.json()
      const payload: ReliabilityHistoryResponse =
        json?.data ?? json ?? { snapshots: [], aggregate: [], total: 0, page: 1, pageSize }

      // If server didn't send pagination fields, supply defaults
      if (typeof payload.total !== 'number') payload.total = payload.snapshots?.length ?? 0
      if (typeof payload.page !== 'number') payload.page = 1
      if (typeof payload.pageSize !== 'number') payload.pageSize = pageSize
      if (!Array.isArray(payload.snapshots)) payload.snapshots = []
      if (!Array.isArray(payload.aggregate)) payload.aggregate = []

      setData(payload)
    } catch (err) {
      console.error('Error fetching reliability history:', err)
      setError(err instanceof Error ? err.message : 'Failed to load reliability history')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, days, page, pageSize, selectedUserId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Handlers ── */
  const handleDaysChange = (newDays: number) => {
    setDays(newDays)
    setPage(1)
  }

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId === 'all' ? '' : userId)
    setPage(1)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  /* ── Loading skeleton ── */
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="mt-1 h-4 w-72 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-[300px] animate-pulse rounded-lg bg-muted" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ── Error state ── */
  if (error && !data) {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
            Reliability History Unavailable
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  /* ── Empty state ── */
  if (!data || (data.snapshots.length === 0 && data.aggregate.length === 0)) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <p className="text-sm text-muted-foreground">No reliability history data available yet.</p>
          <p className="text-xs text-muted-foreground">Click Backfill History to compute weekly snapshots from each reviewer's first review, or wait for events (reviews, votes, missed deadlines) to auto-create snapshots.</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                setBackfilling(true)
                setBackfillResult(null)
                try {
                  const res = await authenticatedFetch('/api/admin/reliability-backfill', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weeksBack: 16 }),
                  })
                  const json = await res.json()
                  if (res.ok) {
                    setBackfillResult(json.message || `Created ${json.snapshotsCreated} snapshots`)
                    fetchData()
                  } else {
                    setBackfillResult(`Error: ${json.error}`)
                  }
                } catch (err) {
                  setBackfillResult('Failed to backfill')
                } finally {
                  setBackfilling(false)
                }
              }}
              disabled={backfilling}
            >
              <History className={cn('mr-2 h-4 w-4', backfilling && 'animate-spin')} />
              {backfilling ? 'Backfilling…' : 'Backfill History'}
            </Button>
          </div>
          {backfillResult && (
            <p className="text-xs text-muted-foreground">{backfillResult}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  const aggregate = data.aggregate ?? []
  const snapshots = data.snapshots ?? []

  return (
    <div className="space-y-6">
      {/* ── Chart ── */}
      {selectedUserId ? (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Individual Reliability History</CardTitle>
            <CardDescription>
              Per-reviewer history is shown in the table below, filtered by the selected user.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              Individual score progression will appear here once more snapshots accumulate.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Average Reliability Over Time</CardTitle>
            <CardDescription>
              Daily mean reliability score across all reviewers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aggregate.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No aggregate data for the selected time range.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={aggregate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(val: string) => {
                      const d = new Date(val + 'T00:00:00')
                      return Number.isNaN(d.getTime())
                        ? val
                        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(val: number) => `${(val * 100).toFixed(0)}%`}
                  />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    name="Avg Reliability"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range */}
        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          {DAY_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={days === opt.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleDaysChange(opt.value)}
              className="h-8 px-3 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* User filter */}
        <Select value={selectedUserId || 'all'} onValueChange={handleUserChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Reviewers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reviewers</SelectItem>
            {(allReviewers.length > 0 ? allReviewers : users).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            setBackfilling(true)
            setBackfillResult(null)
            try {
              const res = await authenticatedFetch('/api/admin/reliability-backfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weeksBack: 16 }),
              })
              const json = await res.json()
              if (res.ok) {
                setBackfillResult(json.message || `Created ${json.snapshotsCreated} snapshots`)
                fetchData()
              } else {
                setBackfillResult(`Error: ${json.error}`)
              }
            } catch (err) {
              setBackfillResult('Failed to backfill')
            } finally {
              setBackfilling(false)
            }
          }}
          disabled={backfilling}
        >
          <History className={cn('mr-2 h-4 w-4', backfilling && 'animate-spin')} />
          {backfilling ? 'Backfilling…' : 'Backfill History'}
        </Button>

        {backfillResult && (
          <p className="w-full text-xs text-muted-foreground">{backfillResult}</p>
        )}
      </div>

      {/* ── Log Table ── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Reliability Change Log</CardTitle>
          <CardDescription>
            Detailed record of reliability score changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Previous Score</TableHead>
                  <TableHead>New Score</TableHead>
                  <TableHead>Delta</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No snapshots match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  snapshots.map((snap) => {
                    const deltaInfo = formatDelta(snap.delta)
                    const prevScore =
                      snap.delta != null
                        ? snap.score - snap.delta
                        : snap.score

                    return (
                      <TableRow key={snap.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(snap.snapshotDate)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {snap.username ?? 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                              prevScore > snap.score
                                ? 'bg-rose-500/10 text-rose-600'
                                : prevScore < snap.score
                                  ? 'bg-emerald-500/10 text-emerald-600'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {formatReliabilityPercent(prevScore)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                              snap.score > prevScore
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : snap.score < prevScore
                                  ? 'bg-rose-500/10 text-rose-600'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {formatReliabilityPercent(snap.score)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                              deltaInfo.sign === 'pos' && 'bg-emerald-500/10 text-emerald-600',
                              deltaInfo.sign === 'neg' && 'bg-rose-500/10 text-rose-600',
                              deltaInfo.sign === 'zero' && 'text-muted-foreground'
                            )}
                          >
                            {deltaInfo.sign === 'pos' && '▲'}
                            {deltaInfo.sign === 'neg' && '▼'}
                            {deltaInfo.text}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('text-xs', sourceBadgeClass(snap.source))}
                          >
                            {sourceLabel(snap.source)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* ── Pagination ── */}
          {snapshots.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {data.page} of {totalPages} ({data.total} total entries)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Loading overlay for subsequent fetches ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Refreshing…
        </div>
      ) : null}
    </div>
  )
}

'use client'

import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  XAxis,
  YAxis
} from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Gauge,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { formatReliabilityPercent } from '@/lib/reviewer-ranking'
import { cn } from '@/lib/utils'
import type {
  ReviewerAnalyticsDashboard,
  ReviewerDashboardRow,
  ReviewerPoolState
} from '@/lib/reviewer-dashboard'

type ReviewerRosterFilter = 'all' | 'eligible' | 'paused' | 'underused' | 'risk'

interface ReviewerAnalyticsTabProps {
  data: ReviewerAnalyticsDashboard | null
  error?: string | null
  loading?: boolean
  onRefresh?: () => void
}

const workloadChartConfig = {
  assignmentsReceived: {
    label: 'Assignments',
    color: 'hsl(var(--chart-1))'
  },
  reviewsSubmitted: {
    label: 'Reviews Submitted',
    color: 'hsl(var(--chart-2))'
  },
  missedAssignments: {
    label: 'Missed',
    color: 'hsl(var(--chart-5))'
  }
} satisfies ChartConfig

const concentrationChartConfig = {
  periodAssignmentSharePct: {
    label: 'Share of assignments',
    color: 'hsl(var(--chart-3))'
  }
} satisfies ChartConfig

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }

  return `${value.toFixed(digits)}%`
}

function formatTrendLabel(bucketStart: string, granularity: 'day' | 'week' | 'month'): string {
  const date = new Date(bucketStart)
  if (Number.isNaN(date.getTime())) {
    return bucketStart
  }

  if (granularity === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }

  if (granularity === 'day') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateRange(dateValue: string | null): string {
  if (!dateValue) {
    return 'No recent activity'
  }

  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) {
    return 'No recent activity'
  }

  return parsed.toLocaleDateString()
}

function getPoolStateBadge(state: ReviewerPoolState): string {
  switch (state) {
    case 'eligible':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
    case 'temporarily_paused':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-700'
    case 'permanently_paused':
      return 'border-rose-500/20 bg-rose-500/10 text-rose-700'
    case 'opted_out':
      return 'border-slate-500/20 bg-slate-500/10 text-slate-700'
    case 'below_xp_gate':
      return 'border-sky-500/20 bg-sky-500/10 text-sky-700'
    case 'at_capacity':
      return 'border-violet-500/20 bg-violet-500/10 text-violet-700'
    default:
      return ''
  }
}

function getPoolStateLabel(state: ReviewerPoolState): string {
  switch (state) {
    case 'eligible':
      return 'Eligible'
    case 'temporarily_paused':
      return 'Temp pause'
    case 'permanently_paused':
      return 'Permanent ban'
    case 'opted_out':
      return 'Opted out'
    case 'below_xp_gate':
      return 'Below XP gate'
    case 'at_capacity':
      return 'At capacity'
    default:
      return state
  }
}

function getConcentrationTone(value: number): {
  label: string
  badgeClass: string
  description: string
} {
  if (value >= 60) {
    return {
      label: 'High concentration',
      badgeClass: 'border-rose-500/20 bg-rose-500/10 text-rose-700',
      description: 'A small group is carrying most assignments.'
    }
  }

  if (value >= 45) {
    return {
      label: 'Watch closely',
      badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-700',
      description: 'Distribution is workable, but load is clustering.'
    }
  }

  return {
    label: 'Balanced',
    badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
    description: 'Assignments are spread across the reviewer pool.'
  }
}

function getFilterLabel(filter: ReviewerRosterFilter): string {
  switch (filter) {
    case 'eligible':
      return 'Eligible'
    case 'paused':
      return 'Paused'
    case 'underused':
      return 'Underused'
    case 'risk':
      return 'Risk'
    case 'all':
    default:
      return 'All'
  }
}

function renderInsightList(
  title: string,
  description: string,
  rows: ReviewerDashboardRow[],
  emptyMessage: string,
  accentClassName: string,
  metaRenderer: (row: ReviewerDashboardRow) => React.ReactNode
) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className={cn('text-base', accentClassName)}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/60 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{row.label}</p>
                  <Badge className={cn('text-[10px]', getPoolStateBadge(row.currentPoolState))}>
                    {getPoolStateLabel(row.currentPoolState)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.role} · {row.totalXp.toLocaleString()} XP · {row.totalReviewsAllTime} reviews lifetime
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {metaRenderer(row)}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export default function ReviewerAnalyticsTab({
  data,
  error,
  loading = false,
  onRefresh
}: ReviewerAnalyticsTabProps) {
  const [search, setSearch] = useState('')
  const [rosterFilter, setRosterFilter] = useState<ReviewerRosterFilter>('all')

  const reviewerIdSets = useMemo(() => {
    const makeSet = (rows: ReviewerDashboardRow[]) => new Set(rows.map(row => row.id))

    return {
      underused: makeSet(data?.insights.underusedReliable || []),
      risk: makeSet(data?.insights.riskWatch || [])
    }
  }, [data])

  const filteredRows = useMemo(() => {
    if (!data) {
      return []
    }

    const normalizedSearch = search.trim().toLowerCase()

    return data.reviewers.filter((row) => {
      const searchMatch = normalizedSearch.length === 0 ||
        row.label.toLowerCase().includes(normalizedSearch) ||
        row.email.toLowerCase().includes(normalizedSearch) ||
        row.role.toLowerCase().includes(normalizedSearch)

      if (!searchMatch) {
        return false
      }

      switch (rosterFilter) {
        case 'eligible':
          return row.isEligibleNow
        case 'paused':
          return row.currentPoolState === 'temporarily_paused' ||
            row.currentPoolState === 'permanently_paused' ||
            row.currentPoolState === 'opted_out'
        case 'underused':
          return reviewerIdSets.underused.has(row.id)
        case 'risk':
          return reviewerIdSets.risk.has(row.id)
        case 'all':
        default:
          return true
      }
    })
  }, [data, reviewerIdSets, rosterFilter, search])

  const trendData = useMemo(() => {
    if (!data) {
      return []
    }

    return data.trends.map((point) => ({
      ...point,
      label: formatTrendLabel(point.bucketStart, data.granularity)
    }))
  }, [data])

  const concentrationData = useMemo(() => {
    if (!data) {
      return []
    }

    return data.concentration.map((row) => ({
      ...row,
      label: row.label.length > 16 ? `${row.label.slice(0, 16)}…` : row.label
    }))
  }, [data])

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="border-border/60">
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-8 w-24 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
            Reviewer Analytics Unavailable
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        {onRefresh ? (
          <CardContent>
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        ) : null}
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-sm text-muted-foreground">
          No reviewer analytics data available.
        </CardContent>
      </Card>
    )
  }

  const concentrationTone = getConcentrationTone(data.summary.top3AssignmentSharePct)

  const summaryCards = [
    {
      label: 'Eligible Now',
      value: `${data.summary.eligibleNow}/${data.summary.totalReviewerRoles}`,
      detail: `${data.summary.activeAssignmentsNow} active assignments currently open`,
      icon: ShieldCheck,
      className: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700'
    },
    {
      label: 'Assigned In Window',
      value: data.summary.reviewersAssignedInPeriod.toString(),
      detail: `${data.summary.reviewersSubmittingReviewsInPeriod} reviewers actually submitted reviews`,
      icon: Users,
      className: 'border-sky-500/20 bg-sky-500/5 text-sky-700'
    },
    {
      label: 'Total Assignments',
      value: formatCompactNumber(data.summary.totalAssignmentsInPeriod),
      detail: `${data.summary.totalReviewsSubmittedInPeriod} submitted reviews in the same window`,
      icon: Gauge,
      className: 'border-violet-500/20 bg-violet-500/5 text-violet-700'
    },
    {
      label: 'Top 3 Share',
      value: formatPercent(data.summary.top3AssignmentSharePct, 1),
      detail: concentrationTone.description,
      icon: ShieldAlert,
      className: concentrationTone.badgeClass
    },
    {
      label: 'Missed Assignments',
      value: data.summary.totalMissedAssignmentsInPeriod.toString(),
      detail: `${data.summary.highRiskCount} reviewers are on the current risk watch`,
      icon: AlertTriangle,
      className: 'border-amber-500/20 bg-amber-500/5 text-amber-700'
    },
    {
      label: 'Underused Reliable',
      value: data.summary.underusedReliableCount.toString(),
      detail: `${data.summary.eligibleWithoutAssignmentsInPeriod} eligible reviewers received no assignments`,
      icon: ArrowRight,
      className: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-700'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/30">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.8fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Gauge className="h-4 w-4" />
              Reviewer operations
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Assignment balance, pool health, and risk</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                This tab is built to answer who is carrying the queue, who can safely take more work, and where
                missed reviews or pauses are shrinking the pool.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {formatDateRange(data.dateRange.start)} to {formatDateRange(data.dateRange.end)}
              </Badge>
              <Badge className={cn('border', concentrationTone.badgeClass)}>
                {concentrationTone.label}
              </Badge>
              <Badge variant="outline">
                Coverage {formatPercent(data.summary.distributionCoveragePct, 0)}
              </Badge>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Decision snapshot</p>
                <p className="text-3xl font-semibold">{formatPercent(data.summary.top5AssignmentSharePct, 1)}</p>
              </div>
              <Badge className={cn('border', concentrationTone.badgeClass)}>Top 5 share</Badge>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Median assignments per assigned reviewer</span>
                <span className="font-medium">{data.summary.medianAssignmentsPerAssignedReviewer.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg assignments per assigned reviewer</span>
                <span className="font-medium">{data.summary.avgAssignmentsPerAssignedReviewer.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Zero-reviewer accounts</span>
                <span className="font-medium">{data.summary.zeroReviewersAllTime}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className={cn('border', card.className)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{card.value}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
                </div>
                <card.icon className="mt-1 h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Assignments vs reviews over time</CardTitle>
            <CardDescription>
              This helps answer whether assignment flow is broadening or staying concentrated week to week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={workloadChartConfig} className="min-h-[320px] w-full">
              <ComposedChart data={trendData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar
                  dataKey="assignmentsReceived"
                  fill="var(--color-assignmentsReceived)"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="reviewsSubmitted"
                  fill="var(--color-reviewsSubmitted)"
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="missedAssignments"
                  stroke="var(--color-missedAssignments)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Pool health right now</CardTitle>
            <CardDescription>
              Current eligibility based on pause state, XP gate, and assignment capacity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {data.currentPoolBreakdown.map((item) => {
              const percentage = data.summary.totalReviewerRoles > 0
                ? (item.value / data.summary.totalReviewerRoles) * 100
                : 0

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">
                      {item.value} · {percentage.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              )
            })}

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-sm font-medium">Decision value</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use this block to see whether the assignment problem is really distribution, or simply that the active
                pool is too small at the moment.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Assignment load spread</CardTitle>
            <CardDescription>How many reviewers received 0, low, medium, or heavy assignment volume.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.assignmentLoadBreakdown.map((item) => {
              const percentage = data.summary.totalReviewerRoles > 0
                ? (item.value / data.summary.totalReviewerRoles) * 100
                : 0

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.label} assignments</span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Reliability spread</CardTitle>
            <CardDescription>Current reliability distribution across reviewer-capable accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.reliabilityBreakdown.map((item) => {
              const percentage = data.summary.totalReviewerRoles > 0
                ? (item.value / data.summary.totalReviewerRoles) * 100
                : 0

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Next up in the current selector</CardTitle>
            <CardDescription>
              This mirrors the live pool ordering: lower workload, then higher reliability, then higher XP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.insights.nextUp.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                No eligible reviewers are currently in the pool.
              </div>
            ) : (
              data.insights.nextUp.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Reliability {formatReliabilityPercent(row.reliabilityScore)} · {row.totalXp.toLocaleString()} XP
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">#{row.currentPriority}</div>
                    <div className="text-xs text-muted-foreground">{row.activeAssignmentsNow} active</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Who is carrying the queue?</CardTitle>
            <CardDescription>
              Top reviewers by assignment share in the selected window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={concentrationChartConfig} className="min-h-[340px] w-full">
              <BarChart data={concentrationData} layout="vertical" margin={{ left: 16, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const payload = item.payload as ReviewerDashboardRow
                        return (
                          <div className="flex flex-col gap-1">
                            <span>{formatPercent(Number(value), 1)} of assignments</span>
                            <span>{payload.periodAssignmentsReceived} assignments</span>
                            <span>Reliability {formatReliabilityPercent(payload.reliabilityScore)}</span>
                          </div>
                        )
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="periodAssignmentSharePct"
                  fill="var(--color-periodAssignmentSharePct)"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {renderInsightList(
            'Underused but reliable',
            'Potential candidates if you want to broaden assignment distribution without dropping safeguards.',
            data.insights.underusedReliable,
            'No strong underused candidates matched the current threshold.',
            'text-indigo-700',
            (row) => (
              <>
                <div>{row.periodAssignmentsReceived} assigned</div>
                <div>#{row.currentPriority ?? '-'} in queue</div>
                <div>Reliability {formatReliabilityPercent(row.reliabilityScore)}</div>
              </>
            )
          )}

          {renderInsightList(
            'Heavy lifters',
            'Reviewers absorbing the largest share of assignments in this window.',
            data.insights.heavyLifters,
            'No review load recorded in this window.',
            'text-violet-700',
            (row) => (
              <>
                <div>{row.periodAssignmentsReceived} assigned</div>
                <div>{formatPercent(row.periodAssignmentSharePct, 1)} share</div>
                <div>{row.activeAssignmentsNow} active now</div>
              </>
            )
          )}

          {renderInsightList(
            'Risk watch',
            'Paused reviewers, repeated misses, or timeliness issues worth monitoring before changing assignment policy.',
            data.insights.riskWatch,
            'No immediate reviewer risk signals in the current window.',
            'text-amber-700',
            (row) => (
              <>
                <div>{row.periodAssignmentsMissed} missed in window</div>
                <div>{row.missedReviewsLifetime} missed lifetime</div>
                <div>On time {formatPercent(row.periodOnTimeRatePct, 0)}</div>
              </>
            )
          )}
        </div>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Reviewer roster</CardTitle>
            <CardDescription>
              Search and filter the full reviewer-capable roster to inspect fairness, pool health, and reliability side by side.
            </CardDescription>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reviewer, email, or role"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'eligible', 'paused', 'underused', 'risk'] as ReviewerRosterFilter[]).map((filter) => (
                <Button
                  key={filter}
                  variant={rosterFilter === filter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRosterFilter(filter)}
                >
                  {getFilterLabel(filter)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{filteredRows.length} reviewers shown</span>
            <span>
              {rosterFilter === 'all'
                ? 'Sorted by current selector priority, then assignment load.'
                : `Filtered view: ${getFilterLabel(rosterFilter).toLowerCase()}.`}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Reliability</TableHead>
                  <TableHead>Active Now</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Reviews</TableHead>
                  <TableHead>Missed</TableHead>
                  <TableHead>On Time</TableHead>
                  <TableHead>Avg Quality</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                      No reviewers matched this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.role} · {row.totalXp.toLocaleString()} XP · {row.totalReviewsAllTime} lifetime reviews
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge className={cn('text-[10px]', getPoolStateBadge(row.currentPoolState))}>
                            {getPoolStateLabel(row.currentPoolState)}
                          </Badge>
                          {row.currentPoolReasons[0] ? (
                            <div className="max-w-[220px] text-xs text-muted-foreground">
                              {row.currentPoolReasons[0]}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{row.currentPriority ? `#${row.currentPriority}` : '-'}</TableCell>
                      <TableCell>{formatReliabilityPercent(row.reliabilityScore)}</TableCell>
                      <TableCell>{row.activeAssignmentsNow}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{row.periodAssignmentsReceived}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatPercent(row.periodAssignmentSharePct, 1)} share
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{row.periodReviewsSubmitted}</div>
                          <div className="text-xs text-muted-foreground">
                            Align {formatPercent(row.periodConsensusAlignmentPct, 0)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{row.periodAssignmentsMissed}</div>
                          <div className="text-xs text-muted-foreground">
                            Lifetime {row.missedReviewsLifetime}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatPercent(row.periodOnTimeRatePct, 0)}</TableCell>
                      <TableCell>{row.avgQuality ? row.avgQuality.toFixed(2) : '-'}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{formatDateRange(row.lastActiveAt)}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.daysSinceLastActive === null ? '-' : `${row.daysSinceLastActive}d ago`}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4 animate-pulse" />
          Refreshing reviewer analytics…
        </div>
      ) : null}
    </div>
  )
}

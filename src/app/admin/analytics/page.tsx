'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { isAdmin } from '@/lib/roles'
import { getTaskDisplayInfo } from '@/lib/xp-rules-v2'
import ReviewerAnalyticsTab from '@/components/Admin/ReviewerAnalyticsTab'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  MessageSquare,
  Zap,
  Award,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar
} from 'lucide-react'
import type { ReviewerAnalyticsDashboard } from '@/lib/reviewer-dashboard'
// import { useRouter } from 'next/navigation'

interface AnalyticsData {
  overview: {
    totalUsers: number
    activeUsers: number
    totalSubmissions: number
    completedSubmissions: number
    totalReviews: number
    totalXpAwarded: number
    totalAchievements: number
    pendingFlags: number
    submissionSuccessRate: number
    avgReviewScore: number
  }
  timeSeriesData: Array<{
    date: string
    submissions: number
    reviews: number
    users: number
    xpAwarded: number
  }>
  distributions: {
    platforms: Record<string, number>
    taskTypes: Record<string, number>
    roles: Record<string, number>
    xpRanges: Record<string, number>
  }
  topPerformers: {
    submitters: Array<{
      id: string
      username: string
      totalXp: number
      _count: { submissions: number }
    }>
    reviewers: Array<{
      id: string
      username: string
      totalXp: number
      _count: { peerReviews: number }
    }>
  }
  qualityMetrics: {
    avgReviewScore: number
    minReviewScore: number
    maxReviewScore: number
    taskTypeSuccessRates: Array<{
      taskType: string
      total: number
      completed: number
      successRate: number
    }>
  }
  growthRates: {
    submissions: number
    reviews: number
    users: number
  }
  timeframe: string
  dateRange: {
    start: string
    end: string
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function formatDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function readNumberMap(value: unknown): Record<string, number> {
  const record = asRecord(value)

  if (!record) {
    return {}
  }

  return Object.entries(record).reduce<Record<string, number>>((acc, [key, entryValue]) => {
    acc[key] = readNumber(entryValue)
    return acc
  }, {})
}

function normalizeAnalyticsData(payload: unknown, fallbackTimeframe: string): AnalyticsData | null {
  const root = asRecord(payload)

  if (!root) {
    return null
  }

  const overview = asRecord(root.overview)
  const distributions = asRecord(root.distributions)
  const topPerformers = asRecord(root.topPerformers)
  const qualityMetrics = asRecord(root.qualityMetrics)
  const growthRates = asRecord(root.growthRates)
  const dateRange = asRecord(root.dateRange)

  if (!overview) {
    return null
  }

  const normalizedSubmitters = Array.isArray(topPerformers?.submitters)
    ? topPerformers.submitters.reduce<AnalyticsData['topPerformers']['submitters']>((acc, item) => {
        const submitter = asRecord(item)

        if (!submitter) {
          return acc
        }

        const countRecord = asRecord(submitter._count)

        acc.push({
          id: readString(submitter.id),
          username: readString(submitter.username, 'Unknown'),
          totalXp: readNumber(submitter.totalXp),
          _count: {
            submissions: readNumber(countRecord?.submissions ?? submitter.submissionCount)
          }
        })

        return acc
      }, [])
    : []

  const normalizedReviewers = Array.isArray(topPerformers?.reviewers)
    ? topPerformers.reviewers.reduce<AnalyticsData['topPerformers']['reviewers']>((acc, item) => {
        const reviewer = asRecord(item)

        if (!reviewer) {
          return acc
        }

        const countRecord = asRecord(reviewer._count)

        acc.push({
          id: readString(reviewer.id),
          username: readString(reviewer.username, 'Unknown'),
          totalXp: readNumber(reviewer.totalXp),
          _count: {
            peerReviews: readNumber(countRecord?.peerReviews ?? reviewer.reviewCount)
          }
        })

        return acc
      }, [])
    : []

  const normalizedTaskTypeSuccessRates = Array.isArray(qualityMetrics?.taskTypeSuccessRates)
    ? qualityMetrics.taskTypeSuccessRates.reduce<AnalyticsData['qualityMetrics']['taskTypeSuccessRates']>((acc, item) => {
        const taskTypeMetric = asRecord(item)

        if (!taskTypeMetric) {
          return acc
        }

        acc.push({
          taskType: readString(taskTypeMetric.taskType),
          total: readNumber(taskTypeMetric.total),
          completed: readNumber(taskTypeMetric.completed),
          successRate: readNumber(taskTypeMetric.successRate)
        })

        return acc
      }, [])
    : []

  const normalizedTimeSeriesData = Array.isArray(root.timeSeriesData)
    ? root.timeSeriesData.reduce<AnalyticsData['timeSeriesData']>((acc, item) => {
        const point = asRecord(item)

        if (!point) {
          return acc
        }

        acc.push({
          date: readString(point.date),
          submissions: readNumber(point.submissions),
          reviews: readNumber(point.reviews),
          users: readNumber(point.users),
          xpAwarded: readNumber(point.xpAwarded)
        })

        return acc
      }, [])
    : []

  const avgReviewScore = readNumber(qualityMetrics?.avgReviewScore, readNumber(overview.avgReviewScore))

  return {
    overview: {
      totalUsers: readNumber(overview.totalUsers),
      activeUsers: readNumber(overview.activeUsers),
      totalSubmissions: readNumber(overview.totalSubmissions),
      completedSubmissions: readNumber(overview.completedSubmissions),
      totalReviews: readNumber(overview.totalReviews),
      totalXpAwarded: readNumber(overview.totalXpAwarded),
      totalAchievements: readNumber(overview.totalAchievements),
      pendingFlags: readNumber(overview.pendingFlags),
      submissionSuccessRate: readNumber(overview.submissionSuccessRate),
      avgReviewScore
    },
    timeSeriesData: normalizedTimeSeriesData,
    distributions: {
      platforms: readNumberMap(distributions?.platforms),
      taskTypes: readNumberMap(distributions?.taskTypes),
      roles: readNumberMap(distributions?.roles),
      xpRanges: readNumberMap(distributions?.xpRanges)
    },
    topPerformers: {
      submitters: normalizedSubmitters,
      reviewers: normalizedReviewers
    },
    qualityMetrics: {
      avgReviewScore,
      minReviewScore: readNumber(qualityMetrics?.minReviewScore, avgReviewScore),
      maxReviewScore: readNumber(qualityMetrics?.maxReviewScore, avgReviewScore),
      taskTypeSuccessRates: normalizedTaskTypeSuccessRates
    },
    growthRates: {
      submissions: readNumber(growthRates?.submissions),
      reviews: readNumber(growthRates?.reviews),
      users: readNumber(growthRates?.users)
    },
    timeframe: readString(root.timeframe, fallbackTimeframe),
    dateRange: {
      start: readString(dateRange?.start, new Date(0).toISOString()),
      end: readString(dateRange?.end, new Date().toISOString())
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatReportNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString()
}

function formatReportPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }

  return `${value.toFixed(digits)}%`
}

function formatReportDate(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function buildAnalyticsReportHtml(input: {
  analyticsData: AnalyticsData | null
  reviewerAnalyticsData: ReviewerAnalyticsDashboard | null
  timeframeLabel: string
  exportedAt: Date
}): string {
  const { analyticsData, reviewerAnalyticsData, timeframeLabel, exportedAt } = input

  const metricCards: Array<{ label: string; value: string; note?: string }> = []

  if (analyticsData) {
    metricCards.push(
      { label: 'Total Users', value: formatReportNumber(analyticsData.overview.totalUsers) },
      { label: 'Submissions', value: formatReportNumber(analyticsData.overview.totalSubmissions) },
      { label: 'Reviews', value: formatReportNumber(analyticsData.overview.totalReviews) },
      { label: 'XP Awarded', value: formatReportNumber(analyticsData.overview.totalXpAwarded) },
      { label: 'Success Rate', value: formatReportPercent(analyticsData.overview.submissionSuccessRate, 0) },
      { label: 'Average Review Score', value: analyticsData.overview.avgReviewScore.toFixed(1) }
    )
  }

  if (reviewerAnalyticsData) {
    metricCards.push(
      {
        label: 'Eligible Reviewers',
        value: `${reviewerAnalyticsData.summary.eligibleNow}/${reviewerAnalyticsData.summary.totalReviewerRoles}`,
        note: `${reviewerAnalyticsData.summary.activeAssignmentsNow} active assignments now`
      },
      {
        label: 'Top 3 Assignment Share',
        value: formatReportPercent(reviewerAnalyticsData.summary.top3AssignmentSharePct, 1)
      },
      {
        label: 'Underused Reliable',
        value: formatReportNumber(reviewerAnalyticsData.summary.underusedReliableCount)
      }
    )
  }

  const metricCardsHtml = metricCards.length > 0
    ? metricCards.map((card) => `
        <div class="metric-card">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${escapeHtml(card.value)}</div>
          ${card.note ? `<div class="metric-note">${escapeHtml(card.note)}</div>` : ''}
        </div>
      `).join('')
    : '<p class="muted">No metrics available.</p>'

  const platformRows = analyticsData
    ? Object.entries(analyticsData.distributions.platforms)
        .map(([name, value]) => `
          <tr>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(formatReportNumber(value))}</td>
          </tr>
        `)
        .join('')
    : ''

  const taskTypeRows = analyticsData
    ? Object.entries(analyticsData.distributions.taskTypes)
        .map(([name, value]) => `
          <tr>
            <td>${escapeHtml(getTaskDisplayInfo(name).name)}</td>
            <td>${escapeHtml(formatReportNumber(value))}</td>
          </tr>
        `)
        .join('')
    : ''

  const reviewerSummaryRows = reviewerAnalyticsData
    ? [
        ['Assigned In Window', formatReportNumber(reviewerAnalyticsData.summary.reviewersAssignedInPeriod)],
        ['Submitted Reviews In Window', formatReportNumber(reviewerAnalyticsData.summary.reviewersSubmittingReviewsInPeriod)],
        ['Eligible Without Assignments', formatReportNumber(reviewerAnalyticsData.summary.eligibleWithoutAssignmentsInPeriod)],
        ['Missed Assignments', formatReportNumber(reviewerAnalyticsData.summary.totalMissedAssignmentsInPeriod)],
        ['Coverage', formatReportPercent(reviewerAnalyticsData.summary.distributionCoveragePct, 0)],
        ['Top 5 Assignment Share', formatReportPercent(reviewerAnalyticsData.summary.top5AssignmentSharePct, 1)]
      ].map(([label, value]) => `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td>${escapeHtml(value)}</td>
        </tr>
      `).join('')
    : ''

  const concentrationRows = reviewerAnalyticsData
    ? reviewerAnalyticsData.concentration.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(formatReportNumber(row.periodAssignmentsReceived))}</td>
          <td>${escapeHtml(formatReportPercent(row.periodAssignmentSharePct, 1))}</td>
          <td>${escapeHtml(row.reliabilityScore === null ? '-' : `${(row.reliabilityScore * 100).toFixed(2)}%`)}</td>
        </tr>
      `).join('')
    : ''

  const nextUpRows = reviewerAnalyticsData
    ? reviewerAnalyticsData.insights.nextUp.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(row.currentPriority ? `#${row.currentPriority}` : '-')}</td>
          <td>${escapeHtml(formatReportNumber(row.activeAssignmentsNow))}</td>
          <td>${escapeHtml(row.reliabilityScore === null ? '-' : `${(row.reliabilityScore * 100).toFixed(2)}%`)}</td>
        </tr>
      `).join('')
    : ''

  const underusedRows = reviewerAnalyticsData
    ? reviewerAnalyticsData.insights.underusedReliable.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(formatReportNumber(row.periodAssignmentsReceived))}</td>
          <td>${escapeHtml(row.currentPriority ? `#${row.currentPriority}` : '-')}</td>
          <td>${escapeHtml(row.reliabilityScore === null ? '-' : `${(row.reliabilityScore * 100).toFixed(2)}%`)}</td>
        </tr>
      `).join('')
    : ''

  const riskRows = reviewerAnalyticsData
    ? reviewerAnalyticsData.insights.riskWatch.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(row.currentPoolState)}</td>
          <td>${escapeHtml(formatReportNumber(row.periodAssignmentsMissed))}</td>
          <td>${escapeHtml(formatReportPercent(row.periodOnTimeRatePct, 0))}</td>
        </tr>
      `).join('')
    : ''

  const reviewerRosterRows = reviewerAnalyticsData
    ? reviewerAnalyticsData.reviewers.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${escapeHtml(row.currentPoolState)}</td>
          <td>${escapeHtml(row.currentPriority ? `#${row.currentPriority}` : '-')}</td>
          <td>${escapeHtml(row.reliabilityScore === null ? '-' : `${(row.reliabilityScore * 100).toFixed(2)}%`)}</td>
          <td>${escapeHtml(formatReportNumber(row.activeAssignmentsNow))}</td>
          <td>${escapeHtml(formatReportNumber(row.periodAssignmentsReceived))}</td>
          <td>${escapeHtml(formatReportNumber(row.periodReviewsSubmitted))}</td>
          <td>${escapeHtml(formatReportNumber(row.periodAssignmentsMissed))}</td>
          <td>${escapeHtml(formatReportDate(row.lastActiveAt))}</td>
        </tr>
      `).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Analytics Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f3ef;
      --panel: #ffffff;
      --ink: #18181b;
      --muted: #6b7280;
      --line: #ded7cb;
      --accent: #1d4ed8;
      --accent-soft: #dbeafe;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(180deg, #f8f6f1 0%, #efe9dc 100%);
      color: var(--ink);
    }
    .page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    .hero, .section, .metric-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(24, 24, 27, 0.05);
    }
    .hero, .section { padding: 24px; margin-bottom: 24px; }
    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 12px;
      font-weight: 700;
    }
    h1 { margin: 8px 0 12px; font-size: 36px; line-height: 1.05; }
    h2 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0; line-height: 1.6; }
    .muted { color: var(--muted); }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      margin-top: 20px;
    }
    .metric-card { padding: 18px; }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .metric-value {
      margin-top: 10px;
      font-size: 28px;
      font-weight: 700;
    }
    .metric-note {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .two-col {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      background: #faf8f3;
    }
    .chip {
      display: inline-block;
      margin-top: 12px;
      margin-right: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
    }
    @media print {
      body { background: #fff; }
      .page { padding: 0; }
      .hero, .section, .metric-card { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="eyebrow">ScholarsXP Admin Report</div>
      <h1>Analytics Export</h1>
      <p class="muted">Exported ${escapeHtml(formatReportDate(exportedAt.toISOString()))} for timeframe ${escapeHtml(timeframeLabel)}.</p>
      ${analyticsData ? `<span class="chip">System analytics included</span>` : ''}
      ${reviewerAnalyticsData ? `<span class="chip">Reviewer analytics included</span>` : ''}
      <div class="grid">
        ${metricCardsHtml}
      </div>
    </section>

    ${analyticsData ? `
      <section class="section">
        <h2>System Overview</h2>
        <p class="muted">Reporting window: ${escapeHtml(formatReportDate(analyticsData.dateRange.start))} to ${escapeHtml(formatReportDate(analyticsData.dateRange.end))}</p>
        <div class="two-col">
          <div>
            <table>
              <thead>
                <tr><th>Platform</th><th>Submissions</th></tr>
              </thead>
              <tbody>
                ${platformRows || '<tr><td colspan="2">No platform data available.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div>
            <table>
              <thead>
                <tr><th>Task Type</th><th>Submissions</th></tr>
              </thead>
              <tbody>
                ${taskTypeRows || '<tr><td colspan="2">No task type data available.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Top Performers</h2>
        <div class="two-col">
          <div>
            <table>
              <thead>
                <tr><th>Submitter</th><th>Submissions</th><th>Total XP</th></tr>
              </thead>
              <tbody>
                ${analyticsData.topPerformers.submitters.map((user) => `
                  <tr>
                    <td>${escapeHtml(user.username)}</td>
                    <td>${escapeHtml(formatReportNumber(user._count.submissions))}</td>
                    <td>${escapeHtml(formatReportNumber(user.totalXp))}</td>
                  </tr>
                `).join('') || '<tr><td colspan="3">No submitter data available.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div>
            <table>
              <thead>
                <tr><th>Reviewer</th><th>Reviews</th><th>Total XP</th></tr>
              </thead>
              <tbody>
                ${analyticsData.topPerformers.reviewers.map((user) => `
                  <tr>
                    <td>${escapeHtml(user.username)}</td>
                    <td>${escapeHtml(formatReportNumber(user._count.peerReviews))}</td>
                    <td>${escapeHtml(formatReportNumber(user.totalXp))}</td>
                  </tr>
                `).join('') || '<tr><td colspan="3">No reviewer data available.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    ` : ''}

    ${reviewerAnalyticsData ? `
      <section class="section">
        <h2>Reviewer Operations Summary</h2>
        <p class="muted">Reporting window: ${escapeHtml(formatReportDate(reviewerAnalyticsData.dateRange.start))} to ${escapeHtml(formatReportDate(reviewerAnalyticsData.dateRange.end))}</p>
        <table>
          <thead>
            <tr><th>Metric</th><th>Value</th></tr>
          </thead>
          <tbody>
            ${reviewerSummaryRows}
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Assignment Concentration</h2>
        <table>
          <thead>
            <tr><th>Reviewer</th><th>Assignments</th><th>Share</th><th>Reliability</th></tr>
          </thead>
          <tbody>
            ${concentrationRows || '<tr><td colspan="4">No concentration data available.</td></tr>'}
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Decision Lists</h2>
        <div class="two-col">
          <div>
            <table>
              <thead>
                <tr><th colspan="4">Next Up In Selector</th></tr>
                <tr><th>Reviewer</th><th>Priority</th><th>Active</th><th>Reliability</th></tr>
              </thead>
              <tbody>
                ${nextUpRows || '<tr><td colspan="4">No eligible reviewers right now.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div>
            <table>
              <thead>
                <tr><th colspan="4">Underused But Reliable</th></tr>
                <tr><th>Reviewer</th><th>Assigned</th><th>Priority</th><th>Reliability</th></tr>
              </thead>
              <tbody>
                ${underusedRows || '<tr><td colspan="4">No underused candidates available.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="two-col" style="margin-top:24px;">
          <div>
            <table>
              <thead>
                <tr><th colspan="4">Risk Watch</th></tr>
                <tr><th>Reviewer</th><th>Status</th><th>Missed</th><th>On Time</th></tr>
              </thead>
              <tbody>
                ${riskRows || '<tr><td colspan="4">No risk signals right now.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Reviewer Roster</h2>
        <table>
          <thead>
            <tr>
              <th>Reviewer</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Reliability</th>
              <th>Active Now</th>
              <th>Assigned</th>
              <th>Reviews</th>
              <th>Missed</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            ${reviewerRosterRows || '<tr><td colspan="9">No reviewer roster data available.</td></tr>'}
          </tbody>
        </table>
      </section>
    ` : ''}
  </div>
</body>
</html>`
}

export default function AdminAnalyticsPage() {
  const { user, isLoading: loading } = usePrivyAuthSync()
  // const router = useRouter()
  const { authenticatedFetch } = useAuthenticatedFetch()
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [reviewerAnalyticsData, setReviewerAnalyticsData] = useState<ReviewerAnalyticsDashboard | null>(null)
  const [reviewerAnalyticsError, setReviewerAnalyticsError] = useState<string | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [exportingReport, setExportingReport] = useState(false)
  const [timeframe, setTimeframe] = useState('last_30_days')
  const [customStartDate, setCustomStartDate] = useState(() =>
    formatDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  )
  const [customEndDate, setCustomEndDate] = useState(() => formatDateInputValue(new Date()))

  const isCustomRange = timeframe === 'custom_range'
  const hasValidCustomRange = Boolean(
    customStartDate &&
    customEndDate &&
    new Date(`${customStartDate}T00:00:00.000Z`) <= new Date(`${customEndDate}T23:59:59.999Z`)
  )

  const timeframeLabel = isCustomRange && hasValidCustomRange
    ? `${customStartDate} to ${customEndDate}`
    : timeframe.replaceAll('_', ' ')

  const fetchAnalyticsData = useCallback(async () => {
    if (timeframe === 'custom_range' && !hasValidCustomRange) {
      return
    }

    try {
      setLoadingAnalytics(true)

      const params = new URLSearchParams({
        timeframe
      })

      if (timeframe === 'custom_range') {
        params.set('startDate', customStartDate)
        params.set('endDate', customEndDate)
      }

      const [systemResult, reviewerResult] = await Promise.allSettled([
        authenticatedFetch(`/api/admin/analytics?${params.toString()}`),
        authenticatedFetch(`/api/admin/analytics/reviewers?${params.toString()}`)
      ])

      if (systemResult.status === 'fulfilled' && systemResult.value.ok) {
        const payload = await systemResult.value.json()
        setAnalyticsData(normalizeAnalyticsData(payload?.data ?? payload, timeframe))
      } else {
        setAnalyticsData(null)
      }

      if (reviewerResult.status === 'fulfilled' && reviewerResult.value.ok) {
        const payload = await reviewerResult.value.json()
        setReviewerAnalyticsData((payload?.data ?? payload) as ReviewerAnalyticsDashboard)
        setReviewerAnalyticsError(null)
      } else {
        setReviewerAnalyticsData(null)
        setReviewerAnalyticsError('Reviewer analytics could not be loaded.')
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error)
      setAnalyticsData(null)
      setReviewerAnalyticsData(null)
      setReviewerAnalyticsError(error instanceof Error ? error.message : 'Failed to load reviewer analytics')
    } finally {
      setLoadingAnalytics(false)
    }
  }, [authenticatedFetch, customEndDate, customStartDate, hasValidCustomRange, timeframe])

  useEffect(() => {
    fetchAnalyticsData()
  }, [fetchAnalyticsData])

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const getGrowthIcon = (rate: number) => {
    if (rate > 0) return <TrendingUp className="h-4 w-4 text-success" />
    if (rate < 0) return <TrendingDown className="h-4 w-4 text-destructive" />
    return <div className="h-4 w-4" />
  }

  const getGrowthColor = (rate: number) => {
    if (rate > 0) return 'text-success'
    if (rate < 0) return 'text-destructive'
    return 'text-muted-foreground'
  }

  const hasAnyAnalytics = Boolean(analyticsData || reviewerAnalyticsData)

  const handleExportReport = useCallback(() => {
    if (!analyticsData && !reviewerAnalyticsData) {
      return
    }

    try {
      setExportingReport(true)

      const exportedAt = new Date()
      const reportHtml = buildAnalyticsReportHtml({
        analyticsData,
        reviewerAnalyticsData,
        timeframeLabel,
        exportedAt
      })

      const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const dateStamp = exportedAt.toISOString().replace(/[:]/g, '-').split('.')[0]

      anchor.href = url
      const filenameRange = isCustomRange && hasValidCustomRange
        ? `${customStartDate}_to_${customEndDate}`
        : timeframe

      anchor.download = `analytics-report-${filenameRange}-${dateStamp}.html`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export analytics report:', error)
    } finally {
      setExportingReport(false)
    }
  }, [
    analyticsData,
    customEndDate,
    customStartDate,
    hasValidCustomRange,
    isCustomRange,
    reviewerAnalyticsData,
    timeframe,
    timeframeLabel
  ])

  const systemAnalyticsFallback = (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-5 w-5" />
          System Analytics Unavailable
        </CardTitle>
        <CardDescription>
          The main analytics dataset could not be loaded right now. The new reviewer analytics tab is still available.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" onClick={fetchAnalyticsData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAdmin(user?.role)) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-info" />
              System Analytics
            </h1>
            <p className="text-muted-foreground">
              Comprehensive platform insights and performance metrics
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={timeframe}
              onValueChange={(value) => {
                setTimeframe(value)

                if (value === 'custom_range' && (!customStartDate || !customEndDate)) {
                  setCustomStartDate(formatDateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
                  setCustomEndDate(formatDateInputValue(new Date()))
                }
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                <SelectItem value="custom_range">Custom Range</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
            {isCustomRange ? (
              <>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="w-[160px]"
                  aria-label="Start date"
                />
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="w-[160px]"
                  aria-label="End date"
                />
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={fetchAnalyticsData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportReport}
              disabled={!hasAnyAnalytics || exportingReport || (isCustomRange && !hasValidCustomRange)}
            >
              <Download className="h-4 w-4 mr-2" />
              {exportingReport ? 'Exporting...' : 'Export Report'}
            </Button>
          </div>
        </div>

        {isCustomRange && !hasValidCustomRange ? (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 text-sm text-amber-800">
              Choose a valid start and end date to load analytics for a custom range.
            </CardContent>
          </Card>
        ) : null}

        {loadingAnalytics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-8 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : hasAnyAnalytics ? (
          <Tabs defaultValue={analyticsData ? 'overview' : 'reviewers'} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="reviewers">Reviewers</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              {analyticsData ? (
                <>
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="bg-gradient-to-br from-info/10 to-info/20 border-info/20">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-info">Total Users</p>
                            <p className="text-2xl font-bold text-info">
                              {formatNumber(analyticsData.overview.totalUsers)}
                            </p>
                            <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analyticsData.growthRates.users)}`}>
                              {getGrowthIcon(analyticsData.growthRates.users)}
                              {Math.abs(analyticsData.growthRates.users).toFixed(1)}%
                            </div>
                          </div>
                          <Users className="h-8 w-8 text-info" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-success/10 to-success/20 border-success/20">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-success">Submissions</p>
                            <p className="text-2xl font-bold text-success">
                              {formatNumber(analyticsData.overview.totalSubmissions)}
                            </p>
                            <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analyticsData.growthRates.submissions)}`}>
                              {getGrowthIcon(analyticsData.growthRates.submissions)}
                              {Math.abs(analyticsData.growthRates.submissions).toFixed(1)}%
                            </div>
                          </div>
                          <FileText className="h-8 w-8 text-success" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple/10 to-purple/20 border-purple/20">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-purple">Reviews</p>
                            <p className="text-2xl font-bold text-purple">
                              {formatNumber(analyticsData.overview.totalReviews)}
                            </p>
                            <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analyticsData.growthRates.reviews)}`}>
                              {getGrowthIcon(analyticsData.growthRates.reviews)}
                              {Math.abs(analyticsData.growthRates.reviews).toFixed(1)}%
                            </div>
                          </div>
                          <MessageSquare className="h-8 w-8 text-purple" />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-warning/10 to-warning/20 border-warning/20">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-warning">XP Awarded</p>
                            <p className="text-2xl font-bold text-warning">
                              {formatNumber(analyticsData.overview.totalXpAwarded)}
                            </p>
                            <p className="text-sm text-warning">
                              {analyticsData.overview.totalAchievements} achievements
                            </p>
                          </div>
                          <Zap className="h-8 w-8 text-warning" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Activity Overview */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Platform Activity</CardTitle>
                        <CardDescription>Content distribution by platform</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(analyticsData.distributions.platforms).map(([platform, count]) => {
                            const percentage = (count / analyticsData.overview.totalSubmissions) * 100
                            return (
                              <div key={platform} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium">{platform}</span>
                                  <span>{count} ({percentage.toFixed(1)}%)</span>
                                </div>
                                <Progress value={percentage} className="h-2" />
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Task Type Distribution</CardTitle>
                        <CardDescription>Submissions by task type</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(analyticsData.distributions.taskTypes).map(([taskType, count]) => {
                            const percentage = (count / analyticsData.overview.totalSubmissions) * 100
                            const taskTypeName = getTaskDisplayInfo(taskType).name
                            return (
                              <div key={taskType} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium">{taskTypeName}</span>
                                  <span>{count} ({percentage.toFixed(1)}%)</span>
                                </div>
                                <Progress value={percentage} className="h-2" />
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* System Health */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          User Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="text-sm">Active Users (7 days)</span>
                            <Badge variant="outline">
                              {analyticsData.overview.activeUsers}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Activity Rate</span>
                            <Badge variant="outline">
                              {Math.round((analyticsData.overview.activeUsers / analyticsData.overview.totalUsers) * 100)}%
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Award className="h-5 w-5" />
                          Quality Metrics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="text-sm">Success Rate</span>
                            <Badge variant="outline">
                              {analyticsData.overview.submissionSuccessRate}%
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Avg Review Score</span>
                            <Badge variant="outline">
                              {analyticsData.overview.avgReviewScore.toFixed(1)}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5" />
                          Moderation
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="text-sm">Pending Flags</span>
                            <Badge variant={analyticsData.overview.pendingFlags > 0 ? 'destructive' : 'outline'}>
                              {analyticsData.overview.pendingFlags}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Flag Rate</span>
                            <Badge variant="outline">
                              {analyticsData.overview.totalSubmissions > 0
                                ? ((analyticsData.overview.pendingFlags / analyticsData.overview.totalSubmissions) * 100).toFixed(2)
                                : 0}%
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : systemAnalyticsFallback}
            </TabsContent>

            <TabsContent value="reviewers" className="space-y-6 mt-6">
              <ReviewerAnalyticsTab
                data={reviewerAnalyticsData}
                error={reviewerAnalyticsError}
                loading={loadingAnalytics}
                onRefresh={fetchAnalyticsData}
              />
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-6 mt-6">
              {analyticsData ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>User Role Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(analyticsData.distributions.roles).map(([role, count]) => {
                            const percentage = (count / analyticsData.overview.totalUsers) * 100
                            return (
                              <div key={role} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium">{role}</span>
                                  <span>{count} ({percentage.toFixed(1)}%)</span>
                                </div>
                                <Progress value={percentage} className="h-2" />
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>XP Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(analyticsData.distributions.xpRanges).map(([range, count]) => {
                            const percentage = (count / analyticsData.overview.totalUsers) * 100
                            return (
                              <div key={range} className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium">{range} XP</span>
                                  <span>{count} ({percentage.toFixed(1)}%)</span>
                                </div>
                                <Progress value={percentage} className="h-2" />
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Top Performers */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Top Submitters</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {analyticsData.topPerformers.submitters.slice(0, 5).map((user, index) => (
                            <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                                  {index + 1}
                                </Badge>
                                <div>
                                  <p className="font-medium">{user.username}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {user._count.submissions} submissions
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline">
                                {user.totalXp.toLocaleString()} XP
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Top Reviewers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {analyticsData.topPerformers.reviewers.slice(0, 5).map((user, index) => (
                            <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                                  {index + 1}
                                </Badge>
                                <div>
                                  <p className="font-medium">{user.username}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {user._count.peerReviews} reviews
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline">
                                {user.totalXp.toLocaleString()} XP
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : systemAnalyticsFallback}
            </TabsContent>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-6 mt-6">
              {analyticsData ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Task Type Success Rates</CardTitle>
                    <CardDescription>Completion rates by task type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {analyticsData.qualityMetrics.taskTypeSuccessRates.map((taskType) => {
                        const taskTypeName = getTaskDisplayInfo(taskType.taskType).name
                        return (
                          <div key={taskType.taskType} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{taskTypeName}</span>
                              <span>{taskType.completed}/{taskType.total} ({taskType.successRate}%)</span>
                            </div>
                            <Progress value={taskType.successRate} className="h-2" />
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : systemAnalyticsFallback}
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="space-y-6 mt-6">
              {analyticsData ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Review Quality</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-primary">
                            {analyticsData.qualityMetrics.avgReviewScore.toFixed(1)}
                          </div>
                          <div className="text-sm text-muted-foreground">Average Score</div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Min Score:</span>
                          <span>{analyticsData.qualityMetrics.minReviewScore}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Max Score:</span>
                          <span>{analyticsData.qualityMetrics.maxReviewScore}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Growth Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">User Growth</span>
                          <div className={`flex items-center gap-1 ${getGrowthColor(analyticsData.growthRates.users)}`}>
                            {getGrowthIcon(analyticsData.growthRates.users)}
                            <span className="text-sm font-medium">
                              {analyticsData.growthRates.users.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Submission Growth</span>
                          <div className={`flex items-center gap-1 ${getGrowthColor(analyticsData.growthRates.submissions)}`}>
                            {getGrowthIcon(analyticsData.growthRates.submissions)}
                            <span className="text-sm font-medium">
                              {analyticsData.growthRates.submissions.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Review Growth</span>
                          <div className={`flex items-center gap-1 ${getGrowthColor(analyticsData.growthRates.reviews)}`}>
                            {getGrowthIcon(analyticsData.growthRates.reviews)}
                            <span className="text-sm font-medium">
                              {analyticsData.growthRates.reviews.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Date Range</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Period</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <div>From: {new Date(analyticsData.dateRange.start).toLocaleDateString()}</div>
                          <div>To: {new Date(analyticsData.dateRange.end).toLocaleDateString()}</div>
                        </div>
                        <Badge variant="outline" className="w-full justify-center">
                          {analyticsData.timeframe.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : systemAnalyticsFallback}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No analytics data available</p>
          </div>
        )}
      </div>
    </div>
  )
}

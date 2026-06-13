'use client'

import React, { useState, useCallback } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart3,
  Play,
  RefreshCw,
  Users,
  TrendingUp,
  TrendingDown,
  Gauge,
  Target,
  Hash,
  AlertCircle,
  Eye,
  GitBranch,
  ArrowRight
} from 'lucide-react'
import Link from 'next/link'
import type { SimulationResult, AlgorithmResult } from '@/lib/reviewer-fairness-simulator'
import { ALGORITHMS, getActiveFairnessAlgorithm, type AlgorithmId } from '@/lib/reviewer-fairness-algorithms'
import type { ShadowQueryResult, ShadowSummaryRow, ShadowEventDetail, ShadowReviewerBreakdown } from '@/lib/reviewer-fairness-shadow'

const today = new Date()
const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function colorForValue(value: number, inverse: boolean, baseline: number): string {
  const better = inverse ? value < baseline : value > baseline
  if (Math.abs(value - baseline) < 0.5) return 'text-gray-400'
  return better ? 'text-green-400' : 'text-red-400'
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatGini(value: number): string {
  return value.toFixed(3)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReviewerFairnessDashboard() {
  const { user, isLoading: authLoading } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()

  const [startDate, setStartDate] = useState(fmtDate(thirtyDaysAgo))
  const [endDate, setEndDate] = useState(fmtDate(today))
  const [selectedAlgos, setSelectedAlgos] = useState<Set<AlgorithmId>>(
    new Set(ALGORITHMS.map(a => a.id))
  )
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDistAlgoId, setSelectedDistAlgoId] = useState<AlgorithmId>('baseline')

  // Shadow Monitor state
  const [shadowResult, setShadowResult] = useState<ShadowQueryResult | null>(null)
  const [shadowLoading, setShadowLoading] = useState(false)
  const [shadowError, setShadowError] = useState<string | null>(null)
  const [shadowDistAlgoId, setShadowDistAlgoId] = useState<string>('o3_a3_combined')

  const toggleAlgo = (id: AlgorithmId) => {
    setSelectedAlgos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedAlgos.size === ALGORITHMS.length) {
      setSelectedAlgos(new Set())
    } else {
      setSelectedAlgos(new Set(ALGORITHMS.map(a => a.id)))
    }
  }

  const runSimulation = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/admin/reviewer-fairness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          algorithmIds: Array.from(selectedAlgos)
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || data.details || 'Simulation failed')
      }
      const data = await res.json()
      setResult(data)
    } catch (err: unknown) {
      setError((err as Error).message || 'Unknown error')
    } finally {
      setRunning(false)
    }
  }, [authenticatedFetch, startDate, endDate, selectedAlgos])

  const fetchShadowLogs = useCallback(async () => {
    setShadowLoading(true)
    setShadowError(null)
    try {
      const res = await authenticatedFetch('/api/admin/reviewer-fairness/shadow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || data.details || 'Shadow query failed')
      }
      const data = await res.json()
      setShadowResult(data)
    } catch (err: unknown) {
      setShadowError((err as Error).message || 'Unknown error')
    } finally {
      setShadowLoading(false)
    }
  }, [authenticatedFetch, startDate, endDate, selectedAlgos])

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const baseline = result?.algorithms.find(a => a.algorithmId === 'baseline')

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin">
          <Button variant="outline" size="icon" className="h-9 w-9">
            ←
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Reviewer Assignment Fairness</h1>
          <p className="text-muted-foreground mt-1">
            Simulate and compare assignment algorithms against historical data
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Simulation Setup
          </CardTitle>
          <CardDescription>
            Select date range and algorithms to compare
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Algorithms</label>
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                {selectedAlgos.size === ALGORITHMS.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ALGORITHMS.map(algo => (
                <label
                  key={algo.id}
                  className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAlgos.has(algo.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedAlgos.has(algo.id)}
                    onChange={() => toggleAlgo(algo.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{algo.label}</div>
                    <div className="text-xs text-muted-foreground">{algo.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={runSimulation}
            disabled={running || selectedAlgos.size === 0}
            className="w-full sm:w-auto"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Running Simulation…
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Simulation
              </>
            )}
          </Button>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Context bar */}
          <div className="flex flex-wrap gap-3 mb-6 text-sm text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <Hash className="w-3 h-3" />
              {result.totalSubmissions} submissions
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Users className="w-3 h-3" />
              {result.eligibleReviewersInPool} eligible / {result.totalReviewersInPool} total
            </Badge>
            <Badge variant="outline">
              {result.totalReviewerSlots} reviewer slots ({result.totalSubmissions} submissions)
            </Badge>
            <Badge variant="outline">
              {result.initialAssignmentEvents} initial · {result.reassignmentEvents} reassignments
            </Badge>
            <Badge variant="outline">
              {result.dateRange.start.split('T')[0]} → {result.dateRange.end.split('T')[0]}
            </Badge>
          </div>

          <Tabs defaultValue="summary" className="space-y-6">
            <TabsList>
              <TabsTrigger value="summary" className="gap-1">
                <Gauge className="w-4 h-4" /> Summary
              </TabsTrigger>
              <TabsTrigger value="distribution" className="gap-1">
                <Users className="w-4 h-4" /> Per-Reviewer
              </TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary">
              <Card>
                <CardHeader>
                  <CardTitle>Algorithm Comparison</CardTitle>
                  <CardDescription>
                    Lower Gini = more even distribution. Higher coverage = more reviewers get work.
                    Coverage = % of eligible pool (not paused/banned/opted-out) that received ≥1 assignment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Algorithm</TableHead>
                        <TableHead className="text-right">Gini ↓</TableHead>
                        <TableHead className="text-right">Top-3 Share ↓</TableHead>
                        <TableHead className="text-right">Top-5 Share ↓</TableHead>
                        <TableHead className="text-right">Coverage ↑</TableHead>
                        <TableHead className="text-right">New Activated</TableHead>
                        <TableHead className="text-right">Unique Picked</TableHead>
                        <TableHead className="text-right">Avg Reliability</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.algorithms.map(algo => {
                        // 'isActive' marks the deployed algorithm (row highlight + badge).
                        // 'isBaseline' is the comparison anchor for color deltas — these
                        // are separate concerns (active can differ from baseline).
                        const isActive = algo.algorithmId === getActiveFairnessAlgorithm()
                        const isBaseline = algo.algorithmId === 'baseline'
                        const bl = baseline
                        return (
                          <TableRow key={algo.algorithmId} className={isActive ? 'bg-muted/30' : ''}>
                            <TableCell className="font-medium">
                              {algo.algorithmLabel}
                              {isActive && (
                                <Badge variant="secondary" className="ml-2 text-xs">active</Badge>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${!isBaseline && bl ? colorForValue(algo.giniCoefficient, true, bl.giniCoefficient) : ''}`}>
                              {formatGini(algo.giniCoefficient)}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${!isBaseline && bl ? colorForValue(algo.top3AssignmentSharePct, true, bl.top3AssignmentSharePct) : ''}`}>
                              {formatPct(algo.top3AssignmentSharePct)}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${!isBaseline && bl ? colorForValue(algo.top5AssignmentSharePct, true, bl.top5AssignmentSharePct) : ''}`}>
                              {formatPct(algo.top5AssignmentSharePct)}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${!isBaseline && bl ? colorForValue(algo.distributionCoveragePct, false, bl.distributionCoveragePct) : ''}`}>
                              {formatPct(algo.distributionCoveragePct)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {algo.newReviewerActivated > 0 ? (
                                <span className="text-green-400">+{algo.newReviewerActivated}</span>
                              ) : algo.algorithmId === 'baseline' ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {algo.uniquePicked}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {algo.avgReliabilityOfPicks.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Quick insights */}
              {baseline && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  {result.algorithms
                    .filter(a => a.algorithmId !== 'baseline')
                    .slice(0, 3)
                    .map(algo => {
                      const giniImprovement = baseline.giniCoefficient - algo.giniCoefficient
                      const coverageImprovement = algo.distributionCoveragePct - baseline.distributionCoveragePct
                      return (
                        <Card key={algo.algorithmId}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{algo.algorithmLabel}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Gini improvement</span>
                                <span className={`text-sm font-mono ${giniImprovement > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {giniImprovement > 0 ? '↓' : '↑'} {Math.abs(giniImprovement).toFixed(3)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Coverage gain</span>
                                <span className={`text-sm font-mono ${coverageImprovement > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {coverageImprovement > 0 ? '↑' : '↓'} {Math.abs(coverageImprovement).toFixed(1)}pp
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">New activated</span>
                                <span className="text-sm font-mono text-green-400">
                                  +{algo.newReviewerActivated}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
              )}
            </TabsContent>

            {/* Per-Reviewer Distribution Tab */}
            <TabsContent value="distribution">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Per-Reviewer Assignment Distribution
                  </CardTitle>
                  <CardDescription>
                    Comparing how picks are distributed across reviewers for each algorithm
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <div className="mb-4 flex items-center gap-3">
                    <label className="text-sm font-medium">Algorithm:</label>
                    <select
                      value={selectedDistAlgoId}
                      onChange={e => setSelectedDistAlgoId(e.target.value as AlgorithmId)}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      {result.algorithms.map(a => (
                        <option key={a.algorithmId} value={a.algorithmId}>
                          {a.algorithmLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const algo = result.algorithms.find(a => a.algorithmId === selectedDistAlgoId)
                    if (!algo) return <p className="text-sm text-muted-foreground">Select an algorithm.</p>
                    return (
                      <div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Reviewer</TableHead>
                              <TableHead className="text-right">Picks</TableHead>
                              <TableHead className="text-right">Share</TableHead>
                              <TableHead className="text-right">Avg Reliability</TableHead>
                              <TableHead className="text-right w-1/3">Distribution</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {algo.reviewerBreakdown.map((rb, i) => {
                              const maxPicks = algo.reviewerBreakdown[0]?.picks ?? 1
                              const barWidth = Math.max(2, (rb.picks / maxPicks) * 100)
                              return (
                                <TableRow key={rb.reviewerId}>
                                  <TableCell className="font-mono text-xs">
                                    {rb.username}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">{rb.picks}</TableCell>
                                  <TableCell className="text-right font-mono text-muted-foreground">
                                    {rb.sharePct.toFixed(1)}%
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-muted-foreground">
                                    {rb.avgReliability.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="w-full bg-muted rounded-full h-2">
                                      <div
                                        className={`h-2 rounded-full transition-all ${
                                          i < 3
                                            ? algo.algorithmId === 'baseline'
                                              ? 'bg-amber-500'
                                              : 'bg-emerald-500'
                                            : 'bg-primary/40'
                                        }`}
                                        style={{ width: `${barWidth}%` }}
                                      />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Shadow Monitor — always visible, independent of simulation */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Shadow Monitor
              </CardTitle>
              <CardDescription>
                What fairness algorithms WOULD have picked vs actual production assignments.
                Uses the date range above — click &ldquo;Refresh&rdquo; to fetch live shadow logs.
              </CardDescription>
            </div>
            <Button
              onClick={fetchShadowLogs}
              disabled={shadowLoading}
              variant="outline"
              size="sm"
            >
              {shadowLoading ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shadowError && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {shadowError}
            </div>
          )}

          {shadowResult && shadowResult.summary.length > 0 ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <Badge variant="outline" className="gap-1">
                  <Hash className="w-3 h-3" />
                  {shadowResult.totalEvents} events logged
                </Badge>
                <Badge variant="outline">
                  {shadowResult.dateRange.start.split('T')[0]} → {shadowResult.dateRange.end.split('T')[0]}
                </Badge>
              </div>

              {/* Summary Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Algorithm</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Div.</TableHead>
                      <TableHead className="text-right">Div. %</TableHead>
                      <TableHead className="text-right">Gini (A/S)</TableHead>
                      <TableHead className="text-right">Top-3% (A/S)</TableHead>
                      <TableHead className="text-right">Top-5% (A/S)</TableHead>
                      <TableHead className="text-right">Cover% (A/S)</TableHead>
                      <TableHead className="text-right">New Faces</TableHead>
                      <TableHead className="text-right">Rel (A/S)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shadowResult.summary.map((row: ShadowSummaryRow) => {
                      const isActive = row.algorithmId === getActiveFairnessAlgorithm()
                      return (
                        <TableRow key={row.algorithmId} className={isActive ? 'bg-muted/30' : ''}>
                          <TableCell className="font-medium text-xs">
                            {row.algorithmLabel}
                            {isActive && (
                              <Badge variant="secondary" className="ml-1 text-xs">active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{row.totalEvents}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className={row.divergedEvents > 0 ? 'text-amber-400' : 'text-green-400'}>
                              {row.divergedEvents}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.divergenceRatePct.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className="text-muted-foreground">{row.giniActual.toFixed(3)}</span>
                            {' / '}
                            <span className={row.algorithmId !== 'baseline' && row.giniShadow < row.giniActual ? 'text-green-400' : 'text-muted-foreground'}>
                              {row.giniShadow.toFixed(3)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className="text-muted-foreground">{row.top3ShareActualPct.toFixed(1)}%</span>
                            {' / '}
                            <span className={row.algorithmId !== 'baseline' && row.top3ShareShadowPct < row.top3ShareActualPct ? 'text-green-400' : 'text-muted-foreground'}>
                              {row.top3ShareShadowPct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className="text-muted-foreground">{row.top5ShareActualPct.toFixed(1)}%</span>
                            {' / '}
                            <span className={row.algorithmId !== 'baseline' && row.top5ShareShadowPct < row.top5ShareActualPct ? 'text-green-400' : 'text-muted-foreground'}>
                              {row.top5ShareShadowPct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className="text-muted-foreground">{row.distributionCoverageActualPct.toFixed(1)}%</span>
                            {' / '}
                            <span className={row.algorithmId !== 'baseline' && row.distributionCoverageShadowPct > row.distributionCoverageActualPct ? 'text-green-400' : 'text-muted-foreground'}>
                              {row.distributionCoverageShadowPct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.newFacesActivated > 0 ? (
                              <span className="text-green-400">+{row.newFacesActivated}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className="text-muted-foreground">{row.avgReliabilityActual.toFixed(2)}</span>
                            {' / '}
                            <span className="text-muted-foreground">{row.avgReliabilityShadow.toFixed(2)}</span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {shadowResult.recentDivergences.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    Recent Divergences ({shadowResult.recentDivergences.length} shown)
                  </h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Submission</TableHead>
                          <TableHead>Algorithm</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Actual → Shadow</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shadowResult.recentDivergences.map((d: ShadowEventDetail) => {
                          const actualNames = d.actualPicks.map(p => p.username).join(', ')
                          const shadowNames = d.shadowPicks.map(p => p.username).join(', ')
                          return (
                            <TableRow key={d.id}>
                              <TableCell className="font-mono text-xs">
                                {d.submissionId.slice(0, 8)}…
                              </TableCell>
                              <TableCell className="text-xs">{d.algorithmLabel}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {d.eventType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className="text-muted-foreground">{actualNames}</span>
                                {' '}
                                <ArrowRight className="w-3 h-3 inline text-amber-400" />
                                {' '}
                                <span>{shadowNames}</span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(d.createdAt).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Per-Reviewer Distribution */}
              {Object.keys(shadowResult.reviewerBreakdown).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Per-Reviewer Distribution
                  </h4>
                  <div className="mb-3 flex items-center gap-3">
                    <label className="text-xs font-medium">Algorithm:</label>
                    <select
                      value={shadowDistAlgoId}
                      onChange={e => setShadowDistAlgoId(e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      {shadowResult.summary.map(s => (
                        <option key={s.algorithmId} value={s.algorithmId}>
                          {s.algorithmLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const breakdown = shadowResult.reviewerBreakdown[shadowDistAlgoId]
                    if (!breakdown || breakdown.length === 0) {
                      return <p className="text-xs text-muted-foreground">No data for this algorithm.</p>
                    }
                    const maxPicks = Math.max(
                      ...breakdown.map(r => Math.max(r.actualPicks, r.shadowPicks)),
                      1
                    )
                    return (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Reviewer</TableHead>
                              <TableHead className="text-right">Actual</TableHead>
                              <TableHead className="text-right">Shadow</TableHead>
                              <TableHead className="text-right">Δ</TableHead>
                              <TableHead className="text-right">Rel (A/S)</TableHead>
                              <TableHead className="w-1/3">Distribution</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {breakdown.map((rb: ShadowReviewerBreakdown, i: number) => {
                              const actualBarW = Math.max(2, (rb.actualPicks / maxPicks) * 100)
                              const shadowBarW = Math.max(2, (rb.shadowPicks / maxPicks) * 100)
                              const delta = rb.shadowPicks - rb.actualPicks
                              return (
                                <TableRow key={rb.reviewerId}>
                                  <TableCell className="font-mono text-xs">{rb.username}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{rb.actualPicks}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{rb.shadowPicks}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">
                                    {delta > 0 ? (
                                      <span className="text-green-400">+{delta}</span>
                                    ) : delta < 0 ? (
                                      <span className="text-red-400">{delta}</span>
                                    ) : (
                                      <span className="text-muted-foreground">0</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                    {rb.avgReliabilityActual.toFixed(2)} / {rb.avgReliabilityShadow.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="space-y-1">
                                      <div className="w-full bg-muted rounded-full h-1.5">
                                        <div
                                          className={`h-1.5 rounded-full ${i < 3 ? 'bg-amber-500' : 'bg-primary/40'}`}
                                          style={{ width: `${actualBarW}%` }}
                                        />
                                      </div>
                                      <div className="w-full bg-muted rounded-full h-1.5">
                                        <div
                                          className={`h-1.5 rounded-full ${i < 3 ? 'bg-emerald-500' : 'bg-primary/40'}`}
                                          style={{ width: `${shadowBarW}%` }}
                                        />
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ) : shadowResult && shadowResult.summary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Eye className="w-10 h-10 text-muted-foreground mb-3" />
              <h4 className="text-sm font-medium mb-1">No Shadow Logs Yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                Shadow logs are written when real assignments happen.
                Make sure fairness is deployed and assignments are being created,
                then check back.
              </p>
            </div>
          ) : !shadowLoading && !shadowError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Eye className="w-10 h-10 text-muted-foreground mb-3" />
              <h4 className="text-sm font-medium mb-1">Shadow Monitor Ready</h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                Click &ldquo;Refresh&rdquo; to fetch shadow logs for the selected date range.
                The shadow runs fairness algorithms alongside real assignments without
                changing them.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Empty state */}
      {!result && !running && !error && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ready to Simulate</h3>
            <p className="text-muted-foreground max-w-md">
              Select a date range and algorithms above, then click &ldquo;Run Simulation&rdquo; to compare
              how different assignment strategies affect reviewer distribution.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

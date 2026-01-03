'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Calculator,
  RefreshCw,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  AlertTriangle,
  CheckCircle,
  Check,
  X,
  Info,
  Lightbulb,
  Target,
  BarChart3,
  Sparkles,
  Loader2,
  Activity,
  FileText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { ReviewerMetrics, FormulaWeights, EdgeCaseGroup, RecommendationData, OptimizationResult, ConsensusImpactData, InverseSignalAuditData, ROOT_CAUSE_DESCRIPTIONS } from './lib/types'
import {
  FORMULA_PRESETS,
  calculateScore,
  calculateScoreWithBreakdown,
  calculateStats,
  calculateRankChanges,
  getWeightsTotal,
  generateRecommendation,
  identifyBad,
  identifyGood,
  classifyReviewers,
  calculateFeatureMatrix,
  calculateCorrelationMatrix,
  calculateConsensusImpact,
} from './lib/formulas'
import { optimizeWeights } from './lib/optimizer'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from 'recharts'


export default function ReliabilitySimulatorPage() {
  const { user, isLoading: loading } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()
  const [reviewers, setReviewers] = useState<ReviewerMetrics[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [selectedFormulas, setSelectedFormulas] = useState<string[]>(['current'])
  const [customWeights, setCustomWeights] = useState<FormulaWeights>(FORMULA_PRESETS.find(p => p.id === 'CUSTOM_V1')?.weights || FORMULA_PRESETS[0].weights)
  const [useCustom, setUseCustom] = useState(false)
  const [selectedReviewer, setSelectedReviewer] = useState<ReviewerMetrics | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [v2OptimizationResult, setV2OptimizationResult] = useState<OptimizationResult | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [auditData, setAuditData] = useState<InverseSignalAuditData | null>(null)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [useVoteValidation, setUseVoteValidation] = useState(true)
  const [enableShadowMode, setEnableShadowMode] = useState(true)

  const fetchReviewerData = useCallback(async () => {
    try {
      setLoadingData(true)
      const response = await authenticatedFetch('/api/admin/reliability-simulator')
      if (response.ok) {
        const data = await response.json()
        setReviewers(data.reviewers)
        if (data.debugInfo) setDebugInfo(data.debugInfo)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('API Error:', response.status, errorData)
        setDebugInfo({ error: `API Error ${response.status}: ${errorData.details || errorData.error || 'Unknown'}` })
      }
    } catch (error) {
      console.error('Error fetching reviewer data:', error)
    } finally {
      setLoadingData(false)
    }
  }, [authenticatedFetch])

  const fetchAuditData = useCallback(async () => {
    try {
      setLoadingAudit(true)
      const response = await authenticatedFetch('/api/admin/reliability-simulator/inverse-signal-audit')
      if (response.ok) {
        const data = await response.json()
        setAuditData(data)
      }
    } catch (error) {
      console.error('Error fetching audit data:', error)
    } finally {
      setLoadingAudit(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    fetchReviewerData()
    fetchAuditData()
  }, [fetchReviewerData, fetchAuditData])

  // Calculate scores for all selected formulas
  const formulaResults = useMemo(() => {
    const results: Record<string, { scores: number[]; stats: ReturnType<typeof calculateStats> }> = {}

    const formulasToCompare = useCustom
      ? [...selectedFormulas, 'custom']
      : selectedFormulas

    formulasToCompare.forEach(formulaId => {
      const preset = FORMULA_PRESETS.find(p => p.id === formulaId)
      let weights = formulaId === 'custom'
        ? { ...customWeights }
        : { ...preset?.weights }

      if (weights) {
        // Apply system configuration
        if (!useVoteValidation) {
          weights.voteValidation = 0
        }

        const scores = reviewers.map(r => calculateScore(r, weights as FormulaWeights, preset?.defaultValues))
        results[formulaId] = {
          scores,
          stats: calculateStats(scores),
        }
      }
    })

    return results
  }, [reviewers, selectedFormulas, customWeights, useCustom])

  // Calculate rank changes between current and selected/custom formula
  const rankChanges = useMemo(() => {
    const currentWeights = FORMULA_PRESETS.find(p => p.id === 'current')!.weights
    const selectedPreset = FORMULA_PRESETS.find(p => p.id === selectedFormulas[selectedFormulas.length - 1])
    const compareWeights = useCustom
      ? customWeights
      : selectedPreset?.weights || currentWeights
    const compareDefaults = useCustom
      ? undefined // Could potentially use a default for custom too
      : selectedPreset?.defaultValues

    return calculateRankChanges(reviewers, currentWeights, compareWeights, compareDefaults)
  }, [reviewers, selectedFormulas, customWeights, useCustom])

  // Edge case analysis
  const edgeCases = useMemo((): EdgeCaseGroup[] => {
    const currentWeights = FORMULA_PRESETS.find(p => p.id === 'current')!.weights
    const newWeights = useCustom ? customWeights : FORMULA_PRESETS.find(p => p.id === selectedFormulas[selectedFormulas.length - 1])?.weights || currentWeights

    const groups: EdgeCaseGroup[] = []

    // New reviewers (< 5 reviews)
    const newReviewers = reviewers.filter(r => r.totalReviews < 5)
    if (newReviewers.length > 0) {
      const currentAvg = newReviewers.reduce((sum, r) => sum + calculateScore(r, currentWeights), 0) / newReviewers.length
      const newAvg = newReviewers.reduce((sum, r) => sum + calculateScore(r, newWeights), 0) / newReviewers.length
      groups.push({
        name: 'New Reviewers',
        description: '< 5 reviews completed',
        reviewers: newReviewers,
        currentAvg,
        newAvg,
        insight: newAvg < currentAvg - 0.05 ? 'New formula penalizes new reviewers more' : 'New reviewers treated fairly',
        severity: newAvg < currentAvg - 0.1 ? 'warning' : 'info',
      })
    }

    // High missed reviews (> 3)
    const highMissed = reviewers.filter(r => r.missedReviews > 3)
    if (highMissed.length > 0) {
      const currentAvg = highMissed.reduce((sum, r) => sum + calculateScore(r, currentWeights), 0) / highMissed.length
      const newAvg = highMissed.reduce((sum, r) => sum + calculateScore(r, newWeights), 0) / highMissed.length
      groups.push({
        name: 'High Missed Reviews',
        description: '> 3 missed reviews',
        reviewers: highMissed,
        currentAvg,
        newAvg,
        insight: newAvg < currentAvg ? 'Correctly penalizes unreliable reviewers' : 'May not penalize unreliable reviewers enough',
        severity: newAvg < currentAvg ? 'success' : 'warning',
      })
    }

    // Vote-invalidated reviewers
    const invalidated = reviewers.filter(r => r.votesInvalidated > 0)
    if (invalidated.length > 0) {
      const currentAvg = invalidated.reduce((sum, r) => sum + calculateScore(r, currentWeights), 0) / invalidated.length
      const newAvg = invalidated.reduce((sum, r) => sum + calculateScore(r, newWeights), 0) / invalidated.length
      groups.push({
        name: 'Vote-Invalidated Reviewers',
        description: 'Has invalidated votes',
        reviewers: invalidated,
        currentAvg,
        newAvg,
        insight: newAvg < currentAvg ? 'Reflects community feedback' : 'May not reflect community feedback',
        severity: newAvg < currentAvg ? 'success' : 'info',
      })
    }

    // High performers (top 10% by quality)
    const sortedByQuality = [...reviewers].sort((a, b) => b.quality - a.quality)
    const topPerformers = sortedByQuality.slice(0, Math.max(1, Math.floor(reviewers.length * 0.1)))
    if (topPerformers.length > 0) {
      const currentAvg = topPerformers.reduce((sum, r) => sum + calculateScore(r, currentWeights), 0) / topPerformers.length
      const newAvg = topPerformers.reduce((sum, r) => sum + calculateScore(r, newWeights), 0) / topPerformers.length
      groups.push({
        name: 'Top Performers',
        description: 'Top 10% by quality rating',
        reviewers: topPerformers,
        currentAvg,
        newAvg,
        insight: newAvg >= currentAvg ? 'Top performers still rewarded' : 'May undervalue top performers',
        severity: newAvg >= currentAvg - 0.05 ? 'success' : 'warning',
      })
    }

    return groups
  }, [reviewers, selectedFormulas, customWeights, useCustom])

  // Generate recommendation
  const recommendation = useMemo((): RecommendationData => {
    return generateRecommendation(
      reviewers,
      selectedFormulas,
      useCustom ? customWeights : null
    )
  }, [reviewers, selectedFormulas, customWeights, useCustom])

  const handleWeightChange = (key: keyof FormulaWeights, value: number) => {
    setCustomWeights(prev => ({ ...prev, [key]: value }))
  }

  const exportToCSV = () => {
    const headers = ['Username', 'Email', 'Total Reviews', 'Current Score', 'New Score', 'Score Delta', 'Current Rank', 'New Rank', 'Rank Delta']
    const rows = rankChanges.map(r => [
      r.username,
      reviewers.find(rev => rev.id === r.reviewerId)?.email || '',
      reviewers.find(rev => rev.id === r.reviewerId)?.totalReviews || 0,
      r.currentScore.toFixed(3),
      r.newScore.toFixed(3),
      r.scoreDelta.toFixed(3),
      r.currentRank,
      r.newRank,
      r.rankDelta,
    ])

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reliability-comparison-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Helper to ensure displayed weights sum to exactly 100.0%
  const getDisplayWeights = (weights: FormulaWeights) => {
    const entries = Object.entries(weights)
      .filter(([k]) => k !== 'quality') // Quality is always 0 in custom

    const rounded = entries.map(([k, v]) => ({
      key: k,
      value: Math.round((v as number) * 1000) / 10
    }))

    const sum = rounded.reduce((s, item) => s + item.value, 0)
    const diff = Math.round((100 - sum) * 10) / 10

    if (diff !== 0 && rounded.length > 0) {
      // Adjust the largest weight to absorb rounding error
      const largest = rounded.reduce((prev, curr) => (prev.value > curr.value) ? prev : curr)
      largest.value = Math.round((largest.value + diff) * 10) / 10
    }

    const result: Record<string, number> = {}
    rounded.forEach(item => result[item.key] = item.value)
    return result
  }

  if (user?.role !== 'ADMIN') {
    return null
  }

  const weightsTotal = getWeightsTotal(customWeights)
  const isWeightsValid = Math.abs(weightsTotal - 1) < 0.001

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calculator className="h-8 w-8 text-info" />
              Reliability Formula Simulator
            </h1>
            <p className="text-muted-foreground">
              Test different reliability scoring formulas against real reviewer data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{reviewers.length} reviewers</Badge>
            <Button variant="outline" size="sm" onClick={fetchReviewerData} disabled={loadingData}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingData ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {loadingData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-8 bg-muted rounded w-3/4"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar - Formula Selection */}
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    System Configuration
                  </CardTitle>
                  <CardDescription>Global reliability settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="vote-validation" className="text-sm font-medium cursor-pointer">
                        Vote Validation
                      </label>
                      <p className="text-xs text-muted-foreground">Include community voting data</p>
                    </div>
                    <Checkbox
                      id="vote-validation"
                      checked={useVoteValidation}
                      onCheckedChange={(checked) => setUseVoteValidation(!!checked)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="shadow-mode" className="text-sm font-medium cursor-pointer">
                        Shadow Mode
                      </label>
                      <p className="text-xs text-muted-foreground">Run parallel formula tests</p>
                    </div>
                    <Checkbox
                      id="shadow-mode"
                      checked={enableShadowMode}
                      onCheckedChange={(checked) => setEnableShadowMode(!!checked)}
                    />
                  </div>
                  {enableShadowMode && (
                    <div className="space-y-2 mt-2">
                      <Link href="/admin/shadow-mode" className="block">
                        <Button variant="outline" size="sm" className="w-full">
                          <Activity className="h-4 w-4 mr-2" />
                          View Shadow Logs
                        </Button>
                      </Link>
                      <Link href="/admin/live-monitor" className="block">
                        <Button variant="default" size="sm" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black">
                          <Zap className="h-4 w-4 mr-2 fill-current" />
                          Live Monitor
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Select Formulas</CardTitle>
                  <CardDescription>Choose formulas to compare</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center space-x-2 pb-2 border-b mb-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedFormulas.length === FORMULA_PRESETS.length && useCustom}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedFormulas(FORMULA_PRESETS.map(p => p.id))
                          setUseCustom(true)
                        } else {
                          setSelectedFormulas([])
                          setUseCustom(false)
                        }
                      }}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                      Select All
                    </label>
                  </div>
                  {FORMULA_PRESETS.map(preset => (
                    <div key={preset.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={preset.id}
                        checked={selectedFormulas.includes(preset.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedFormulas([...selectedFormulas, preset.id])
                          } else {
                            setSelectedFormulas(selectedFormulas.filter(f => f !== preset.id))
                          }
                        }}
                      />
                      <label htmlFor={preset.id} className="text-sm cursor-pointer">
                        <div className="font-medium">{preset.name}</div>
                        <div className="text-xs text-muted-foreground">{preset.description}</div>
                      </label>
                    </div>
                  ))}
                  <div className="flex items-start space-x-2 pt-2 border-t">
                    <Checkbox
                      id="custom"
                      checked={useCustom}
                      onCheckedChange={(checked) => setUseCustom(!!checked)}
                    />
                    <label htmlFor="custom" className="text-sm cursor-pointer">
                      <div className="font-medium">Custom Formula</div>
                      <div className="text-xs text-muted-foreground">Define your own weights</div>
                    </label>
                  </div>
                </CardContent>
              </Card>

              {useCustom && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      Custom Weights
                      <Badge variant={isWeightsValid ? 'default' : 'destructive'}>
                        {(weightsTotal * 100).toFixed(1)}%
                      </Badge>
                    </CardTitle>
                    {!isWeightsValid && (
                      <CardDescription className="text-destructive">
                        Weights must sum to 100%
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const displayWeights = getDisplayWeights(customWeights)
                      return Object.entries(customWeights)
                        .filter(([key]) => {
                          if (key === 'quality') return false
                          if (key === 'voteValidation' && !useVoteValidation) return false
                          return true
                        })
                        .map(([key, value]) => (
                          <div key={key} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span>{displayWeights[key].toFixed(1)}%</span>
                            </div>
                            <Slider
                              value={[value * 100]}
                              onValueChange={([v]) => handleWeightChange(key as keyof FormulaWeights, v / 100)}
                              max={100}
                              step={0.1}
                            />
                          </div>
                        ))
                    })()}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setCustomWeights(FORMULA_PRESETS.find(p => p.id === 'withExperience')?.weights || FORMULA_PRESETS[0].weights)}
                      >
                        Reset
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const total = getWeightsTotal(customWeights)
                          if (total === 0) return
                          const normalized: any = {}
                          Object.keys(customWeights).forEach(k => {
                            normalized[k] = customWeights[k as keyof FormulaWeights] / total
                          })
                          setCustomWeights(normalized)
                        }}
                      >
                        Normalize
                      </Button>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          setOptimizing(true)
                          setTimeout(() => {
                            const result = optimizeWeights(reviewers, { maxIterations: 80 })
                            setOptimizationResult(result)
                            setCustomWeights(result.weights)
                            setOptimizing(false)
                          }, 50)
                        }}
                        disabled={optimizing || reviewers.length === 0}
                      >
                        {optimizing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-1" />
                            AI Optimize
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-[10px]"
                        onClick={() => {
                          setOptimizing(true)
                          setTimeout(() => {
                            const result = optimizeWeights(reviewers, {
                              maxIterations: 100,
                              forceInclude: ['voteValidation']
                            })
                            setV2OptimizationResult(result)
                            // We don't setCustomWeights here to avoid affecting the user's current custom formula
                            setOptimizing(false)
                          }, 50)
                        }}
                        disabled={optimizing || reviewers.length === 0}
                      >
                        {optimizing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Zap className="h-3 w-3 mr-1" />
                            Optimize V2
                          </>
                        )}
                      </Button>
                    </div>
                    {optimizationResult && (
                      <div className="mt-3 p-3 bg-primary/10 rounded-lg text-xs space-y-1">
                        <div className="font-medium flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Custom Optimization Result
                        </div>
                        <div className="text-muted-foreground">
                          Fitness: {(optimizationResult.score * 100).toFixed(1)}% •
                          {optimizationResult.iterations} iterations
                        </div>
                      </div>
                    )}
                    {v2OptimizationResult && (
                      <div className="mt-2 p-3 bg-warning/10 border border-warning/20 rounded-lg text-xs space-y-1">
                        <div className="font-medium flex items-center gap-1 text-warning-foreground">
                          <Zap className="h-3 w-3" />
                          V2 Optimized Weights (Voting Focus)
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 font-mono text-[10px]">
                          {(() => {
                            const displayWeights = getDisplayWeights(v2OptimizationResult.weights)
                            return Object.entries(v2OptimizationResult.weights)
                              .filter(([_, w]) => (w as number) >= 0.001)
                              .map(([k, w]) => (
                                <div key={k} className="flex justify-between">
                                  <span>{k}:</span>
                                  <span className="font-bold">{displayWeights[k].toFixed(1)}%</span>
                                </div>
                              ))
                          })()}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2 h-7 text-[10px] hover:bg-warning/20"
                          onClick={() => {
                            setCustomWeights(v2OptimizationResult.weights)
                            setUseCustom(true)
                          }}
                        >
                          Apply to Custom Formula
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3">
              <Tabs defaultValue="recommendation" className="w-full">
                <TabsList className="grid w-full grid-cols-7">
                  <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
                  <TabsTrigger value="comparison">Comparison</TabsTrigger>
                  <TabsTrigger value="distribution">Distribution</TabsTrigger>
                  <TabsTrigger value="rankings">Rankings</TabsTrigger>
                  <TabsTrigger value="edge-cases">Edge Cases</TabsTrigger>
                  <TabsTrigger value="consensus-impact">Consensus Impact</TabsTrigger>
                  <TabsTrigger value="audit" className="relative">
                    Audit
                    {auditData?.isInverseSignalDetected && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="recommendation" className="space-y-6 mt-6">
                  <RecommendationTab
                    recommendation={recommendation}
                    reviewers={reviewers}
                    rankChanges={rankChanges}
                    useCustom={useCustom}
                    customWeights={customWeights}
                    selectedFormulas={selectedFormulas}
                  />
                </TabsContent>

                <TabsContent value="comparison" className="space-y-6 mt-6">
                  <ComparisonTab
                    formulaResults={formulaResults}
                    useCustom={useCustom}
                    reviewers={reviewers}
                  />
                </TabsContent>

                <TabsContent value="distribution" className="space-y-6 mt-6">
                  <DistributionTab
                    formulaResults={formulaResults}
                  />
                </TabsContent>

                <TabsContent value="rankings" className="space-y-6 mt-6">
                  <RankingsTab
                    rankChanges={rankChanges}
                    reviewers={reviewers}
                    onSelectReviewer={setSelectedReviewer}
                    currentFormulaName="Formula A (Current)"
                    newFormulaName={useCustom ? "Custom Formula" : (FORMULA_PRESETS.find(p => p.id === selectedFormulas[selectedFormulas.length - 1])?.name.split(':')[0] || "New Formula")}
                  />
                </TabsContent>

                <TabsContent value="edge-cases" className="space-y-6 mt-6">
                  <EdgeCasesTab edgeCases={edgeCases} />
                </TabsContent>

                <TabsContent value="consensus-impact" className="space-y-6 mt-6">
                  <ConsensusImpactTab
                    reviewers={reviewers}
                    selectedFormulas={selectedFormulas}
                    useCustom={useCustom}
                    customWeights={customWeights}
                  />
                </TabsContent>

                <TabsContent value="audit" className="space-y-6 mt-6">
                  <InverseSignalAuditTab
                    auditData={auditData}
                    loading={loadingAudit}
                    onRefresh={fetchAuditData}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}

        <ReviewerDetailModal
          reviewer={selectedReviewer}
          customWeights={customWeights}
          useCustom={useCustom}
          selectedFormulas={selectedFormulas}
          onClose={() => setSelectedReviewer(null)}
        />
      </div>
    </div >
  )
}

function ScoreBar({ value, color = 'bg-primary' }: { value: number; color?: string }) {
  const percentage = Math.min(100, Math.max(0, value * 100))
  return (
    <div className="w-full flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-mono w-8 text-right">{percentage.toFixed(0)}%</span>
    </div>
  )
}

function ComparisonTab({
  formulaResults,
  useCustom,
  reviewers,
}: {
  formulaResults: Record<string, { scores: number[]; stats: ReturnType<typeof calculateStats> }>
  useCustom: boolean
  reviewers: ReviewerMetrics[]
}) {
  const formulaIds = Object.keys(formulaResults)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {formulaIds.map(formulaId => {
          const preset = FORMULA_PRESETS.find(p => p.id === formulaId)
          const name = formulaId === 'custom' ? 'Custom Formula' : preset?.name || formulaId
          const stats = formulaResults[formulaId].stats

          return (
            <Card key={formulaId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mean:</span>
                    <span className="ml-2 font-mono">{stats.mean.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Std Dev:</span>
                    <span className="ml-2 font-mono">{stats.stdDev.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Min:</span>
                    <span className="ml-2 font-mono">{stats.min.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max:</span>
                    <span className="ml-2 font-mono">{stats.max.toFixed(3)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {formulaIds.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Score Correlation</CardTitle>
            <CardDescription>
              Current formula vs {useCustom ? 'Custom' : formulaIds[formulaIds.length - 1]} formula
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="current"
                    name="Current Score"
                    domain={[0, 1]}
                    label={{ value: 'Current Score', position: 'bottom', offset: 0 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="new"
                    name="New Score"
                    domain={[0, 1]}
                    label={{ value: 'New Score', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-background border rounded p-2 text-sm">
                            <div className="font-medium">{data.username}</div>
                            <div>Current: {data.current.toFixed(3)}</div>
                            <div>New: {data.new.toFixed(3)}</div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <ReferenceLine
                    segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                    stroke="#888"
                    strokeDasharray="5 5"
                  />
                  <Scatter
                    data={reviewers.map((r, i) => ({
                      username: r.username,
                      current: formulaResults['current']?.scores[i] || 0,
                      new: formulaResults[useCustom ? 'custom' : formulaIds[formulaIds.length - 1]]?.scores[i] || 0,
                    }))}
                    fill="hsl(var(--primary))"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DistributionTab({
  formulaResults,
}: {
  formulaResults: Record<string, { scores: number[]; stats: ReturnType<typeof calculateStats> }>
}) {
  const formulaIds = Object.keys(formulaResults)
  const histogramData = Array.from({ length: 10 }, (_, i) => {
    const bucket = ((i + 1) / 10).toFixed(1)
    const data: Record<string, number | string> = { bucket }
    formulaIds.forEach(formulaId => {
      const dist = formulaResults[formulaId].stats.distribution
      data[formulaId] = dist[i]?.count || 0
    })
    return data
  })

  const colors = ['hsl(var(--primary))', 'hsl(var(--info))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))']

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Distribution</CardTitle>
        <CardDescription>Number of reviewers in each score bucket</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Legend />
              {formulaIds.map((formulaId, index) => {
                const preset = FORMULA_PRESETS.find(p => p.id === formulaId)
                const name = formulaId === 'custom' ? 'Custom' : preset?.name.split(':')[0] || formulaId
                return (
                  <Bar
                    key={formulaId}
                    dataKey={formulaId}
                    name={name}
                    fill={colors[index % colors.length]}
                    opacity={0.8}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function RankingsTab({
  rankChanges,
  reviewers,
  onSelectReviewer,
  currentFormulaName,
  newFormulaName,
}: {
  rankChanges: ReturnType<typeof calculateRankChanges>
  reviewers: ReviewerMetrics[]
  onSelectReviewer: (r: ReviewerMetrics) => void
  currentFormulaName: string
  newFormulaName: string
}) {
  const [filter, setFilter] = useState<'all' | 'gainers' | 'losers'>('all')
  const filteredChanges = rankChanges.filter(r => {
    if (filter === 'gainers') return r.rankDelta > 0
    if (filter === 'losers') return r.rankDelta < 0
    return true
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rank Changes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewer</TableHead>
              <TableHead className="text-right">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold whitespace-nowrap">Current</span>
                  <span className="text-xs whitespace-nowrap">{currentFormulaName}</span>
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold whitespace-nowrap">New</span>
                  <span className="text-xs whitespace-nowrap text-primary">{newFormulaName}</span>
                </div>
              </TableHead>
              <TableHead className="text-right">Rank Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredChanges.slice(0, 20).map(r => {
              const reviewer = reviewers.find(rev => rev.id === r.reviewerId)
              return (
                <TableRow
                  key={r.reviewerId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => reviewer && onSelectReviewer(reviewer)}
                >
                  <TableCell className="font-medium">{r.username}</TableCell>
                  <TableCell className="text-right font-mono">{r.currentScore.toFixed(3)}</TableCell>
                  <TableCell className="text-right font-mono">{r.newScore.toFixed(3)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.rankDelta > 0 ? 'default' : r.rankDelta < 0 ? 'destructive' : 'outline'}>
                      {r.rankDelta > 0 ? '↑' : r.rankDelta < 0 ? '↓' : '–'}{Math.abs(r.rankDelta)}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function RecommendationTab({
  recommendation,
  reviewers,
  rankChanges,
  useCustom,
  customWeights,
  selectedFormulas,
}: {
  recommendation: RecommendationData
  reviewers: ReviewerMetrics[]
  rankChanges: ReturnType<typeof calculateRankChanges>
  useCustom: boolean
  customWeights: FormulaWeights
  selectedFormulas: string[]
}) {
  const { bestFormula, evaluations, insights } = recommendation

  const getRecommendationBadge = (rec: 'RECOMMENDED' | 'ACCEPTABLE' | 'NOT_RECOMMENDED') => {
    switch (rec) {
      case 'RECOMMENDED': return <Badge className="bg-success text-success-foreground">Recommended</Badge>
      case 'ACCEPTABLE': return <Badge variant="outline">Acceptable</Badge>
      case 'NOT_RECOMMENDED': return <Badge variant="destructive">Not Recommended</Badge>
    }
  }

  const gainers = rankChanges.filter(r => r.scoreDelta > 0.05).length
  const losers = rankChanges.filter(r => r.scoreDelta < -0.05).length
  const avgRankChange = rankChanges.reduce((sum, r) => sum + Math.abs(r.rankDelta), 0) / Math.max(1, rankChanges.length)

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-full">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-bold">{gainers}</div>
              <div className="text-xs text-muted-foreground">Reviewers with score gain {'>'} 5%</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <div className="text-2xl font-bold">{losers}</div>
              <div className="text-xs text-muted-foreground">Reviewers with score loss {'>'} 5%</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-info/10 rounded-full">
              <BarChart3 className="h-5 w-5 text-info" />
            </div>
            <div>
              <div className="text-2xl font-bold">{avgRankChange.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Average rank change per reviewer</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {bestFormula && (
        <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {getRecommendationBadge(bestFormula.recommendation)}
              <span className="text-xl font-semibold">{bestFormula.formulaName}</span>
              <span className="text-muted-foreground">
                (Score: {(bestFormula.overallScore * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Reasons:</h4>
                <ul className="space-y-1">
                  {bestFormula.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Trade-offs:</h4>
                <ul className="space-y-1">
                  {bestFormula.tradeoffs.map((tradeoff, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      {tradeoff}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Formula</TableHead>
                <TableHead className="text-center">Discrimination</TableHead>
                <TableHead className="text-center">Cluster Match</TableHead>
                <TableHead className="text-center">Fairness</TableHead>
                <TableHead className="text-center">Stability</TableHead>
                <TableHead className="text-center">Overall</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluations.map(e => (
                <TableRow key={e.formulaId}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{e.formulaName.split(':')[0]}</span>
                      {(() => {
                        const preset = FORMULA_PRESETS.find(p => p.id === e.formulaId)
                        const hasQualityWeight = preset?.weights.quality && preset.weights.quality > 0
                        const hasDefaultQuality = preset?.defaultValues?.quality !== undefined
                        const hasQualityData = reviewers.some(r => r.avgQualityRating > 0)

                        if (hasQualityWeight && !hasDefaultQuality && !hasQualityData) {
                          return (
                            <Badge variant="outline" className="text-[8px] h-4 w-fit border-warning text-warning mt-1">
                              Auto-Adjusted
                            </Badge>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <ScoreBar value={e.discrimination} />
                      <span className="text-[10px] text-muted-foreground mt-1">
                        ±{e.discriminationMargin.toFixed(2)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center"><ScoreBar value={e.knownBadAccuracy} /></TableCell>
                  <TableCell className="text-center"><ScoreBar value={e.fairness} /></TableCell>
                  <TableCell className="text-center"><ScoreBar value={e.stability} /></TableCell>
                  <TableCell className="text-center font-mono font-medium">
                    {Math.min(100, Math.round(e.overallScore * 100))}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-muted-foreground border-t pt-4">
            <div>
              <span className="font-semibold text-foreground">Discrimination:</span>
              <br />How well scores are spread out (higher is better)
            </div>
            <div>
              <span className="font-semibold text-foreground">Cluster Match:</span>
              <br />How well the formula groups the &quot;Low Performance&quot; cluster at the bottom (uses K-Means)
            </div>
            <div>
              <span className="font-semibold text-foreground">Fairness:</span>
              <br />How fairly new reviewers are treated (target 70%)
            </div>
            <div>
              <span className="font-semibold text-foreground">Stability:</span>
              <br />Correlation with current rankings
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Health Audit */}
      <Card className="border-2 border-warning/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-warning" />
            Metric Health Audit
          </CardTitle>
          <CardDescription className="text-xs">
            Detecting anomalies and data quality issues that may skew results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Inverse Signal Warning */}
            {insights.accuracyImpact.includes("Inverse Correlation") && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2 text-destructive font-bold text-xs mb-1">
                  <AlertTriangle className="h-3 w-3" />
                  CRITICAL: Inverse Accuracy Signal Detected
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Your &quot;bad&quot; reviewers (by timeliness/penalties) have HIGHER accuracy than your &quot;good&quot; ones.
                  This suggests that either your definition of &quot;bad&quot; is wrong, or the consensus mechanism is being pulled towards unreliable reviewers.
                </p>
              </div>
            )}

            {/* Formula A Vulnerability */}
            {!reviewers.some(r => r.avgQualityRating > 0) && (
              <div className={`p-3 border rounded-lg ${FORMULA_PRESETS.find(p => p.id === 'current')?.defaultValues?.quality ? 'bg-info/10 border-info/20' : 'bg-warning/10 border-warning/20'}`}>
                <div className={`flex items-center gap-2 font-bold text-xs mb-1 ${FORMULA_PRESETS.find(p => p.id === 'current')?.defaultValues?.quality ? 'text-info-foreground' : 'text-warning-foreground'}`}>
                  <Info className="h-3 w-3" />
                  {FORMULA_PRESETS.find(p => p.id === 'current')?.defaultValues?.quality ? 'Formula A Using Legacy Defaults' : 'Formula A Baseline is Compromised'}
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {FORMULA_PRESETS.find(p => p.id === 'current')?.defaultValues?.quality
                    ? `Quality data is missing, but Formula A is using the legacy default of ${(FORMULA_PRESETS.find(p => p.id === 'current')!.defaultValues!.quality! * 5).toFixed(1)} to maintain baseline consistency.`
                    : `Formula A relies on 70% Quality data, which is currently 0% available. The simulator has auto-adjusted Formula A to 100% Timeliness. Any comparison against Formula A is effectively a comparison against a "Timeliness-Only" model.`}
                </p>
              </div>
            )}

            {/* Low Variance Warning */}
            {avgRankChange < 3 && (
              <div className="p-3 bg-info/10 border border-info/20 rounded-lg">
                <div className="flex items-center gap-2 text-info-foreground font-bold text-xs mb-1">
                  <Minus className="h-3 w-3" />
                  Low Formula Sensitivity
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Changing formulas results in an average rank change of only {avgRankChange.toFixed(1)}.
                  This means your reviewer pool is very homogeneous, and formula choice has minimal impact on the current dataset.
                  <strong className="block mt-1">The simulator is currently more useful for stress-testing future scenarios than optimizing current ones.</strong>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="h-4 w-4 text-warning" />
              Data Insights (Dataset-Wide)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <Target className="h-3 w-3 text-info" />
                  Accuracy Impact
                </h4>
                <p className="text-xs text-muted-foreground">{insights.accuracyImpact}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <Users className="h-3 w-3 text-primary" />
                  Voting Impact
                </h4>
                <p className="text-xs text-muted-foreground">{insights.votingImpact}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-success" />
                  New Reviewer Fairness
                </h4>
                <p className="text-xs text-muted-foreground">{insights.newReviewerFairness}</p>
              </div>

              {/* New Insights */}
              <div className="space-y-1">
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  Consistency Analysis
                </h4>
                <p className="text-xs text-muted-foreground">{insights.consistencyAnalysis}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <Sparkles className="h-3 w-3 text-warning" />
                  Experience Impact
                </h4>
                <p className="text-xs text-muted-foreground">{insights.experienceImpact}</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  Penalty Effectiveness
                </h4>
                <p className="text-xs text-muted-foreground">{insights.penaltyEffectiveness}</p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                {(() => {
                  const { good, middle, bad } = classifyReviewers(reviewers)
                  return (
                    <>
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold flex items-center gap-2 text-success">
                          <CheckCircle className="h-3 w-3" />
                          Good Reviewers ({good.length})
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {good.length > 0 ? (
                            good.map((g: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] bg-success/5 border-success/20 text-success-foreground">
                                {g.reviewer.username}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None identified</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold flex items-center gap-2 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          Middle Tier ({middle.length})
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {middle.length > 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">
                              {middle.map((m: any) => m.username).join(', ')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold flex items-center gap-2 text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          Bad Reviewers ({bad.length})
                        </h4>
                        <div className="flex flex-col gap-1 mt-1">
                          {bad.length > 0 ? (
                            bad.map((b: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs bg-destructive/10 p-1.5 px-2 rounded border border-destructive/20">
                                <span className="font-medium text-destructive">{b.reviewer.username}</span>
                                <span className="text-muted-foreground text-[10px] ml-2">{b.reasons.join(', ')}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None identified</span>
                          )}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-success" />
              Data Health Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(customWeights).map(([key, _]) => {
                  const metric = reviewers.some(r => {
                    if (key === 'quality') return r.avgQualityRating > 0
                    if (key === 'accuracy') return r.accuracy !== 0.5
                    if (key === 'voteValidation') return r.votesValidated > 0 || r.votesInvalidated > 0
                    if (key === 'penaltyScore') return r.penaltyScore !== 1.0
                    if (key === 'missedPenalty') return r.missedPenalty !== 1.0
                    return (r[key as keyof ReviewerMetrics] as number) !== 0
                  })
                  return (
                    <Badge
                      key={key}
                      variant={metric ? 'default' : 'outline'}
                      className={metric ? 'bg-success/20 text-success hover:bg-success/30 border-success/30' : 'opacity-50'}
                    >
                      {metric ? '●' : '○'} {key.replace(/([A-Z])/g, ' $1').trim()}
                    </Badge>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                ● = Alive (Data found) | ○ = Dead Code (No data in DB)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <FeatureAnalysis
        reviewers={reviewers}
        weights={useCustom ? customWeights : (FORMULA_PRESETS.find(p => p.id === selectedFormulas[selectedFormulas.length - 1])?.weights || FORMULA_PRESETS[0].weights)}
      />

      <MetricImportanceAnalysis
        reviewers={reviewers}
        currentWeights={useCustom ? customWeights : (FORMULA_PRESETS.find(p => p.id === selectedFormulas[selectedFormulas.length - 1])?.weights || FORMULA_PRESETS[0].weights)}
      />
    </div>
  )
}


function FeatureAnalysis({ reviewers, weights }: { reviewers: ReviewerMetrics[], weights: FormulaWeights }) {
  const [view, setView] = useState<'matrix' | 'correlation'>('matrix')

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Feature & Correlation Analysis
          </CardTitle>
          <CardDescription>
            {view === 'matrix'
              ? "Cross-referencing metrics against natural reviewer clusters (Unsupervised)"
              : "Pearson correlation between metrics (-1.0 to +1.0)"}
          </CardDescription>
        </div>
        <div className="flex bg-muted p-1 rounded-md">
          <Button
            variant={view === 'matrix' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('matrix')}
            className="text-xs h-8"
          >
            Importance Matrix
          </Button>
          <Button
            variant={view === 'correlation' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('correlation')}
            className="text-xs h-8"
          >
            Correlation Heatmap
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'matrix' ? (
          <FeatureImportanceMatrix reviewers={reviewers} weights={weights} />
        ) : (
          <CorrelationMatrix reviewers={reviewers} />
        )}

        <div className="mt-8 pt-6 border-t border-primary/10">
          <h4 className="text-sm font-bold flex items-center gap-2 mb-4">
            <Lightbulb className="h-4 w-4 text-warning" />
            AI Insights & Interpretation
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground">1. What the numbers tell us</h5>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The <strong>Z-Scores</strong> show relative performance. A +1.2 in Accuracy means that group is significantly better than the rest.
                The <strong>Correlation</strong> shows if metrics are "fighting" each other. If Accuracy and Timeliness have a negative correlation (red),
                it means your most accurate people are also your slowest.
              </p>
            </div>
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground">2. How the AI Brain uses this</h5>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The AI doesn't just "guess." It looks for <strong>High Importance</strong> metrics to create "Discrimination" (spread).
                It uses the Correlation Heatmap to avoid <strong>Redundancy</strong> (e.g., if two metrics are 0.9 correlated, it will reduce weight on one to prevent double-penalizing).
              </p>
            </div>
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground">3. Is the formula "wrong"?</h5>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                A formula is "wrong" if it has a low <strong>Cluster Match</strong>. This happens when the statistical "Low Signal" group
                (found via K-Means) doesn't match the "Bad Reviewers" (found via missed reviews). The AI optimizes to
                align these two signals into one source of truth.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FeatureImportanceMatrix({ reviewers, weights }: { reviewers: ReviewerMetrics[], weights: FormulaWeights }) {
  const matrix = useMemo(() => calculateFeatureMatrix(reviewers, weights), [reviewers, weights])

  if (matrix.clusters.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Metric</TableHead>
              {matrix.clusters.map((cluster, i) => (
                <TableHead key={i} className="text-center">
                  <div className="flex flex-col items-center">
                    <span className="font-bold text-foreground">{cluster.name}</span>
                    <span className="text-[10px] text-muted-foreground">n={cluster.size} | Avg {(cluster.avgScore * 100).toFixed(0)}%</span>
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-right">Importance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.metrics.map((m) => (
              <TableRow key={m.name} className="group">
                <TableCell className="font-medium group-hover:text-primary transition-colors">{m.label}</TableCell>
                {matrix.clusters.map((cluster, i) => {
                  const z = cluster.zScores[m.name]
                  const val = cluster.metrics[m.name]

                  // Premium Heatmap Coloring
                  let bgColor = "transparent"
                  let textColor = "inherit"
                  const opacity = Math.min(0.8, Math.abs(z) / 2)

                  if (z > 0.2) {
                    bgColor = `rgba(34, 197, 94, ${opacity})` // success/green
                    textColor = z > 0.8 ? "white" : "inherit"
                  } else if (z < -0.2) {
                    bgColor = `rgba(239, 68, 68, ${opacity})` // destructive/red
                    textColor = z < -0.8 ? "white" : "inherit"
                  }

                  return (
                    <TableCell key={i} className="text-center p-0">
                      <div
                        className="w-full h-full py-3 px-2 flex flex-col items-center justify-center transition-all duration-300"
                        style={{ backgroundColor: bgColor, color: textColor }}
                      >
                        <div className="flex items-center gap-1 font-mono text-xs font-bold">
                          {z > 0 ? '+' : ''}{z.toFixed(1)}
                        </div>
                        <div className="text-[10px] opacity-70">
                          {(val * 100).toFixed(0)}%
                        </div>
                      </div>
                    </TableCell>
                  )
                })}
                <TableCell className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${m.importance}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold">{m.importance.toFixed(0)}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] text-muted-foreground border-t pt-4 italic">
        <div>
          <span className="font-semibold text-foreground">Z-Score:</span> Deviation from global average.
          <br />+1.0 means this cluster is 1 standard deviation ABOVE average for this metric.
        </div>
        <div>
          <span className="font-semibold text-foreground">Importance:</span> Variance across clusters.
          <br />High importance means this metric is what primarily separates the groups.
        </div>
      </div>
    </div>
  )
}

function CorrelationMatrix({ reviewers }: { reviewers: ReviewerMetrics[] }) {
  const { metrics, matrix } = useMemo(() => calculateCorrelationMatrix(reviewers), [reviewers])

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[150px]"></TableHead>
              {metrics.map((m, i) => (
                <TableHead key={i} className="text-center text-[10px] font-bold rotate-[-45deg] h-20 align-bottom pb-2">
                  {m}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((m1, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-xs">{m1}</TableCell>
                {metrics.map((m2, j) => {
                  const val = matrix[i][j]
                  const absVal = Math.abs(val)
                  const opacity = absVal * 0.8

                  let bgColor = "transparent"
                  let textColor = "inherit"

                  if (val > 0.1) {
                    bgColor = `rgba(34, 197, 94, ${opacity})`
                    textColor = absVal > 0.6 ? "white" : "inherit"
                  } else if (val < -0.1) {
                    bgColor = `rgba(239, 68, 68, ${opacity})`
                    textColor = absVal > 0.6 ? "white" : "inherit"
                  }

                  return (
                    <TableCell key={j} className="p-0 text-center border border-muted/20">
                      <div
                        className="w-full h-10 flex items-center justify-center text-[10px] font-mono font-bold transition-all duration-300"
                        style={{ backgroundColor: bgColor, color: textColor }}
                        title={`${m1} vs ${m2}: ${val.toFixed(3)}`}
                      >
                        {val.toFixed(2)}
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t pt-4 italic">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-success/60 rounded"></div>
          <span>Positive Correlation (Move together)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-destructive/60 rounded"></div>
          <span>Negative Correlation (Move opposite)</span>
        </div>
        <div className="ml-auto">
          <span className="font-semibold text-foreground">Tip:</span> Look for red cells to find metrics that conflict with each other.
        </div>
      </div>
    </div>
  )
}

function MetricImportanceAnalysis({ reviewers, currentWeights }: { reviewers: ReviewerMetrics[], currentWeights: FormulaWeights }) {
  const analysis = useMemo(() => {
    const metrics: (keyof FormulaWeights)[] = [
      'timeliness', 'quality', 'accuracy', 'voteValidation',
      'experience', 'missedPenalty', 'penaltyScore',
      'reviewVariance', 'latePercentage'
    ]

    const badReviewers = reviewers.filter(r => identifyBad(r).isBad)
    const goodReviewers = reviewers.filter(r => identifyGood(r).isGood)

    const results = metrics.map(metric => {
      const withData = reviewers.filter(r => {
        if (metric === 'quality') return r.avgQualityRating > 0
        if (metric === 'accuracy') return r.accuracy !== 0.5
        if (metric === 'voteValidation') return r.votesValidated > 0 || r.votesInvalidated > 0
        return true
      })
      const availability = withData.length / reviewers.length

      const bAvg = badReviewers.length > 0 ? badReviewers.reduce((sum, r) => sum + (r[metric] as number), 0) / badReviewers.length : 0
      const gAvg = goodReviewers.length > 0 ? goodReviewers.reduce((sum, r) => sum + (r[metric] as number), 0) / goodReviewers.length : 0
      const separationPower = Math.abs(gAvg - bAvg)
      const weight = currentWeights[metric] || 0

      // Calculate Contribution %: (Weight * Raw Variance) / Total Variance
      // This shows how much this metric actually drives the final score spread
      const rawValues = reviewers.map(r => r[metric] as number)
      const mean = rawValues.reduce((a, b) => a + b, 0) / rawValues.length
      const variance = rawValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / rawValues.length
      const contributionPower = weight * Math.sqrt(variance)

      return { metric, label: metric.replace(/([A-Z])/g, ' $1').trim(), availability, separationPower, badAvg: bAvg, goodAvg: gAvg, weight, contributionPower }
    })

    const totalPower = results.reduce((sum, r) => sum + r.contributionPower, 0) || 1
    return results.map(r => ({
      ...r,
      contributionPct: r.contributionPower / totalPower
    })).map(r => {
      let status = "Secondary"
      let statusColor = "text-muted-foreground"
      let recommendation = "Moderate signal. Useful as a secondary component."

      if (r.availability < 0.1) {
        status = "No Data"
        statusColor = "text-destructive"
        recommendation = "Critical: No data available. AI will ignore this."
      } else if (r.badAvg > r.goodAvg + 0.1) {
        status = "Inverse Signal"
        statusColor = "text-warning italic"
        recommendation = r.weight > 0
          ? `Inverse correlation detected (Bad > Good), but AI selected this for its high separation power.`
          : "Inverse correlation detected. AI may prioritize other metrics with clearer separation."
      } else if (r.badAvg > r.goodAvg) {
        status = "Weak Inverse"
        statusColor = "text-muted-foreground italic"
        recommendation = "Slight inverse correlation detected. Not heavily penalized."
      } else if (r.weight > 0.01) {
        status = "AI Selected"
        statusColor = "text-success font-bold"
        recommendation = "Currently active. This metric is a primary driver of your scores."
      } else if (r.separationPower > 0.5) {
        status = "High Signal"
        statusColor = "text-info"
        recommendation = "Strong separator! The AI may use this to break ties or improve stability."
      }

      if (r.metric === 'experience' && r.weight < 0.01 && r.availability >= 0.1 && r.separationPower > 0.3) {
        recommendation = "High signal, but ignored to maintain Fairness for new reviewers."
      }

      return { ...r, status, statusColor, recommendation }
    }).sort((a, b) => b.separationPower - a.separationPower)
  }, [reviewers, currentWeights])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Metric Importance Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-center">Coverage</TableHead>
              <TableHead className="text-center">Good Avg</TableHead>
              <TableHead className="text-center">Bad Avg</TableHead>
              <TableHead className="text-center">AI Status</TableHead>
              <TableHead className="text-center">Weight</TableHead>
              <TableHead className="text-center">Contribution</TableHead>
              <TableHead>AI Reasoning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.map(r => (
              <TableRow key={r.metric}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={r.availability > 0.7 ? 'default' : r.availability > 0.1 ? 'secondary' : 'destructive'} className="text-[10px]">
                    {(r.availability * 100).toFixed(0)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-center font-mono">{r.availability < 0.1 ? '—' : r.goodAvg.toFixed(2)}</TableCell>
                <TableCell className="text-center font-mono">{r.availability < 0.1 ? '—' : r.badAvg.toFixed(2)}</TableCell>
                <TableCell className={`text-center text-xs ${r.statusColor}`}>{r.status}</TableCell>
                <TableCell className="text-center font-mono">{(r.weight * 100).toFixed(0)}%</TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${(r.contributionPct * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono">{(r.contributionPct * 100).toFixed(0)}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.recommendation}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function EdgeCasesTab({ edgeCases }: { edgeCases: EdgeCaseGroup[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {edgeCases.map((group, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle className="text-lg">{group.name}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm">
                <div className="text-muted-foreground">Current Avg</div>
                <div className="text-xl font-bold font-mono">{group.currentAvg.toFixed(3)}</div>
              </div>
              <div className="text-sm text-right">
                <div className="text-muted-foreground">New Avg</div>
                <div className="text-xl font-bold font-mono">{group.newAvg.toFixed(3)}</div>
              </div>
            </div>
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${group.severity === 'warning' ? 'bg-warning/10 text-warning-foreground' : group.severity === 'success' ? 'bg-success/10 text-success-foreground' : 'bg-info/10 text-info-foreground'}`}>
              <Info className="h-4 w-4 mt-0.5" />
              {group.insight}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ReviewerDetailModal({
  reviewer,
  customWeights,
  useCustom,
  selectedFormulas,
  onClose,
}: {
  reviewer: ReviewerMetrics | null
  customWeights: FormulaWeights
  useCustom: boolean
  selectedFormulas: string[]
  onClose: () => void
}) {
  if (!reviewer) return null

  const currentWeights = FORMULA_PRESETS.find(p => p.id === 'current')?.weights || FORMULA_PRESETS[0].weights
  const newWeights = useCustom ? customWeights : (FORMULA_PRESETS.find(p => p.id === selectedFormulas[selectedFormulas.length - 1])?.weights || currentWeights)

  const currentResult = calculateScoreWithBreakdown(reviewer, currentWeights)
  const newResult = calculateScoreWithBreakdown(reviewer, newWeights)

  // Helper to render the breakdown table
  const renderBreakdownTable = (result: ReturnType<typeof calculateScoreWithBreakdown>, title: string, isPrimary = false) => (
    <Card className={isPrimary ? "border-primary" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex justify-between items-center">
          {title}
          <span className={`text-lg font-bold ${isPrimary ? "text-primary" : ""}`}>
            {(result.score * 100).toFixed(1)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-xs">Metric</TableHead>
              <TableHead className="h-8 text-xs text-right">Raw</TableHead>
              <TableHead className="h-8 text-xs text-right">Weight</TableHead>
              <TableHead className="h-8 text-xs text-right">Contrib</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.breakdown.map(c => (
              <TableRow key={c.component} className="hover:bg-muted/50">
                <TableCell className="py-2 text-xs font-medium">{c.component}</TableCell>
                <TableCell className="py-2 text-xs text-right">{(c.rawValue * 100).toFixed(0)}%</TableCell>
                <TableCell className="py-2 text-xs text-right text-muted-foreground">{(c.weight * 100).toFixed(0)}%</TableCell>
                <TableCell className="py-2 text-xs text-right font-mono">
                  +{(c.contribution * 100).toFixed(1)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="hover:bg-transparent font-bold border-t-2">
              <TableCell className="py-2 text-xs">Total</TableCell>
              <TableCell className="py-2 text-xs text-right"></TableCell>
              <TableCell className="py-2 text-xs text-right">100%</TableCell>
              <TableCell className="py-2 text-xs text-right">{(result.score * 100).toFixed(1)}%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )

  return (
    <Dialog open={!!reviewer} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reviewer Detail: {reviewer.username}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Top Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">Total Reviews</div>
              <div className="text-lg font-bold">{reviewer.totalReviews}</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">Accuracy (Raw)</div>
              <div className="text-lg font-bold">{(reviewer.accuracy * 100).toFixed(0)}%</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">Timeliness (Raw)</div>
              <div className="text-lg font-bold">{(reviewer.timeliness * 100).toFixed(0)}%</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">Penalty Score</div>
              <div className="text-lg font-bold">{(reviewer.penaltyScore * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderBreakdownTable(currentResult, "Current Formula")}
            {renderBreakdownTable(newResult, "New Formula", true)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConsensusImpactTab({
  reviewers,
  selectedFormulas,
  useCustom,
  customWeights
}: {
  reviewers: ReviewerMetrics[]
  selectedFormulas: string[]
  useCustom: boolean
  customWeights: FormulaWeights
}) {
  const impactData = useMemo(() => {
    const formulas = selectedFormulas
      .filter(id => id !== 'custom')
      .map(id => ({
        id,
        name: FORMULA_PRESETS.find(p => p.id === id)?.name || id,
        weights: FORMULA_PRESETS.find(p => p.id === id)?.weights || FORMULA_PRESETS[0].weights
      }))
    if (useCustom) {
      formulas.push({ id: 'custom', name: 'Custom Formula', weights: customWeights })
    }
    return calculateConsensusImpact(reviewers, formulas)
  }, [reviewers, selectedFormulas, useCustom, customWeights])

  const baseline = impactData.find(d => d.formulaId === 'unweighted')
  const others = impactData.filter(d => d.formulaId !== 'unweighted')

  const isNegligible = others.length >= 1 && baseline &&
    Math.abs(others[0].avgConsensusVariance - baseline.avgConsensusVariance) < 0.3

  return (
    <div className="space-y-6">
      <Card className="border-2 border-info/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-info" />
            Consensus Impact Analysis
          </CardTitle>
          <CardDescription>
            Simulating 200 submissions with 3-5 reviewers each. Comparing formulas against a <strong>Naive Baseline</strong> (unweighted average).
            {isNegligible && (
              <span className="block text-destructive font-bold mt-2 p-2 bg-destructive/10 rounded border border-destructive/20">
                ⚠️ NOTE: Formula choice has negligible impact on consensus stability compared to baseline.
                Focus on Stress Test resilience instead.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Formula</TableHead>
                <TableHead className="text-right">Consensus Variance</TableHead>
                <TableHead className="text-right">Outlier Resilience</TableHead>
                <TableHead className="text-right">Top-3 Agreement</TableHead>
                <TableHead className="text-right">Avg Outlier Shift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {impactData.map(d => (
                <TableRow key={d.formulaId} className={d.formulaId === 'unweighted' ? 'bg-muted/50 font-italic' : ''}>
                  <TableCell className="font-medium">
                    {d.formulaName}
                    {d.formulaId === 'unweighted' && <Badge variant="outline" className="ml-2">Baseline</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {d.avgConsensusVariance.toFixed(1)} <span className="text-[10px] text-muted-foreground">±{d.varianceCI.toFixed(1)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={d.outlierResilience > 0.6 ? 'default' : 'destructive'}>
                      {(d.outlierResilience * 100).toFixed(0)}%
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-1">±{(d.resilienceCI * 100).toFixed(0)}%</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {(d.top3Agreement * 100).toFixed(0)}% <span className="text-[10px] text-muted-foreground">±{(d.agreementCI * 100).toFixed(0)}%</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ±{d.avgOutlierShift.toFixed(1)} <span className="text-[10px] text-muted-foreground">±{d.shiftCI.toFixed(1)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stress Test Section */}
      <Card className="border-2 border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Formula Stress Tests (Extreme Scenarios)
          </CardTitle>
          <CardDescription>
            Testing formula resilience against deliberate attacks. Scenarios use <strong>4 reviewers</strong> (1 target + 3 controls) to isolate impact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {impactData[0]?.stressTests.map((test, testIdx) => (
              <div key={test.name} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm">{test.name}</h4>
                    <p className="text-xs text-muted-foreground">{test.scenario}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {impactData.map(d => {
                    const formulaTest = d.stressTests[testIdx]
                    return (
                      <div key={d.formulaId} className={`p-3 rounded-lg border ${d.formulaId === 'unweighted' ? 'bg-muted/50 border-dashed' : 'bg-muted/30'}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium">{d.formulaName.split(':')[0]}</span>
                          <Badge variant={formulaTest.score > 0.8 ? 'default' : formulaTest.score > 0.5 ? 'secondary' : 'destructive'} className="text-[10px]">
                            {(formulaTest.score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {formulaTest.impact}
                        </div>
                        <Progress value={formulaTest.score * 100} className="h-1 mt-2" />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deployment Checklist */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Pre-Deployment Checklist
          </CardTitle>
          <CardDescription>
            Final safety checks before promoting a formula to production.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-1 rounded-full ${others[0]?.stressTests[0].score > 0.7 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                  {others[0]?.stressTests[0].score > 0.7 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Stress Test Resilience</p>
                  <p className="text-xs text-muted-foreground">Formula must score {'>'}70% on Griefer Attack resilience.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className={`mt-1 p-1 rounded-full ${!isNegligible ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                  {!isNegligible ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Consensus Improvement</p>
                  <p className="text-xs text-muted-foreground">Formula should show measurable improvement over naive baseline.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 rounded-full bg-warning/20 text-warning">
                  <AlertTriangle className="h-3 w-3" />
                </div>
                <div>
                  <p className="text-sm font-medium">Manual Audit Required</p>
                  <p className="text-xs text-muted-foreground">Audit "Bad but Accurate" reviewers to ensure signals aren't inverted.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 rounded-full bg-info/20 text-info">
                  <Info className="h-3 w-3" />
                </div>
                <div>
                  <p className="text-sm font-medium">Parallel Run Recommended</p>
                  <p className="text-xs text-muted-foreground">Run in shadow mode for 2 weeks before full enforcement.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Outlier Resilience</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Measures how much a single &quot;bad&quot; vote (+50 XP) shifts the final consensus. Higher is better (less shift).
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Consensus Variance</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Average spread of votes around the weighted mean. Lower variance indicates more stable, convergent judgments.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top-3 Agreement</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Percentage of cases where the 3 most &quot;reliable&quot; reviewers (by formula) agree within 15 XP of each other.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
function InverseSignalAuditTab({
  auditData,
  loading,
  onRefresh
}: {
  auditData: InverseSignalAuditData | null
  loading: boolean
  onRefresh: () => void
}) {
  const [selectedReviewer, setSelectedReviewer] = useState<any | null>(null)

  if (loading && !auditData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Running automated inverse signal audit...</p>
      </div>
    )
  }

  if (!auditData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No audit data available.</p>
        <Button onClick={onRefresh}>Run Audit</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className={`h-5 w-5 ${auditData.isInverseSignalDetected ? 'text-destructive' : 'text-success'}`} />
            Inverse Signal Audit
          </h3>
          <p className="text-sm text-muted-foreground">
            Automated detection of signal inversion between good and bad reviewers.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Re-run Audit
        </Button>
      </div>

      {/* Status Banner */}
      <Card className={`border-2 ${auditData.isInverseSignalDetected ? 'border-destructive/50 bg-destructive/5' : 'border-success/50 bg-success/5'}`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-full ${auditData.isInverseSignalDetected ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'}`}>
              {auditData.isInverseSignalDetected ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle className="h-6 w-6" />}
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-lg">
                {auditData.isInverseSignalDetected ? 'Inverse Signal Detected' : 'Audit Passed'}
              </h4>
              <p className="text-sm opacity-90">
                {auditData.isInverseSignalDetected
                  ? `Bad reviewers have ${(auditData.signalDelta * 100).toFixed(1)}% higher accuracy than good reviewers. This indicates a potential flaw in the current formula or data signals.`
                  : 'Good reviewers consistently outperform bad reviewers in accuracy. The current signals are healthy.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-destructive" />
              Bad Reviewers Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(auditData.badReviewerAvgAccuracy * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Average accuracy of reviewers flagged as "Bad"
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-success" />
              Good Reviewers Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{(auditData.goodReviewerAvgAccuracy * 100).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Average accuracy of reviewers flagged as "Good"
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Patterns and Root Cause */}
      {auditData.isInverseSignalDetected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-md flex items-center gap-2">
                <Search className="h-4 w-4" />
                Detected Patterns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {auditData.patterns.length > 0 ? (
                auditData.patterns.map(pattern => (
                  <div key={pattern.id} className="p-4 rounded-lg border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{pattern.name}</span>
                      <Badge variant="secondary">{(pattern.confidence * 100).toFixed(0)}% confidence</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{pattern.description}</p>
                    <div className="text-xs font-medium text-primary">
                      Suggested Action: {pattern.suggestedAction}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No clear patterns detected.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-md flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Inferred Root Cause
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditData.suggestedRootCause ? (
                <div className="space-y-4">
                  <div className="p-3 rounded bg-primary/10 border border-primary/20">
                    <div className="font-bold text-primary">
                      {ROOT_CAUSE_DESCRIPTIONS[auditData.suggestedRootCause].title}
                    </div>
                    <div className="text-xs mt-1">
                      Severity: <span className="capitalize font-semibold">{ROOT_CAUSE_DESCRIPTIONS[auditData.suggestedRootCause].severity}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ROOT_CAUSE_DESCRIPTIONS[auditData.suggestedRootCause].description}
                  </p>
                  <div className="p-3 rounded bg-muted text-xs font-medium">
                    <div className="text-muted-foreground mb-1">Recommended Action:</div>
                    {ROOT_CAUSE_DESCRIPTIONS[auditData.suggestedRootCause].action}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Insufficient data to infer root cause.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reviewer Tables */}
      <Tabs defaultValue="bad-reviewers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bad-reviewers">
            Bad Reviewers ({auditData.allBad.length})
          </TabsTrigger>
          <TabsTrigger value="middle-tier">
            Middle Tier ({auditData.middleTier.length})
          </TabsTrigger>
          <TabsTrigger value="good-reviewers">
            Good Reviewers ({auditData.allGood.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bad-reviewers" className="mt-4">
          <ReviewerAuditTable
            reviewers={auditData.allBad}
            onViewHistory={setSelectedReviewer}
            goodAvgAccuracy={auditData.goodReviewerAvgAccuracy}
          />
        </TabsContent>

        <TabsContent value="middle-tier" className="mt-4">
          <ReviewerAuditTable
            reviewers={auditData.middleTier}
            onViewHistory={setSelectedReviewer}
          />
        </TabsContent>

        <TabsContent value="good-reviewers" className="mt-4">
          <ReviewerAuditTable
            reviewers={auditData.allGood}
            onViewHistory={setSelectedReviewer}
            badAvgAccuracy={auditData.badReviewerAvgAccuracy}
          />
        </TabsContent>
      </Tabs>

      {/* History Dialog */}
      <Dialog open={!!selectedReviewer} onOpenChange={(open) => !open && setSelectedReviewer(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review History: {selectedReviewer?.username}</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submission</TableHead>
                  <TableHead className="text-right">Reviewer XP</TableHead>
                  <TableHead className="text-right">Consensus</TableHead>
                  <TableHead className="text-right">Deviation</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedReviewer?.reviewHistory.map((h: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[200px] truncate">{h.submissionTitle}</TableCell>
                    <TableCell className="text-right font-mono">{h.reviewerXpScore}</TableCell>
                    <TableCell className="text-right font-mono">
                      {h.deviation === null ? 'N/A' : h.finalConsensus}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={h.deviation === null ? 'outline' : h.deviation <= 15 ? 'default' : 'destructive'}>
                        {h.deviation === null ? 'N/A' : `${h.deviation.toFixed(1)} XP`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {h.wasLate ? (
                        <Badge variant="outline" className="text-destructive border-destructive">Late</Badge>
                      ) : (
                        <Badge variant="outline" className="text-success border-success">On-time</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Threshold checking helper
function ThresholdCell({
  value,
  goodThreshold,
  badThreshold,
  showPercent = true,
  inverse = false, // If true, lower is better
}: {
  value: number
  goodThreshold?: number
  badThreshold?: number
  showPercent?: boolean
  inverse?: boolean
}) {
  const displayValue = showPercent ? `${(value * 100).toFixed(0)}%` : value.toFixed(0)

  // Calculate status
  let status: 'good' | 'bad' | 'neutral' = 'neutral'

  // Check Bad first (priority)
  if (badThreshold !== undefined) {
    const isBad = inverse ? value > badThreshold : value < badThreshold
    if (isBad) status = 'bad'
  }

  // Check Good if not bad
  if (status !== 'bad' && goodThreshold !== undefined) {
    const isGood = inverse ? value <= goodThreshold : value >= goodThreshold
    if (isGood) status = 'good'
  }

  return (
    <div className={`font-mono font-bold text-center ${status === 'bad' ? 'text-destructive bg-destructive/10 rounded px-2 py-1' :
      status === 'good' ? 'text-success bg-success/10 rounded px-2 py-1' :
        'text-muted-foreground bg-muted/30 rounded px-2 py-1'
      }`}>
      {displayValue}
    </div>
  )
}

function ReviewerAuditTable({
  reviewers,
  onViewHistory,
  goodAvgAccuracy,
  badAvgAccuracy
}: {
  reviewers: any[]
  onViewHistory: (r: any) => void
  goodAvgAccuracy?: number
  badAvgAccuracy?: number
}) {
  return (
    <Card>
      <div className="px-4 py-3 border-b bg-muted/20 text-xs space-y-1">
        <div className="flex gap-2">
          <span className="font-bold text-destructive w-10 shrink-0">Bad:</span>
          <span className="text-muted-foreground">
            Fails <strong>ANY Hard</strong> (Penalty &lt; 80%, Missed &lt; 75%) —OR— <strong>2+ Soft</strong> (Timeliness &lt; 70%, Accuracy &lt; 50%)
          </span>
        </div>
        <div className="flex gap-2">
          <span className="font-bold text-success w-10 shrink-0">Good:</span>
          <span className="text-muted-foreground">
            Passes <strong>ALL Core</strong> (Exp ≥ 50%, Pen ≥ 90%, Missed ≥ 90%, Time ≥ 85%) —AND— <strong>1+ Bonus</strong> (Acc ≥ 65%, Time ≥ 95%)
          </span>
        </div>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewer</TableHead>
              <TableHead className="text-center">Timeliness<br /><span className="text-[9px] text-muted-foreground">Good:≥85% Bad:&lt;70%</span></TableHead>
              <TableHead className="text-center">Accuracy<br /><span className="text-[9px] text-muted-foreground">Bonus:≥65%</span></TableHead>
              <TableHead className="text-center">Variance<br /><span className="text-[9px] text-muted-foreground">Informational</span></TableHead>
              <TableHead className="text-center">Penalty<br /><span className="text-[9px] text-muted-foreground">Good:≥90% Bad:&lt;80%</span></TableHead>
              <TableHead className="text-center">MissedPen<br /><span className="text-[9px] text-muted-foreground">Good:≥90% Bad:&lt;75%</span></TableHead>
              <TableHead className="text-center">Experience<br /><span className="text-[9px] text-muted-foreground">Good:≥50%</span></TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviewers.length > 0 ? (
              reviewers.map(r => {
                return (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="font-medium">{r.username}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                      <div className="text-[10px] text-muted-foreground">{r.totalReviews} reviews</div>
                    </TableCell>
                    <TableCell>
                      <ThresholdCell
                        value={r.timeliness}
                        goodThreshold={0.85}
                        badThreshold={0.70}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center gap-1">
                        <ThresholdCell
                          value={r.accuracy}
                          goodThreshold={0.65} // Bonus threshold
                        />
                        {goodAvgAccuracy && r.accuracy > goodAvgAccuracy && (
                          <Badge variant="destructive" className="text-[8px] h-4 px-1">Signal Inv</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ThresholdCell
                        value={r.reviewVariance}
                      // Thresholds removed as they are no longer used for classification
                      />
                    </TableCell>
                    <TableCell>
                      <ThresholdCell
                        value={r.penaltyScore}
                        goodThreshold={0.90}
                        badThreshold={0.80} // Hard fail
                      />
                    </TableCell>
                    <TableCell>
                      <ThresholdCell
                        value={r.missedPenalty}
                        goodThreshold={0.90}
                        badThreshold={0.75} // Hard fail
                      />
                    </TableCell>
                    <TableCell>
                      <ThresholdCell
                        value={r.experience}
                        goodThreshold={0.50}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px]" title={r.reason}>
                      {r.reason || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onViewHistory(r)}>
                        <FileText className="h-4 w-4 mr-1" />
                        History
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No reviewers found in this category.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

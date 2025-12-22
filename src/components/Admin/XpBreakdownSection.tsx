'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Edit,
  Award,
  Bot,
  Users,
  Calculator,
  TrendingUp,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import XpModificationDialog from './XpModificationDialog'

interface XpBreakdownSectionProps {
  submission: {
    id: string
    aiXp: number
    peerXp: number | null
    finalXp: number | null
    originalityScore: number | null
    consensusScore: number | null
    reviewCount: number
    status: string
    platform?: string
    aiEvaluation?: {
      status: string | null
    } | null
    aiEvaluationSettings?: {
      globallyEnabled: boolean
      hasEvaluation: boolean
    }
  }
  onUpdate: () => void
}

export default function XpBreakdownSection({ submission, onUpdate }: XpBreakdownSectionProps) {
  const envAiDisabled = (process.env.NEXT_PUBLIC_AI_DISABLED || 'false') === 'true'
  const isLegacy = Boolean(
    submission.platform?.toUpperCase().includes('LEGACY') ||
    submission.taskTypes?.some(task => task.toUpperCase() === 'LEGACY')
  )
  const aiGloballyEnabled = submission.aiEvaluationSettings?.globallyEnabled ?? !envAiDisabled
  const hasAiEvaluationData = submission.aiEvaluationSettings?.hasEvaluation ?? Boolean(
    submission.aiEvaluation && submission.aiEvaluation.status === 'COMPLETED'
  )
  const showAiSection = hasAiEvaluationData && !isLegacy
  const aiEvaluationEnabled = showAiSection && aiGloballyEnabled

  const [modificationDialog, setModificationDialog] = useState<{
    open: boolean
    xpType: 'ai' | 'peer' | 'final'
    currentXp: number
  }>({
    open: false,
    xpType: 'ai',
    currentXp: 0
  })

  const openModificationDialog = (xpType: 'ai' | 'peer' | 'final', currentXp: number) => {
    setModificationDialog({
      open: true,
      xpType,
      currentXp
    })
  }

  const getXpStatusColor = (xp: number | null) => {
    if (xp === null) return 'text-muted-foreground'
    if (xp >= 80) return 'text-green-600 dark:text-green-300'
    if (xp >= 60) return 'text-blue-600 dark:text-blue-300'
    if (xp >= 40) return 'text-yellow-600 dark:text-yellow-300'
    return 'text-red-600 dark:text-red-300'
  }

  const getXpStatusBadge = (xp: number | null) => {
    if (xp === null) return <Badge variant="outline">Pending</Badge>
    if (xp >= 80) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>
    if (xp >= 60) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>
    if (xp >= 40) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>
  }

  const calculateFinalXpSuggestion = () => {
    if (submission.peerXp === null || isLegacy) return null
    if (!aiEvaluationEnabled) return Math.round(submission.peerXp)
    return Math.round((submission.aiXp * 0.4) + (submission.peerXp * 0.6))
  }

  const suggestedFinalXp = calculateFinalXpSuggestion()
  const hasDiscrepancy = submission.finalXp !== null && suggestedFinalXp !== null &&
                        Math.abs(submission.finalXp - suggestedFinalXp) > 10
  const xpDifference = submission.finalXp !== null && suggestedFinalXp !== null
    ? submission.finalXp - suggestedFinalXp
    : null
  const aiDisabledHeading = isLegacy
    ? 'AI Evaluation (legacy)'
    : aiGloballyEnabled
      ? 'AI Evaluation (inactive)'
      : 'AI Evaluation (disabled)'
  const aiDisabledDescription = isLegacy
    ? 'Legacy submissions rely on imported peer XP only.'
    : aiGloballyEnabled
      ? 'This submission has no AI evaluation recorded yet.'
      : 'AI scoring is currently turned off. Final XP is determined 100% by peer reviews.'

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            XP Breakdown & Modification
          </CardTitle>
          <CardDescription>
            Detailed XP analysis with admin modification controls
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* AI XP Section */}
          {!showAiSection ? (
            <div className="p-4 border rounded-lg bg-muted/30 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-muted-foreground">{aiDisabledHeading}</h3>
              </div>
              <div className="text-sm text-muted-foreground">
                {aiDisabledDescription}
              </div>
            </div>
          ) : (
            <div className="p-4 border rounded-lg dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    {aiEvaluationEnabled ? 'AI Evaluation' : 'AI Evaluation (read-only)'}
                  </h3>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openModificationDialog('ai', submission.aiXp ?? 0)}
                  disabled={!aiEvaluationEnabled}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Modify
                </Button>
              </div>

              {!aiEvaluationEnabled && (
                <div className="mb-3 text-xs text-muted-foreground">
                  AI scoring is currently turned off; values shown below are read-only.
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className={`text-3xl font-bold ${getXpStatusColor(submission.aiXp)} dark:text-blue-200`}>
                    {submission.aiXp ?? 'N/A'}
                  </div>
                  <div className="text-sm text-muted-foreground">XP Score</div>
                </div>
                <div className="text-right">
                  {getXpStatusBadge(submission.aiXp)}
                  {submission.originalityScore && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {(submission.originalityScore * 100).toFixed(1)}% originality
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-3 text-sm text-muted-foreground">
                {aiEvaluationEnabled
                  ? 'Automated evaluation based on content quality, originality, and task completion.'
                  : 'Legacy AI score shown for reference only. Peer reviewers now determine the final XP.'}
              </div>
            </div>
          )}

          {/* Peer XP Section */}
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600 dark:text-green-300" />
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Peer Review</h3>
              </div>
              {!isLegacy && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openModificationDialog('peer', submission.peerXp ?? 0)}
                  disabled={submission.peerXp === null}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Modify
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-3xl font-bold ${getXpStatusColor(submission.peerXp)}`}>
                  {submission.peerXp ?? 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">Average Score</div>
              </div>
              <div className="text-right">
                {getXpStatusBadge(submission.peerXp)}
                {submission.consensusScore && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {(submission.consensusScore * 100).toFixed(1)}% consensus
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-3 text-sm text-muted-foreground">
              {isLegacy ? (
                'Legacy submission: peer XP reflects the imported final award.'
              ) : (
                <>
                  Average of {submission.reviewCount} peer review{submission.reviewCount !== 1 ? 's' : ''}.
                  {submission.reviewCount < 3 && (
                    <span className="text-orange-600 ml-1 dark:text-amber-300">
                      ({Math.max(0, 3 - submission.reviewCount)} more needed for completion)
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Final XP Section */}
          <div className="p-5 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-emerald-100/80 to-white dark:from-emerald-950 dark:via-emerald-900/70 dark:to-slate-950/80 dark:border-emerald-500/40 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-200" />
                <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">Final XP Award</h3>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openModificationDialog('final', submission.finalXp ?? 0)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modify
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-4xl font-bold ${getXpStatusColor(submission.finalXp)} dark:text-emerald-200`}>
                  {submission.finalXp ?? 'Pending'}
                </div>
                <div className="text-sm text-muted-foreground">Final Award</div>
              </div>
              <div className="text-right">
                {getXpStatusBadge(submission.finalXp)}
                {submission.finalXp !== null && submission.status === 'FINALIZED' && (
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-300 text-sm mt-1">
                    <CheckCircle className="h-3 w-3" />
                    Awarded
                  </div>
                )}
              </div>
            </div>
            
            {/* XP Calculation Suggestion */}
            {suggestedFinalXp !== null && (
              <div className="mt-4 p-3 bg-white/80 dark:bg-slate-900/60 rounded border dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Suggested Final XP</div>
                    {aiEvaluationEnabled ? (
                      <div className="text-xs text-muted-foreground">Based on weighted average (40% AI, 60% Peer)</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Based on peer reviews only</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{suggestedFinalXp?.toLocaleString()}</div>
                    {submission.finalXp !== null && xpDifference !== null && (
                      <div className={`text-xs ${
                        hasDiscrepancy ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-300'
                      }`}>
                        {xpDifference === 0 ? 'Matches suggested value' : `${xpDifference > 0 ? '+' : ''}${xpDifference} vs ${aiEvaluationEnabled ? 'weighted' : 'peer'} suggestion`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Discrepancy Alert */}
          {hasDiscrepancy && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The final XP ({submission.finalXp}) differs significantly from the {aiEvaluationEnabled ? 'weighted suggestion' : 'peer-derived suggestion'}
                ({suggestedFinalXp}). This may indicate a manual adjustment or special
                circumstances.
              </AlertDescription>
            </Alert>
          )}

          {/* XP Flow Visualization */}
          <div className="p-4 bg-muted/30 rounded-lg">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              XP Flow
            </h4>
            <div className="flex items-center justify-between text-sm">
              {aiEvaluationEnabled && (
                <>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                      <Bot className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div className="font-medium">{submission.aiXp?.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">AI Score</div>
                  </div>
                  <div className="flex-1 h-px bg-border mx-4 relative">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">+</div>
                  </div>
                </>
              )}

              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mb-2">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-300" />
                </div>
                <div className="font-medium">{submission.peerXp?.toLocaleString() ?? '?'}</div>
                <div className="text-xs text-muted-foreground">Peer Avg</div>
              </div>
              
              <div className="flex-1 h-px bg-border mx-4 relative">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">=</div>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mb-2">
                  <Award className="h-6 w-6 text-emerald-600 dark:text-emerald-200" />
                </div>
                <div className="font-medium">{submission.finalXp ?? '?'}</div>
                <div className="text-xs text-muted-foreground">Final XP</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* XP Modification Dialog */}
      <XpModificationDialog
        open={modificationDialog.open}
        onOpenChange={(open) => setModificationDialog(prev => ({ ...prev, open }))}
        submissionId={submission.id}
        currentXp={modificationDialog.currentXp}
        xpType={modificationDialog.xpType}
        onSuccess={onUpdate}
      />
    </>
  )
}


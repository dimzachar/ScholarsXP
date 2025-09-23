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
  }
  onUpdate: () => void
}

export default function XpBreakdownSection({ submission, onUpdate }: XpBreakdownSectionProps) {
  const AI_DISABLED = (process.env.NEXT_PUBLIC_AI_DISABLED || 'false') === 'true'

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
    if (xp >= 80) return 'text-green-600'
    if (xp >= 60) return 'text-blue-600'
    if (xp >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getXpStatusBadge = (xp: number | null) => {
    if (xp === null) return <Badge variant="outline">Pending</Badge>
    if (xp >= 80) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>
    if (xp >= 60) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>
    if (xp >= 40) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>
  }

  const calculateFinalXpSuggestion = () => {
    if (submission.peerXp === null) return null
    if (AI_DISABLED) return Math.round(submission.peerXp)
    return Math.round((submission.aiXp * 0.4) + (submission.peerXp * 0.6))
  }

  const suggestedFinalXp = calculateFinalXpSuggestion()
  const hasDiscrepancy = submission.finalXp && suggestedFinalXp &&
                        Math.abs(submission.finalXp - suggestedFinalXp) > 10

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
          {AI_DISABLED ? (
            <div className="p-4 border rounded-lg opacity-70">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-500">AI Evaluation (disabled)</h3>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Final XP is determined solely by peer reviews.
              </div>
            </div>
          ) : (
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">AI Evaluation</h3>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openModificationDialog('ai', submission.aiXp)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Modify
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className={`text-3xl font-bold ${getXpStatusColor(submission.aiXp)}`}>
                    {submission.aiXp}
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
                Automated evaluation based on content quality, originality, and task completion.
              </div>
            </div>
          )}

          {/* Peer XP Section */}
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold">Peer Review</h3>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openModificationDialog('peer', submission.peerXp || 0)}
                disabled={submission.peerXp === null}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modify
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-3xl font-bold ${getXpStatusColor(submission.peerXp)}`}>
                  {submission.peerXp || 'N/A'}
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
              Average of {submission.reviewCount} peer review{submission.reviewCount !== 1 ? 's' : ''}.
              {submission.reviewCount < 3 && (
                <span className="text-orange-600 ml-1">
                  ({3 - submission.reviewCount} more needed for completion)
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Final XP Section */}
          <div className="p-4 border-2 border-purple-200 rounded-lg bg-purple-50/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold">Final XP Award</h3>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openModificationDialog('final', submission.finalXp || 0)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modify
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-4xl font-bold ${getXpStatusColor(submission.finalXp)}`}>
                  {submission.finalXp || 'Pending'}
                </div>
                <div className="text-sm text-muted-foreground">Final Award</div>
              </div>
              <div className="text-right">
                {getXpStatusBadge(submission.finalXp)}
                {submission.finalXp && submission.status === 'FINALIZED' && (
                  <div className="flex items-center gap-1 text-green-600 text-sm mt-1">
                    <CheckCircle className="h-3 w-3" />
                    Awarded
                  </div>
                )}
              </div>
            </div>
            
            {/* XP Calculation Suggestion */}
            {suggestedFinalXp && (
              <div className="mt-4 p-3 bg-white/80 rounded border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Suggested Final XP</div>
                    {AI_DISABLED ? (
                      <div className="text-xs text-muted-foreground">Based on peer reviews only</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Based on weighted average (40% AI, 60% Peer)</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">{suggestedFinalXp}</div>
                    {!AI_DISABLED && submission.finalXp && (
                      <div className={`text-xs ${
                        hasDiscrepancy ? 'text-orange-600' : 'text-green-600'
                      }`}>
                        {submission.finalXp > suggestedFinalXp ? '+' : ''}
                        {submission.finalXp - suggestedFinalXp} vs suggested
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
                The final XP ({submission.finalXp}) differs significantly from the suggested 
                calculation ({suggestedFinalXp}). This may indicate a manual adjustment 
                or special circumstances.
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
              {!AI_DISABLED && (
                <>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                      <Bot className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="font-medium">{submission.aiXp}</div>
                    <div className="text-xs text-muted-foreground">AI Score</div>
                  </div>
                  <div className="flex-1 h-px bg-border mx-4 relative">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">+</div>
                  </div>
                </>
              )}

              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div className="font-medium">{submission.peerXp || '?'}</div>
                <div className="text-xs text-muted-foreground">Peer Avg</div>
              </div>
              
              <div className="flex-1 h-px bg-border mx-4 relative">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">=</div>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                  <Award className="h-6 w-6 text-purple-600" />
                </div>
                <div className="font-medium">{submission.finalXp || '?'}</div>
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


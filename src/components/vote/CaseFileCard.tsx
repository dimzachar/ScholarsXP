'use client'

import { useState } from 'react'
import { 
  AlertTriangle, 
  BarChart3, 
  MessageSquare, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp,
  TrendingDown,
  TrendingUp,
  User,
  Activity,
  Zap
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ReviewerStats {
  reviewerId: string
  experienceLevel: 'new' | 'intermediate' | 'experienced'
  avgXpGiven: number
  recentReviewCount: number
  zeroScoreRate: number
  highScoreRate: number
  isHighVolume: boolean
  consensusAlignment: number
}

interface Contradiction {
  reviewerA: string
  reviewerB: string
  description: string
}

interface CaseAnalysis {
  summary: string
  contradictions: Contradiction[]
  keyInsights: string[]
  outlierAnalysis: string | null
}

interface ReviewerFeedback {
  id: string
  reviewerId: string
  xpScore: number
  comments: string | null
  contentCategory: string | null
  qualityTier: string | null
  createdAt: string
  reviewerStats?: ReviewerStats | null
}

interface ConflictInfo {
  type: string
  description: string
}

interface PlatformBenchmark {
  platform: string
  avgXp: number
  totalSubmissions: number
}

interface HistoricalCase {
  finalXp: number
  minReviewXp: number
  maxReviewXp: number
  reviewCount: number
}

interface CaseDetails {
  submissionId: string
  url: string
  platform: string
  title?: string
  divergentScores: [number, number]
  stdDev?: number
  reviewCount: number
  reviews?: ReviewerFeedback[]
  createdAt?: string
  conflict?: ConflictInfo
  platformBenchmark?: PlatformBenchmark | null
  historicalCases?: HistoricalCase[]
  analysis?: CaseAnalysis
  finalXp?: number | null
}

interface CaseFileCardProps {
  caseData: CaseDetails
  onVote: (xp: number) => void
  voting: boolean
}

function ExhibitSection({ 
  title, 
  icon: Icon, 
  children,
  defaultOpen = false 
}: { 
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {isOpen && <div className="p-3 bg-card/50">{children}</div>}
    </div>
  )
}


// Feature #2: Score Distribution with outlier detection
function ScoreDistribution({ reviews, divergentScores, finalXp }: { 
  reviews: ReviewerFeedback[]
  divergentScores: [number, number]
  finalXp?: number | null
}) {
  const [_minXp, maxXp] = divergentScores
  const scores = reviews.map(r => r.xpScore)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  
  // Detect outliers (scores more than 50% away from average)
  const isOutlier = (score: number) => Math.abs(score - avg) > avg * 0.5
  
  return (
    <div className="space-y-4">
      {/* Visual bar with padding for dots */}
      <div className="relative pt-10 pb-2 mx-4">
        <div className="h-3 bg-gradient-to-r from-destructive/30 via-muted/50 to-success/30 rounded-full" />
        
        {/* Final XP marker (if available) */}
        {finalXp && (
          <>
            <div 
              className="absolute top-7 w-1 h-4 bg-green-500"
              style={{ left: `${(finalXp / maxXp) * 100}%`, transform: 'translateX(-50%)' }}
            />
            <div 
              className="absolute top-0 text-[9px] text-green-500 font-semibold whitespace-nowrap"
              style={{ left: `${(finalXp / maxXp) * 100}%`, transform: 'translateX(-50%)' }}
              title="The final XP awarded after consensus"
            >
              final: {finalXp} XP
            </div>
          </>
        )}
        
        {/* Average marker - average of reviewers' scores */}
        <div 
          className="absolute top-7 w-0.5 h-4 bg-primary/50"
          style={{ left: `${(avg / maxXp) * 100}%` }}
        />
        {!finalXp && (
          <div 
            className="absolute top-0 text-[9px] text-primary whitespace-nowrap"
            style={{ left: `${(avg / maxXp) * 100}%`, transform: 'translateX(-50%)' }}
            title="Average of all reviewer scores for this submission"
          >
            avg: {Math.round(avg)}
          </div>
        )}
        
        {/* Score markers */}
        {reviews.map((review, idx) => {
          const position = (review.xpScore / maxXp) * 100
          const outlier = isOutlier(review.xpScore)
          return (
            <div
              key={review.id}
              className={cn(
                "absolute top-4 w-7 h-7 rounded-full border-2 shadow-lg flex items-center justify-center text-[10px] font-bold text-white",
                outlier ? "border-yellow-400 ring-2 ring-yellow-400/50" : "border-background"
              )}
              style={{ 
                left: `${position}%`,
                transform: 'translateX(-50%)',
                backgroundColor: review.xpScore === 0 ? 'hsl(var(--destructive))' : 
                                 review.xpScore >= maxXp * 0.8 ? 'hsl(var(--success))' : 
                                 'hsl(var(--primary))',
                zIndex: outlier ? 20 : 10 - idx
              }}
              title={outlier ? `OUTLIER: Reviewer ${String.fromCharCode(65 + idx)}` : undefined}
            >
              {String.fromCharCode(65 + idx)}
            </div>
          )
        })}
        
        <div className="flex justify-between mt-3 text-xs text-muted-foreground -mx-4">
          <span>0 XP</span>
          <span>{maxXp} XP</span>
        </div>
      </div>

      {/* Score cards with outlier highlighting */}
      <div className="flex gap-2 flex-wrap justify-center">
        {reviews.map((review, idx) => {
          const outlier = isOutlier(review.xpScore)
          return (
            <div 
              key={review.id} 
              className={cn(
                "text-center px-3 py-2 rounded-lg border min-w-[70px]",
                outlier && "ring-2 ring-yellow-400/50 bg-yellow-500/10 border-yellow-500/30",
                !outlier && review.xpScore === 0 && "bg-destructive/10 border-destructive/30",
                !outlier && review.xpScore >= maxXp * 0.8 && "bg-success/10 border-success/30",
                !outlier && review.xpScore > 0 && review.xpScore < maxXp * 0.8 && "bg-muted/30 border-border/50"
              )}
            >
              <div className="font-mono text-[9px] text-muted-foreground">
                {String.fromCharCode(65 + idx)} {outlier && '⚠️'}
              </div>
              <div className={cn("font-bold text-lg", outlier && "text-yellow-600")}>
                {review.xpScore}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// Feature #1 & #8: Reviewer card with credibility and workload
function ReviewCard({ review, index }: { review: ReviewerFeedback; index: number }) {
  const tierColors: Record<string, string> = {
    'S': 'text-yellow-500', 'A': 'text-green-500', 'B': 'text-blue-500',
    'C': 'text-orange-500', 'D': 'text-red-500',
  }
  const stats = review.reviewerStats

  return (
    <div className="p-3 rounded-lg bg-background/80 border border-border/30 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            REVIEWER {String.fromCharCode(65 + index)}
          </span>
          {/* Feature #1: Experience level (anonymized) */}
          {stats && (
            <Badge variant="outline" className={cn(
              "text-[9px] px-1.5 py-0",
              stats.experienceLevel === 'new' && "border-yellow-500/50 text-yellow-600",
              stats.experienceLevel === 'experienced' && "border-green-500/50 text-green-600"
            )}>
              {stats.experienceLevel}
            </Badge>
          )}
          {/* Feature #8: High workload indicator */}
          {stats?.isHighVolume && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-orange-500/50 text-orange-500">
              <Zap className="w-2.5 h-2.5 mr-0.5" />busy
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Feature #9: Category/Tier */}
          {review.contentCategory && (
            <Badge variant="outline" className="text-[9px]">{review.contentCategory}</Badge>
          )}
          {review.qualityTier && (
            <Badge variant="outline" className={cn("text-[9px]", tierColors[review.qualityTier])}>
              Tier {review.qualityTier}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs font-bold">{review.xpScore} XP</Badge>
        </div>
      </div>
      
      {/* Feature #1: Reviewer patterns and consensus alignment */}
      {stats && (
        <div className="flex items-center gap-2 text-[10px] flex-wrap">
          <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground" title="Average XP this reviewer typically gives">
            Usually gives ~{Math.round(stats.avgXpGiven)} XP
          </span>
          {stats.consensusAlignment > 0 && (
            <span 
              className={cn(
                "flex items-center gap-0.5",
                stats.consensusAlignment >= 70 ? "text-success" : stats.consensusAlignment >= 50 ? "text-primary" : "text-yellow-500"
              )}
              title="How often this reviewer's scores match the final outcome (within 50 XP)"
            >
              • {stats.consensusAlignment}% accurate
            </span>
          )}
          {stats.avgXpGiven < 70 && (
            <span className="text-yellow-500 flex items-center gap-0.5" title="This reviewer's historical average is below 70 XP">
              <TrendingDown className="w-3 h-3" />strict scorer
            </span>
          )}
          {stats.avgXpGiven > 150 && (
            <span className="text-success flex items-center gap-0.5" title="This reviewer's historical average is above 150 XP">
              <TrendingUp className="w-3 h-3" />generous scorer
            </span>
          )}
        </div>
      )}

      {/* Feature #6: Comment with key phrase highlighting */}
      {review.comments ? (
        <p className="text-sm text-foreground/90 leading-relaxed">
          &quot;{review.comments}&quot;
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">No comments provided</p>
      )}
    </div>
  )
}

// Feature #4: Platform benchmark
function PlatformComparison({ benchmark, scores, reviewScores }: { 
  benchmark: PlatformBenchmark
  scores: [number, number]
  reviewScores?: number[]
}) {
  const [minXp, maxXp] = scores
  // Use actual review scores if available, otherwise midpoint
  const avgScore = reviewScores && reviewScores.length > 0 
    ? reviewScores.reduce((a, b) => a + b, 0) / reviewScores.length
    : (minXp + maxXp) / 2
  const diff = ((avgScore - benchmark.avgXp) / benchmark.avgXp * 100)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
          <div className="text-xs text-muted-foreground mb-1">{benchmark.platform} Average</div>
          <div className="text-xl font-bold">{Math.round(benchmark.avgXp)} XP</div>
          <div className="text-[10px] text-muted-foreground">from {benchmark.totalSubmissions} submissions</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
          <div className="text-xs text-muted-foreground mb-1">Reviewers&apos; Avg</div>
          <div className="text-xl font-bold">{Math.round(avgScore)} XP</div>
          <div className={cn("text-[10px]", diff > 20 ? "text-success" : diff < -20 ? "text-destructive" : "text-muted-foreground")}>
            {diff > 0 ? '+' : ''}{Math.round(diff)}% vs platform avg
          </div>
        </div>
      </div>
    </div>
  )
}

// Feature #7: Historical similar cases - disabled for now
// function HistoricalCases is removed as it's not currently used


export function CaseFileCard({ caseData, onVote: _onVote, voting: _voting }: CaseFileCardProps) {
  const caseNumber = caseData.submissionId.slice(0, 8).toUpperCase()
  
  return (
    <Card className="border-0 shadow-2xl overflow-hidden bg-card">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-border/50">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h2 className="text-xl font-bold tracking-tight">Case: {caseNumber}</h2>
              <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">In Deliberation</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Platform: <span className="text-foreground font-medium">{caseData.platform}</span>
            </p>
          </div>
          <a
            href={caseData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20"
          >
            View <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Combined Case Analysis (conflict + insights) */}
        {(caseData.conflict || caseData.analysis) && (
          <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Case Summary</p>
                
                {/* Main summary from analysis or conflict */}
                <p className="text-sm text-muted-foreground">
                  {caseData.analysis?.summary || caseData.conflict?.description}
                </p>
                
                {/* Contradictions */}
                {caseData.analysis?.contradictions && caseData.analysis.contradictions.length > 0 && (
                  <div className="pt-2 border-t border-yellow-500/20">
                    <p className="text-xs font-medium text-yellow-600 mb-1">⚠️ Contradictions:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {caseData.analysis.contradictions.map((c, i) => (
                        <li key={i}>• {c.description}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Insights */}
                {caseData.analysis?.keyInsights && caseData.analysis.keyInsights.length > 0 && (
                  <div className="pt-2 border-t border-yellow-500/20">
                    <p className="text-xs font-medium text-primary mb-1">💡 Key Insights:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {caseData.analysis.keyInsights.map((insight, i) => (
                        <li key={i}>• {insight}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Outlier Analysis */}
                {caseData.analysis?.outlierAnalysis && (
                  <p className="text-xs text-yellow-600 pt-2 border-t border-yellow-500/20">
                    📊 {caseData.analysis.outlierAnalysis}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CardContent className="p-6 space-y-4">
        {/* Feature #2: Score Distribution with outliers */}
        {caseData.reviews && caseData.reviews.length > 0 && (
          <ExhibitSection title="SCORE DISTRIBUTION" icon={BarChart3} defaultOpen={true}>
            <ScoreDistribution reviews={caseData.reviews} divergentScores={caseData.divergentScores} finalXp={caseData.finalXp} />
          </ExhibitSection>
        )}

        {/* Feature #4: Platform Benchmark */}
        {caseData.platformBenchmark && caseData.platformBenchmark.totalSubmissions > 1 && (
          <ExhibitSection title="PLATFORM CONTEXT" icon={Activity} defaultOpen={true}>
            <PlatformComparison 
              benchmark={caseData.platformBenchmark} 
              scores={caseData.divergentScores}
              reviewScores={caseData.reviews?.map(r => r.xpScore)}
            />
          </ExhibitSection>
        )}

        {/* Feature #7: Historical Similar Cases - disabled for now as it doesn't help decision making */}
        {/* TODO: Re-enable when we have voted cases to show as precedent */}

        {/* Features #1, #6, #8, #9: Reviewer Feedback */}
        <ExhibitSection title="REVIEWER FEEDBACK" icon={MessageSquare} defaultOpen={true}>
          {caseData.reviews && caseData.reviews.length > 0 ? (
            <div className="space-y-3">
              {caseData.reviews.map((review, idx) => (
                <ReviewCard key={review.id} review={review} index={idx} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-4">Loading...</p>
          )}
        </ExhibitSection>


      </CardContent>
    </Card>
  )
}

export type { CaseDetails, ReviewerFeedback, ConflictInfo, PlatformBenchmark, ReviewerStats, HistoricalCase, CaseAnalysis }

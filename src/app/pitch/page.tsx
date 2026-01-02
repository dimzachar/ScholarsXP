'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CheckCircle2, Vote, Shield, ArrowRight, Sparkles,
  AlertTriangle, ExternalLink, ThumbsUp, ThumbsDown,
  MessageSquare, BarChart3, Loader2
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function PitchPage() {
  const [step, setStep] = useState(0)
  const [voteCount, setVoteCount] = useState(0)
  const [consensusReached, setConsensusReached] = useState(false)
  const [showVoteSuccess, setShowVoteSuccess] = useState(false)
  const [voting, setVoting] = useState(false)

  const totalSteps = 14

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setStep(s => Math.min(s + 1, totalSteps - 1))
      }
      if (e.key === 'ArrowLeft') {
        setStep(s => Math.max(s - 1, 0))
      }
      if (e.key === 'r') {
        setStep(0)
        setVoteCount(0)
        setConsensusReached(false)
        setShowVoteSuccess(false)
        setVoting(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Animate vote count when on step 9
  useEffect(() => {
    if (step === 9 && voteCount < 12) {
      const timer = setTimeout(() => setVoteCount(v => v + 1), 300)
      return () => clearTimeout(timer)
    }
    if (step === 9 && voteCount >= 12 && !consensusReached) {
      setTimeout(() => setConsensusReached(true), 500)
    }
  }, [step, voteCount, consensusReached])

  // Simulate voting animation on step 5
  useEffect(() => {
    if (step === 5) {
      setVoting(true)
      setTimeout(() => {
        setVoting(false)
        setShowVoteSuccess(true)
      }, 1500)
    } else {
      setShowVoteSuccess(false)
      setVoting(false)
    }
  }, [step])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-8">
      <div className="max-w-5xl w-full space-y-8">
        
        <AnimatePresence mode="wait">
          {/* SECTION 1: THE PROBLEM (Steps 0-1) */}
          
          {/* Step 0: Three scores appear */}
          {step === 0 && (
            <motion.div
              key="scores"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-2xl text-muted-foreground mb-8">Peer review is supposed to be fair. But what happens when experts disagree?</h2>
              
              <div className="flex justify-center gap-6">
                {[30, 80, 150].map((score, i) => (
                  <motion.div
                    key={score}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.3 }}
                  >
                    <Card className="p-8 min-w-[140px]">
                      <div className="text-5xl font-bold text-primary">{score}</div>
                      <div className="text-lg text-muted-foreground">XP</div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 1: Who's right? */}
          {step === 1 && (
            <motion.div
              key="whos-right"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-8"
            >
              <div className="flex justify-center gap-6 mb-8">
                {[30, 80, 150].map((score) => (
                  <Card key={score} className="p-8 min-w-[140px]">
                    <div className="text-5xl font-bold text-primary">{score}</div>
                    <div className="text-lg text-muted-foreground">XP</div>
                  </Card>
                ))}
              </div>
              
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-4"
              >
                <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto" />
                <h1 className="text-5xl font-bold">Who&apos;s right?</h1>
                <p className="text-2xl text-muted-foreground">
                  One says 30 XP. Another says 150. That&apos;s a 5x difference.
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* Step 2: ScholarsXP Solution */}
          {step === 2 && (
            <motion.div
              key="solution"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-8"
            >
              <motion.div
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                transition={{ type: "spring" }}
              >
                <h1 className="text-6xl font-bold mb-4">ScholarsXP</h1>
                <Badge className="text-xl px-6 py-2">On-Chain Dispute Resolution</Badge>
              </motion.div>
              
              <p className="text-2xl text-muted-foreground">
                Community voting on the Movement blockchain
              </p>
            </motion.div>
          )}

          {/* SECTION 2: THE DAILY JUDGMENT (Steps 3-4) */}
          
          {/* Step 3: Case File Card */}
          {step === 3 && (
            <motion.div
              key="case-file"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <p className="text-center text-xl text-muted-foreground mb-4">
                When reviewers diverge, the submission enters The Daily Judgment
              </p>
              
              <Card className="max-w-2xl mx-auto border-2">
                <div className="p-6 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-xl font-bold">Case: C29556BC</h2>
                        <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                          In Deliberation
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Platform: <span className="text-foreground font-medium">Twitter</span></p>
                    </div>
                    <a className="flex items-center gap-1.5 text-sm text-primary px-3 py-1.5 rounded-lg bg-primary/10">
                      View Content <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                
                <CardContent className="p-6">
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">High Divergence Detected</p>
                        <p className="text-sm text-muted-foreground">Reviewers disagree by more than 50 XP</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 4: Score Distribution & Reviewer Feedback */}
          {step === 4 && (
            <motion.div
              key="exhibits"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 max-w-3xl mx-auto"
            >
              {/* Score Distribution */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Exhibit A: Score Distribution</span>
                </div>
                {/* Average marker */}
                <div className="relative pt-6 pb-2 mx-4">
                  <div className="absolute top-0 text-[9px] text-primary whitespace-nowrap" style={{ left: '58%', transform: 'translateX(-50%)' }}>
                    avg: 87
                  </div>
                  <div className="h-3 bg-gradient-to-r from-destructive/30 via-muted/50 to-green-500/30 rounded-full" />
                  <div className="absolute top-6 w-0.5 h-4 bg-primary/50" style={{ left: '58%' }} />
                  
                  {/* Score markers with outlier highlighting */}
                  {[
                    { score: 30, isOutlier: true },
                    { score: 80, isOutlier: false },
                    { score: 150, isOutlier: true },
                  ].map(({ score, isOutlier }, i) => (
                    <motion.div
                      key={score}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.2 }}
                      className={`absolute top-3 w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold border-2 ${
                        isOutlier 
                          ? 'border-yellow-400 ring-2 ring-yellow-400/50 bg-yellow-600' 
                          : 'border-background bg-primary'
                      }`}
                      style={{ left: `${(score / 150) * 100}%`, transform: 'translateX(-50%)' }}
                    >
                      {String.fromCharCode(65 + i)}
                    </motion.div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2 mx-4">
                  <span>0 XP</span>
                  <span>150 XP</span>
                </div>
                
                {/* Score cards with outlier highlighting */}
                <div className="flex gap-2 justify-center mt-4">
                  {[
                    { score: 30, isOutlier: true },
                    { score: 80, isOutlier: false },
                    { score: 150, isOutlier: true },
                  ].map(({ score, isOutlier }, i) => (
                    <div 
                      key={score}
                      className={`text-center px-3 py-2 rounded-lg border min-w-[70px] ${
                        isOutlier 
                          ? 'ring-2 ring-yellow-400/50 bg-yellow-500/10 border-yellow-500/30' 
                          : 'bg-muted/30 border-border/50'
                      }`}
                    >
                      <div className="font-mono text-[9px] text-muted-foreground">
                        {String.fromCharCode(65 + i)} {isOutlier && '⚠️'}
                      </div>
                      <div className={`font-bold text-lg ${isOutlier ? 'text-yellow-600' : ''}`}>
                        {score}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Platform Context */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Exhibit B: Platform Context</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30 border text-center">
                    <div className="text-xs text-muted-foreground mb-1">Twitter Average</div>
                    <div className="text-xl font-bold">72 XP</div>
                    <div className="text-[10px] text-muted-foreground">from 847 submissions</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border text-center">
                    <div className="text-xs text-muted-foreground mb-1">Reviewers&apos; Avg</div>
                    <div className="text-xl font-bold">87 XP</div>
                    <div className="text-[10px] text-green-500">+21% vs platform avg</div>
                  </div>
                </div>
              </Card>

              {/* Reviewer Feedback */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Exhibit C: Reviewer Feedback</span>
                </div>
                <div className="space-y-3">
                  {[
                    { letter: 'A', score: 30, comment: '"Content lacks depth, mostly surface-level observations"', exp: 'experienced', avgGiven: 45, accuracy: 78, tendency: 'strict' },
                    { letter: 'B', score: 80, comment: '"Decent thread but could use more technical detail"', exp: 'intermediate', avgGiven: 82, accuracy: 65, tendency: null },
                    { letter: 'C', score: 150, comment: '"Excellent breakdown of the protocol mechanics"', exp: 'experienced', avgGiven: 125, accuracy: 71, tendency: null },
                  ].map((r, i) => (
                    <motion.div
                      key={r.letter}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="p-3 rounded-lg bg-muted/30 border"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">REVIEWER {r.letter}</span>
                          <Badge variant="outline" className="text-[10px]">{r.exp}</Badge>
                        </div>
                        <Badge variant="secondary">{r.score} XP</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                        <span>Usually gives ~{r.avgGiven} XP</span>
                        <span>• {r.accuracy}% accurate</span>
                        {r.tendency === 'strict' && <span className="text-yellow-500">• strict scorer</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">{r.comment}</p>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* SECTION 3: CASTING YOUR VERDICT (Steps 5-6) */}
          
          {/* Step 5: Vote Buttons + Animation */}
          {step === 5 && (
            <motion.div
              key="verdict"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 max-w-2xl mx-auto text-center"
            >
              <h2 className="text-3xl font-bold">YOUR VERDICT</h2>
              <p className="text-muted-foreground">Based on the evidence, which reviewer got it right?</p>
              
              <div className="grid grid-cols-2 gap-6">
                <Card className="p-6 border-2 border-destructive/30 hover:border-destructive transition-colors cursor-pointer">
                  <ThumbsDown className="w-10 h-10 text-destructive mx-auto mb-2" />
                  <div className="text-3xl font-bold text-destructive">30 XP</div>
                </Card>
                
                <motion.div
                  animate={voting ? { scale: [1, 0.95, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Card className={`p-6 border-2 transition-colors cursor-pointer ${
                    showVoteSuccess ? 'border-green-500 bg-green-500/10' : 'border-green-500/30 hover:border-green-500'
                  }`}>
                    {voting ? (
                      <Loader2 className="w-10 h-10 text-green-500 mx-auto mb-2 animate-spin" />
                    ) : (
                      <ThumbsUp className="w-10 h-10 text-green-500 mx-auto mb-2" />
                    )}
                    <div className="text-3xl font-bold text-green-500">150 XP</div>
                  </Card>
                </motion.div>
              </div>

              {showVoteSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Badge className="text-lg px-4 py-2 bg-green-500/20 text-green-500 border-green-500/30">
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    Vote Recorded!
                  </Badge>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Step 6: Movement Explorer */}
          {step === 6 && (
            <motion.div
              key="explorer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 max-w-3xl mx-auto"
            >
              <p className="text-center text-xl text-muted-foreground">
                Every vote is a real transaction. Verify it on-chain.
              </p>
              
              <Card className="p-6 bg-zinc-900 text-zinc-100 font-mono text-sm">
                <div className="flex items-center gap-2 mb-4 text-zinc-400">
                  <ExternalLink className="w-4 h-4" />
                  <span>explorer.movementnetwork.xyz</span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Function</span>
                    <span className="text-green-400">scholarxp::vote::cast_vote</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Submission ID</span>
                    <span>c29556bc-c63a-422b...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">XP Choice</span>
                    <span className="text-primary">150</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status</span>
                    <span className="text-green-400">✓ Success</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Gas Fee</span>
                    <span className="text-yellow-400">Sponsored by Shinami</span>
                  </div>
                </div>
              </Card>
              
              <p className="text-center text-lg font-semibold text-primary">
                Transparent. Immutable. Verifiable.
              </p>
            </motion.div>
          )}

          {/* SECTION 4: SEAMLESS WEB3 UX (Steps 7-8) */}
          
          {/* Step 7: Discord Login */}
          {step === 7 && (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 max-w-md mx-auto text-center"
            >
              <h2 className="text-3xl font-bold">Seamless Onboarding</h2>
              <p className="text-muted-foreground">Users never touch a seed phrase</p>
              
              <Card className="p-8">
                <motion.div
                  initial={{ y: 10 }}
                  animate={{ y: 0 }}
                  transition={{ type: "spring" }}
                >
                  <div className="w-16 h-16 bg-[#5865F2] rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Login with Discord</h3>
                  <p className="text-sm text-muted-foreground">
                    Privy creates an embedded wallet automatically
                  </p>
                </motion.div>
              </Card>
              
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4" />
                <span>No seed phrases. No extensions. Just Discord.</span>
              </div>
            </motion.div>
          )}

          {/* Step 8: Gas-free */}
          {step === 8 && (
            <motion.div
              key="gasless"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-4xl font-bold">Zero Friction. Full Web3 Power.</h2>
              
              <div className="grid grid-cols-2 gap-8 max-w-2xl mx-auto">
                <Card className="p-6 border-red-500/30 bg-red-500/5">
                  <div className="text-4xl mb-2">❌</div>
                  <h3 className="font-semibold text-red-500">No MetaMask Popup</h3>
                </Card>
                <Card className="p-6 border-red-500/30 bg-red-500/5">
                  <div className="text-4xl mb-2">❌</div>
                  <h3 className="font-semibold text-red-500">No Gas Fees</h3>
                </Card>
              </div>
              
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring" }}
              >
                <Card className="p-6 max-w-md mx-auto border-green-500/30 bg-green-500/5">
                  <div className="text-4xl mb-2">✓</div>
                  <h3 className="font-semibold text-green-500 text-xl">Sponsored by Shinami</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    It feels like Web2. But every vote lives on Movement&apos;s L1.
                  </p>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {/* SECTION 5: WHY IT MATTERS (Steps 9-11) */}
          
          {/* Step 9: Vote Count Animation */}
          {step === 9 && (
            <motion.div
              key="votes"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <h1 className="text-4xl font-bold text-center">Community Decides</h1>
              <p className="text-center text-xl text-muted-foreground">
                Not an algorithm. Not one person. The crowd.
              </p>
              
              <Card className="p-8 text-center max-w-md mx-auto">
                <div className="text-7xl font-bold text-primary mb-4">
                  {voteCount}
                </div>
                <div className="text-xl text-muted-foreground mb-6">votes cast</div>
                
                {consensusReached && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-block"
                  >
                    <Badge className="text-lg px-4 py-2 bg-green-500/20 text-green-500 border-green-500/30">
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Consensus Reached!
                    </Badge>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Step 10: Multiple Cases Resolved */}
          {step === 10 && (
            <motion.div
              key="cases"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <h1 className="text-4xl font-bold text-center">Building Shared Understanding</h1>
              <p className="text-center text-xl text-muted-foreground">
                Over time, this creates a shared understanding of quality
              </p>
              
              <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    <Card className="p-4 text-center border-green-500/30 bg-green-500/5">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <div className="text-sm text-muted-foreground">Case #{String(i).padStart(4, '0')}</div>
                      <div className="text-xs text-green-500">Resolved</div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 11: Quality by Consensus */}
          {step === 11 && (
            <motion.div
              key="quality"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 text-center"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <h1 className="text-5xl font-bold mb-4">Quality by Consensus</h1>
                <p className="text-2xl text-primary">Verified on-chain.</p>
              </motion.div>

              <div className="flex justify-center gap-12 mt-12">
                <div className="text-center">
                  <Shield className="w-14 h-14 text-primary mx-auto mb-3" />
                  <div className="font-semibold">Transparent</div>
                </div>
                <div className="text-center">
                  <Sparkles className="w-14 h-14 text-primary mx-auto mb-3" />
                  <div className="font-semibold">Immutable</div>
                </div>
                <div className="text-center">
                  <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-3" />
                  <div className="font-semibold">Verifiable</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* SECTION 6: THE PATH FORWARD (Step 12) */}
          
          {step === 12 && (
            <motion.div
              key="foundation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 text-center"
            >
              <h1 className="text-4xl font-bold">The Foundation is Built</h1>
              
              <div className="flex items-center justify-center gap-6">
                <Card className="p-6 border-primary bg-primary/10">
                  <Vote className="w-12 h-12 text-primary mx-auto mb-3" />
                  <div className="font-semibold text-lg">On-Chain Voting</div>
                  <Badge className="mt-2">Live Now</Badge>
                </Card>
                
                <ArrowRight className="w-10 h-10 text-muted-foreground" />
                
                <Card className="p-6 border-dashed border-2">
                  <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <div className="font-semibold text-lg text-muted-foreground">More Web3 Features</div>
                  <Badge variant="outline" className="mt-2">Coming Soon</Badge>
                </Card>
              </div>

              <p className="text-xl text-muted-foreground max-w-xl mx-auto">
                With Privy wallets and Movement infrastructure in place,
                we can add more on-chain features over time.
              </p>
            </motion.div>
          )}

          {/* SECTION 7: CALL TO ACTION (Step 13) */}
          
          {step === 13 && (
            <motion.div
              key="cta"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 text-center"
            >
              <motion.h1 
                className="text-5xl font-bold"
                initial={{ y: -20 }}
                animate={{ y: 0 }}
              >
                ScholarsXP
              </motion.h1>
              
              <p className="text-2xl text-muted-foreground">
                On-chain dispute resolution for the decentralized web
              </p>
              
              <Card className="p-6 max-w-md mx-auto bg-primary/5 border-primary/30">
                <p className="text-lg mb-2">Try it now</p>
                <p className="text-2xl font-mono text-primary">scholars-xp.vercel.app/vote</p>
              </Card>
              
              <div className="flex justify-center items-center gap-6 pt-8">
                <Badge variant="outline" className="text-lg px-4 py-2">Movement</Badge>
                <Badge variant="outline" className="text-lg px-4 py-2">Privy</Badge>
                <Badge variant="outline" className="text-lg px-4 py-2">Shinami</Badge>
              </div>
              
              <motion.p 
                className="text-3xl font-bold text-primary pt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Quality by Consensus
              </motion.p>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Navigation hint */}
        <div className="text-center text-sm text-muted-foreground">
          <kbd className="px-2 py-1 bg-muted rounded">→</kbd> / <kbd className="px-2 py-1 bg-muted rounded">Space</kbd> advance
          &nbsp;•&nbsp;
          <kbd className="px-2 py-1 bg-muted rounded">←</kbd> back
          &nbsp;•&nbsp;
          <kbd className="px-2 py-1 bg-muted rounded">R</kbd> reset
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        
        <div className="text-center text-xs text-muted-foreground">
          Step {step + 1} of {totalSteps}
        </div>
      </div>
    </div>
  )
}

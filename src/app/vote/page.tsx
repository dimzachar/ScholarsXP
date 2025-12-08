'use client'

import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Scale, Gavel, Loader2, Wallet, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { WalletSelector } from '@/components/WalletSelector'
import { WalletLinkPrompt } from '@/components/wallet/WalletLinkPrompt'
import { useWalletSync } from '@/contexts/WalletSyncContext'
import { MobileLayout, MobileHeader, MobileSection } from '@/components/layout/MobileLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface JudgmentCase {
    submissionId: string
    url: string
    platform: string
    divergentScores: [number, number]
}



// Connect Wallet Screen - shown when user needs to connect or link wallet
function ConnectWalletScreen({ needsLink }: { needsLink?: boolean }) {
    if (needsLink) {
        // User is connected but hasn't linked wallet to profile
        return (
            <MobileLayout variant="centered">
                <div className="w-full max-w-md space-y-4">
                    <div className="text-center mb-6">
                        <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                            <Gavel className="w-12 h-12 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold">The Daily Judgment</h1>
                        <p className="text-muted-foreground mt-2">
                            Link your wallet to your profile to start voting
                        </p>
                    </div>
                    <WalletLinkPrompt
                        title="Link Your Wallet"
                        description="Save your connected wallet to your profile to participate in voting."
                    />
                </div>
            </MobileLayout>
        )
    }

    // User needs to connect wallet
    return (
        <MobileLayout variant="centered">
            <Card className="w-full max-w-md border-0 shadow-xl bg-card">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
                        <Wallet className="w-12 h-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">The Daily Judgment</CardTitle>
                    <CardDescription className="text-base mt-2">
                        Connect your Movement wallet to participate in community voting.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <div className="flex items-start gap-3">
                            <Scale className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                            <span>Vote on submissions with divergent AI scores</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <Gavel className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" />
                            <span>Your vote helps calibrate the XP system</span>
                        </div>
                    </div>
                    
                    <WalletSelector>
                        <Button className="w-full h-12 text-base font-semibold">
                            <Wallet className="w-5 h-5 mr-2" />
                            Connect Wallet
                        </Button>
                    </WalletSelector>
                    
                    <p className="text-xs text-center text-muted-foreground">
                        Nightly wallet recommended for Movement Network
                    </p>
                </CardContent>
            </Card>
        </MobileLayout>
    )
}

function LoadingScreen() {
    return (
        <MobileLayout variant="centered">
            <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Loading judgment cases...</p>
            </div>
        </MobileLayout>
    )
}

function NoCasesScreen() {
    return (
        <MobileLayout variant="centered">
            <Card className="w-full max-w-md border-0 shadow-xl bg-card text-center">
                <CardContent className="pt-8 pb-8">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-muted">
                        <Gavel className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">All Done!</h2>
                    <p className="text-muted-foreground">
                        You&apos;ve judged all available submissions. Check back later for new cases.
                    </p>
                </CardContent>
            </Card>
        </MobileLayout>
    )
}

// Swipeable Card Component
function SwipeCard({ 
    currentCase, 
    onVote, 
    voting,
    resetKey
}: { 
    currentCase: JudgmentCase
    onVote: (xp: number, direction: 'left' | 'right') => Promise<boolean>
    voting: boolean
    resetKey: number
}) {
    const cardRef = useRef<HTMLDivElement>(null)
    const [dragState, setDragState] = useState({
        isDragging: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
    })
    const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null)

    const SWIPE_THRESHOLD = 100
    const MAX_ROTATION = 15

    const deltaX = dragState.currentX - dragState.startX
    const deltaY = dragState.currentY - dragState.startY
    const rotation = dragState.isDragging ? (deltaX / 20) * (MAX_ROTATION / 10) : 0
    const clampedRotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, rotation))
    
    const swipeProgress = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1)
    const isSwipingLeft = deltaX < -20
    const isSwipingRight = deltaX > 20

    // Reset card position when resetKey changes (on cancel)
    useEffect(() => {
        setExitDirection(null)
        setDragState({
            isDragging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
        })
    }, [resetKey])

    const handleStart = (clientX: number, clientY: number) => {
        if (voting) return
        setDragState({
            isDragging: true,
            startX: clientX,
            startY: clientY,
            currentX: clientX,
            currentY: clientY,
        })
    }

    const handleMove = (clientX: number, clientY: number) => {
        if (!dragState.isDragging || voting) return
        setDragState(prev => ({
            ...prev,
            currentX: clientX,
            currentY: clientY,
        }))
    }

    const handleEnd = async () => {
        if (!dragState.isDragging || voting) return

        const swipedLeft = deltaX < -SWIPE_THRESHOLD
        const swipedRight = deltaX > SWIPE_THRESHOLD

        if (swipedLeft || swipedRight) {
            const direction = swipedLeft ? 'left' : 'right'
            const xp = swipedLeft ? currentCase.divergentScores[0] : currentCase.divergentScores[1]
            
            setExitDirection(direction)
            
            // Wait for animation then submit vote
            setTimeout(async () => {
                const success = await onVote(xp, direction)
                if (!success) {
                    // Reset card if vote failed/cancelled
                    setExitDirection(null)
                }
            }, 200)
        }

        setDragState({
            isDragging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
        })
    }

    const handleButtonVote = async (xp: number, direction: 'left' | 'right') => {
        setExitDirection(direction)
        setTimeout(async () => {
            const success = await onVote(xp, direction)
            if (!success) {
                setExitDirection(null)
            }
        }, 200)
    }

    const onMouseDown = (e: React.MouseEvent) => handleStart(e.clientX, e.clientY)
    const onMouseMove = (e: React.MouseEvent) => handleMove(e.clientX, e.clientY)
    const onMouseUp = () => handleEnd()
    const onMouseLeave = () => { if (dragState.isDragging) handleEnd() }

    const onTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0]
        handleStart(touch.clientX, touch.clientY)
    }
    const onTouchMove = (e: React.TouchEvent) => {
        const touch = e.touches[0]
        handleMove(touch.clientX, touch.clientY)
    }
    const onTouchEnd = () => handleEnd()

    const cardStyle = exitDirection 
        ? {
            transform: `translateX(${exitDirection === 'left' ? '-150%' : '150%'}) rotate(${exitDirection === 'left' ? -30 : 30}deg)`,
            opacity: 0,
            transition: 'transform 0.4s ease-out, opacity 0.4s ease-out',
        }
        : dragState.isDragging 
        ? {
            transform: `translateX(${deltaX}px) translateY(${deltaY * 0.3}px) rotate(${clampedRotation}deg)`,
            transition: 'none',
        }
        : {
            transform: 'translateX(0) translateY(0) rotate(0deg)',
            transition: 'transform 0.3s ease-out',
        }

    return (
        <div className="relative">
            {/* Background indicators */}
            <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
                <div 
                    className="flex flex-col items-center gap-2"
                    style={{ opacity: isSwipingLeft && dragState.isDragging ? swipeProgress : 0 }}
                >
                    <div className="p-4 rounded-full bg-destructive/20 border-2 border-destructive">
                        <ThumbsDown className="w-8 h-8 text-destructive" />
                    </div>
                    <span className="text-lg font-bold text-destructive">{currentCase.divergentScores[0]} XP</span>
                </div>

                <div 
                    className="flex flex-col items-center gap-2"
                    style={{ opacity: isSwipingRight && dragState.isDragging ? swipeProgress : 0 }}
                >
                    <div className="p-4 rounded-full bg-success/20 border-2 border-success">
                        <ThumbsUp className="w-8 h-8 text-success" />
                    </div>
                    <span className="text-lg font-bold text-success">{currentCase.divergentScores[1]} XP</span>
                </div>
            </div>

            {/* Swipeable Card */}
            <div
                ref={cardRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={cardStyle}
                className={cn(
                    "relative select-none touch-none",
                    voting ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'
                )}
            >
                {/* Swipe overlays */}
                <div 
                    className="absolute inset-0 rounded-xl border-4 border-destructive bg-destructive/10 z-10 pointer-events-none"
                    style={{ opacity: isSwipingLeft && dragState.isDragging ? swipeProgress * 0.5 : 0 }}
                />
                <div 
                    className="absolute inset-0 rounded-xl border-4 border-success bg-success/10 z-10 pointer-events-none"
                    style={{ opacity: isSwipingRight && dragState.isDragging ? swipeProgress * 0.5 : 0 }}
                />

                <Card className="border-0 shadow-2xl overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Submission Review</CardTitle>
                                <CardDescription className="mt-1">
                                    Platform: <span className="font-medium text-foreground">{currentCase.platform}</span>
                                </CardDescription>
                            </div>
                            <a
                                href={currentCase.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20"
                            >
                                View <ExternalLink className="w-4 h-4" />
                            </a>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-bold mb-2">What XP should this earn?</h2>
                            <p className="text-sm text-muted-foreground">Swipe to vote or use the buttons below</p>
                        </div>
                        
                        <div className="flex justify-center items-center gap-6 mb-6">
                            <div className="text-center p-4 rounded-xl bg-destructive/5 border border-destructive/20 min-w-[100px]">
                                <div className="text-3xl font-bold text-destructive">{currentCase.divergentScores[0]}</div>
                                <div className="text-xs text-muted-foreground mt-1">← Swipe Left</div>
                            </div>
                            <div className="text-muted-foreground font-medium">or</div>
                            <div className="text-center p-4 rounded-xl bg-success/5 border border-success/20 min-w-[100px]">
                                <div className="text-3xl font-bold text-success">{currentCase.divergentScores[1]}</div>
                                <div className="text-xs text-muted-foreground mt-1">Swipe Right →</div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => handleButtonVote(currentCase.divergentScores[0], 'left')}
                                disabled={voting}
                                className="flex-1 h-12 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all"
                            >
                                <ThumbsDown className="w-5 h-5 mr-2" />
                                {currentCase.divergentScores[0]} XP
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => handleButtonVote(currentCase.divergentScores[1], 'right')}
                                disabled={voting}
                                className="flex-1 h-12 border-success/30 text-success hover:bg-success hover:text-success-foreground hover:border-success transition-all"
                            >
                                <ThumbsUp className="w-5 h-5 mr-2" />
                                {currentCase.divergentScores[1]} XP
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">👆 Drag the card left or right to vote</p>
            </div>
        </div>
    )
}

function VoteContent({ 
    currentCase, 
    onVote, 
    voting,
    resetKey,
    remaining,
    total
}: { 
    currentCase: JudgmentCase
    onVote: (xp: number, direction: 'left' | 'right') => Promise<boolean>
    voting: boolean
    resetKey: number
    remaining: number
    total: number
}) {
    return (
        <MobileLayout>
            <MobileHeader
                title="The Daily Judgment"
                subtitle={`${remaining} of ${total} cases remaining`}
                variant="default"
            />

            <MobileSection
                title="Current Case"
                icon={Scale}
                spacing="normal"
            >
                <SwipeCard 
                    currentCase={currentCase}
                    onVote={onVote}
                    voting={voting}
                    resetKey={resetKey}
                />
            </MobileSection>
        </MobileLayout>
    )
}

export default function VotePage() {
    const { account, connected, signMessage } = useWallet()
    const { hasLinkedWallet, isLoading: walletLoading, needsWalletLink } = useWalletSync()

    const [cases, setCases] = useState<JudgmentCase[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [voting, setVoting] = useState(false)
    const [resetKey, setResetKey] = useState(0)

    const currentCase = cases[currentIndex] || null
    const remaining = cases.length - currentIndex
    const total = cases.length

    // Fetch cases when wallet is connected and linked
    useEffect(() => {
        if (connected && hasLinkedWallet) {
            fetchCases()
        } else if (!walletLoading) {
            setLoading(false)
        }
    }, [connected, hasLinkedWallet, walletLoading])

    const fetchCases = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/vote')
            if (!res.ok) throw new Error('Failed to fetch cases')
            
            const data = await res.json()
            if (data.cases && data.cases.length > 0) {
                setCases(data.cases)
                setCurrentIndex(0)
            } else {
                setCases([])
            }
        } catch (error) {
            toast.error('Failed to load judgment cases')
            console.error(error)
            setCases([])
        } finally {
            setLoading(false)
        }
    }

    const handleVote = useCallback(async (xp: number, _direction: 'left' | 'right'): Promise<boolean> => {
        if (!connected || !account || !currentCase) {
            toast.error('Please connect your wallet to vote')
            return false
        }

        // Get wallet address from account
        const walletAddress = account.address?.toString()
        if (!walletAddress) {
            toast.error('Could not get wallet address')
            return false
        }

        try {
            setVoting(true)

            const message = `I vote ${xp} XP for submission ${currentCase.submissionId}`

            // Sign the vote message
            const signResult = await signMessage({
                message,
                nonce: Math.random().toString(36).substring(7),
            })

            // Submit vote to API with wallet address
            const response = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    submissionId: currentCase.submissionId,
                    walletAddress,
                    voteXp: xp,
                    signature: signResult.signature.toString()
                })
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || 'Failed to submit vote')
            }

            toast.success(`Vote recorded: ${xp} XP`)

            // Move to next case after short delay
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1)
                setResetKey(prev => prev + 1)
            }, 400)

            return true

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Vote cancelled'
            // Don't show error for user cancellation
            if (!errorMessage.includes('rejected') && !errorMessage.includes('cancelled')) {
                toast.error(errorMessage)
            }
            // Increment resetKey to snap card back
            setResetKey(prev => prev + 1)
            return false
        } finally {
            setVoting(false)
        }
    }, [connected, account, currentCase, signMessage])

    // Show loading while checking wallet state
    if (walletLoading) {
        return <LoadingScreen />
    }

    // Not connected - show connect wallet screen
    if (!connected) {
        return <ConnectWalletScreen />
    }

    // Connected but wallet not linked to profile - show link prompt
    if (needsWalletLink || !hasLinkedWallet) {
        return <ConnectWalletScreen needsLink />
    }

    // Loading cases
    if (loading) {
        return <LoadingScreen />
    }

    // No cases available
    if (!currentCase) {
        return <NoCasesScreen />
    }

    return (
        <VoteContent
            currentCase={currentCase}
            onVote={handleVote}
            voting={voting}
            resetKey={resetKey}
            remaining={remaining}
            total={total}
        />
    )
}

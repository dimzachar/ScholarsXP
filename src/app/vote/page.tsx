'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Scale, Gavel, Loader2, ExternalLink, ThumbsDown, ThumbsUp, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useWalletSync } from '@/contexts/WalletSyncContext'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { useSponsoredVote } from '@/hooks/useSponsoredVote'
import { MobileLayout, MobileHeader, MobileSection } from '@/components/layout/MobileLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface JudgmentCase {
    submissionId: string
    url: string
    platform: string
    divergentScores: [number, number]
}

// Wallet Required Screen - shown when user needs to link wallet
function WalletRequiredScreen() {
    return (
        <MobileLayout variant="centered">
            <Card className="w-full max-w-md border-0 shadow-xl bg-card text-center">
                <CardContent className="pt-8 pb-8">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                        <Wallet className="w-12 h-12 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Wallet Required</h2>
                    <p className="text-muted-foreground mb-4">
                        Link a wallet to your profile to participate in voting.
                    </p>
                    <Link href="/profile">
                        <Button>Go to Profile</Button>
                    </Link>
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

// Connect External Wallet Screen
function ConnectExternalWalletScreen({ onConnect, isConnecting }: { onConnect: () => void; isConnecting: boolean }) {
    return (
        <MobileLayout variant="centered">
            <Card className="w-full max-w-md border-0 shadow-xl bg-card text-center">
                <CardContent className="pt-8 pb-8">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                        <Wallet className="w-12 h-12 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
                    <p className="text-muted-foreground mb-4">
                        Your external wallet (Nightly) needs to be connected to sign votes.
                    </p>
                    <Button onClick={onConnect} disabled={isConnecting}>
                        {isConnecting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            'Connect Wallet'
                        )}
                    </Button>
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

// Processing screen shown while transaction is being submitted
function ProcessingScreen() {
    return (
        <MobileLayout variant="centered">
            <Card className="w-full max-w-md border-0 shadow-xl bg-card text-center">
                <CardContent className="pt-8 pb-8">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Processing Vote</h2>
                    <p className="text-muted-foreground">
                        Submitting your vote on-chain...
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        This may take a few seconds
                    </p>
                </CardContent>
            </Card>
        </MobileLayout>
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
    // Show processing screen when vote is being submitted
    if (voting) {
        return <ProcessingScreen />
    }

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
    const { isLoading: walletLoading } = useWalletSync()
    const { user, isLoading: userLoading } = usePrivyAuthSync()
    const { authenticatedFetch } = useAuthenticatedFetch()
    const { vote: sponsoredVote } = useSponsoredVote()
    const { connected: externalWalletConnected, connect: connectWallet, wallets } = useWallet()
    const [isConnectingWallet, setIsConnectingWallet] = useState(false)
    const [primaryWalletType, setPrimaryWalletType] = useState<'EMBEDDED' | 'EXTERNAL' | null>(null)
    
    const [primaryWallet, setPrimaryWallet] = useState<string | null>(null)
    const [walletFetched, setWalletFetched] = useState(false)
    const [cases, setCases] = useState<JudgmentCase[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [voting, setVoting] = useState(false)
    const [resetKey, setResetKey] = useState(0)

    const currentCase = cases[currentIndex] || null
    const remaining = cases.length - currentIndex
    const total = cases.length
    
    // Combined loading state - wait for all data to be ready
    const isInitializing = walletLoading || userLoading || (!walletFetched && !!user)

    // Fetch primary wallet from UserWallet table
    useEffect(() => {
        const fetchPrimaryWallet = async () => {
            if (!user) {
                setWalletFetched(true)
                return
            }
            try {
                const res = await authenticatedFetch('/api/user/wallet')
                if (res.ok) {
                    const data = await res.json()
                    console.log('[VotePage] Wallet API response:', data)
                    console.log('[VotePage] Primary wallet:', data.primaryWallet)
                    console.log('[VotePage] Primary wallet type:', data.primaryWalletType)
                    setPrimaryWallet(data.primaryWallet || null)
                    setPrimaryWalletType(data.primaryWalletType || null)
                } else {
                    console.error('[VotePage] Wallet API error:', res.status)
                }
            } catch (error) {
                console.error('Failed to fetch primary wallet:', error)
            } finally {
                setWalletFetched(true)
            }
        }
        fetchPrimaryWallet()
    }, [user, authenticatedFetch])

    // Fetch cases when wallet is available
    useEffect(() => {
        const fetchCases = async () => {
            try {
                setLoading(true)
                // Pass userId to filter out submissions user has voted on (from any wallet)
                const url = user?.id 
                    ? `/api/vote?userId=${encodeURIComponent(user.id)}`
                    : '/api/vote'
                const res = await fetch(url)
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

        // Only fetch cases after wallet is fetched
        if (!walletFetched) return
        
        if (primaryWallet) {
            fetchCases()
        } else if (!walletLoading) {
            setLoading(false)
        }
    }, [walletFetched, walletLoading, primaryWallet, user?.id])

    const handleVote = useCallback(async (xp: number, _direction: 'left' | 'right'): Promise<boolean> => {
        if (!currentCase) {
            toast.error('No case to vote on')
            return false
        }

        if (!primaryWallet || !primaryWalletType) {
            toast.error('Please link a wallet to vote')
            return false
        }

        setVoting(true)

        try {
            // Submit vote via Shinami-sponsored transaction
            // This will: build tx → wallet signs → backend sponsors gas → submits on-chain → saves to DB
            const result = await sponsoredVote(currentCase.submissionId, xp, primaryWallet, primaryWalletType)

            if (result.success) {
                toast.success(
                    <div>
                        <p>Vote recorded: {xp} XP</p>
                        <a 
                            href={`https://explorer.movementnetwork.xyz/txn/${result.transactionHash}?network=bardock+testnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline opacity-70"
                        >
                            View on Explorer →
                        </a>
                    </div>
                )
            }

            // Move to next case after animation completes
            setCurrentIndex(prev => prev + 1)
            setResetKey(prev => prev + 1)
            setVoting(false)

            return true

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Vote failed'
            toast.error(errorMessage)
            // Increment resetKey to snap card back
            setResetKey(prev => prev + 1)
            setVoting(false)
            return false
        }
    }, [currentCase, primaryWallet, primaryWalletType, sponsoredVote])

    // Show loading while initializing (wallet context, user, primary wallet fetch)
    if (isInitializing || loading) {
        return <LoadingScreen />
    }

    // Wallet not linked to profile - show link prompt
    // Only check primaryWallet (from UserWallet table), not needsWalletLink (legacy check)
    if (!primaryWallet) {
        return <WalletRequiredScreen />
    }

    // External wallet is primary but not connected - prompt to connect
    if (primaryWalletType === 'EXTERNAL' && !externalWalletConnected) {
        const handleConnectWallet = async () => {
            setIsConnectingWallet(true)
            try {
                // Find first installed wallet (usually Nightly)
                const installedWallet = wallets?.find(w => w.readyState === 'Installed')
                if (installedWallet) {
                    await connectWallet(installedWallet.name)
                } else {
                    toast.error('No wallet extension found. Please install Nightly wallet.')
                }
            } catch (err) {
                console.error('Failed to connect wallet:', err)
                toast.error('Failed to connect wallet')
            } finally {
                setIsConnectingWallet(false)
            }
        }
        return <ConnectExternalWalletScreen onConnect={handleConnectWallet} isConnecting={isConnectingWallet} />
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

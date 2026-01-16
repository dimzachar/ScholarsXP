'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Scale, Gavel, Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useWalletSync } from '@/contexts/WalletSyncContext'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { LoginScreen } from '@/components/Auth/LoginScreen'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { useSponsoredVote } from '@/hooks/useSponsoredVote'
import { MobileLayout, MobileHeader, MobileSection } from '@/components/layout/MobileLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CaseFileCard, VerdictButtons, BlockDisappearEffect } from '@/components/vote'
import type { CaseDetails, ReviewerFeedback, ConflictInfo, PlatformBenchmark } from '@/components/vote'
import Link from 'next/link'

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

function ProcessingScreen() {
    return (
        <MobileLayout variant="centered">
            <Card className="w-full max-w-md border-0 shadow-xl bg-card text-center">
                <CardContent className="pt-8 pb-8">
                    <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10 w-fit">
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">Processing Vote</h2>
                    <p className="text-muted-foreground">Submitting your vote on-chain...</p>
                    <p className="text-xs text-muted-foreground mt-2">This may take a few seconds</p>
                </CardContent>
            </Card>
        </MobileLayout>
    )
}

interface JudgmentCase extends CaseDetails {
    reviews: ReviewerFeedback[]
    conflict?: ConflictInfo
    platformBenchmark?: PlatformBenchmark | null
}

function VoteContent({ 
    currentCase, 
    onVote, 
    onSkip,
    voting,
    remaining,
    total,
    triggerAnimation,
    onAnimationComplete
}: { 
    currentCase: JudgmentCase
    onVote: (xp: number, direction: 'left' | 'right') => Promise<boolean>
    onSkip: () => void
    voting: boolean
    remaining: number
    total: number
    triggerAnimation: boolean
    onAnimationComplete: () => void
}) {
    const handleVote = async (xp: number, buttonPosition: 'left' | 'right') => {
        await onVote(xp, buttonPosition)
    }

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

            <MobileSection title="Current Case" icon={Scale} spacing="normal">
                <div className="space-y-6">
                    <BlockDisappearEffect
                        key={currentCase.submissionId}
                        trigger={triggerAnimation}
                        onComplete={onAnimationComplete}
                        duration={1.4}
                    >
                        <CaseFileCard 
                            caseData={currentCase}
                            onVote={(xp) => handleVote(xp, xp === currentCase.divergentScores[0] ? 'left' : 'right')}
                            voting={voting || triggerAnimation}
                        />
                    </BlockDisappearEffect>
                    
                    <VerdictButtons
                        divergentScores={currentCase.divergentScores}
                        onVote={handleVote}
                        onSkip={onSkip}
                        voting={voting || triggerAnimation}
                        submissionId={currentCase.submissionId}
                    />
                </div>
            </MobileSection>
        </MobileLayout>
    )
}

export default function VotePage() {
    const router = useRouter()
    const { isLoading: walletLoading } = useWalletSync()
    const { user, isLoading: userLoading } = usePrivyAuthSync()
    const { authenticatedFetch } = useAuthenticatedFetch()
    const { vote: sponsoredVote } = useSponsoredVote()
    const { connected: externalWalletConnected, connect: connectWallet, wallets } = useWallet()
    const [primaryWalletType, setPrimaryWalletType] = useState<'EMBEDDED' | 'EXTERNAL' | null>(null)
    
    const [primaryWallet, setPrimaryWallet] = useState<string | null>(null)
    const [walletFetched, setWalletFetched] = useState(false)
    const [cases, setCases] = useState<JudgmentCase[]>([])
    const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
    const [currentIndex, setCurrentIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [voting, setVoting] = useState(false)
    const [animating, setAnimating] = useState(false)
    const [wasConnecting, setWasConnecting] = useState(false)

    // Filter out voted cases, cycling through remaining
    const availableCases = useMemo(() => 
        cases.filter(c => !votedIds.has(c.submissionId)), 
        [cases, votedIds]
    )
    
    // Wrap index to cycle through available cases
    const wrappedIndex = availableCases.length > 0 ? currentIndex % availableCases.length : 0
    const currentCase = availableCases[wrappedIndex] || null
    const remaining = availableCases.length
    const total = cases.length
    
    const isInitializing = walletLoading || userLoading || (!walletFetched && !!user)

    useEffect(() => {
        if (wasConnecting && externalWalletConnected) {
            toast.dismiss('wallet-connecting')
            toast.success('Wallet connected! Click the vote button again to submit your vote.')
            setWasConnecting(false)
        }
    }, [wasConnecting, externalWalletConnected])

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
                    setPrimaryWallet(data.primaryWallet || null)
                    setPrimaryWalletType(data.primaryWalletType || null)
                }
            } catch (error) {
                console.error('Failed to fetch primary wallet:', error)
            } finally {
                setWalletFetched(true)
            }
        }
        fetchPrimaryWallet()
    }, [user, authenticatedFetch])

    useEffect(() => {
        const fetchCases = async () => {
            try {
                setLoading(true)
                const url = user?.id 
                    ? `/api/vote?userId=${encodeURIComponent(user.id)}`
                    : '/api/vote'
                const res = await fetch(url, { cache: 'no-store' })
                if (!res.ok) throw new Error('Failed to fetch cases')
                
                const data = await res.json()
                if (data.cases && data.cases.length > 0) {
                    setCases(data.cases)
                    setCurrentIndex(0)
                    setVotedIds(new Set())
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
            toast.error('Please link a wallet in your Profile to vote', {
                action: {
                    label: 'Go to Profile',
                    onClick: () => router.push('/profile'),
                },
            })
            return false
        }

        if (primaryWalletType === 'EXTERNAL' && !externalWalletConnected) {
            const nightlyWallet = wallets?.find(w => w.name.toLowerCase().includes('nightly') && w.readyState === 'Installed')
            const installedWallet = nightlyWallet || wallets?.find(w => w.readyState === 'Installed')
            if (installedWallet) {
                toast.info('Connecting wallet...', { id: 'wallet-connecting' })
                setWasConnecting(true)
                connectWallet(installedWallet.name)
                return false
            } else {
                toast.error('No wallet extension found. Please install Nightly wallet.')
                return false
            }
        }

        setVoting(true)

        try {
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
                // Mark as voted and trigger animation
                setVotedIds(prev => new Set([...prev, currentCase.submissionId]))
                setVoting(false)
                setAnimating(true)
                return true
            }

            setCurrentIndex(prev => prev + 1)
            setVoting(false)
            return true

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Vote failed'
            
            // Handle "already voted" as success - vote exists, move to next case
            if (errorMessage.includes('Already voted')) {
                toast.info('Vote already recorded, moving to next case')
                setVotedIds(prev => new Set([...prev, currentCase.submissionId]))
                setVoting(false)
                setAnimating(true)
                return true
            }
            
            toast.error(errorMessage)
            setVoting(false)
            return false
        }
    }, [currentCase, primaryWallet, primaryWalletType, sponsoredVote, externalWalletConnected, wallets, connectWallet, router])

    const handleAnimationComplete = useCallback(() => {
        setAnimating(false)
        setCurrentIndex(prev => prev + 1)
    }, [])

    // Skip just moves to next case (cycles back eventually)
    const handleSkip = useCallback(() => {
        setCurrentIndex(prev => prev + 1)
    }, [])

    if (isInitializing || loading) {
        return <LoadingScreen />
    }

    // Show login screen for unauthenticated users
    if (!user) {
        return (
            <LoginScreen 
                title="Sign In to Vote"
                subtitle="Sign in with Discord to participate in voting"
            />
        )
    }

    if (!primaryWallet) {
        return <WalletRequiredScreen />
    }

    if (!currentCase) {
        return <NoCasesScreen />
    }

    return (
        <VoteContent
            currentCase={currentCase}
            onVote={handleVote}
            onSkip={handleSkip}
            voting={voting}
            remaining={remaining}
            total={total}
            triggerAnimation={animating}
            onAnimationComplete={handleAnimationComplete}
        />
    )
}

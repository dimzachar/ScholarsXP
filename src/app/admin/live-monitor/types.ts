export interface ActiveVote {
    id: string
    title: string
    url: string
    platform: string
    voteCount: number
    voteDistribution: Record<number, number>
    createdAt: string
    minXp: number
    maxXp: number
    reviewCount: number
    conflictSummary: string
}

export interface ConsensusEvent {
    id: string
    submissionId: string
    title: string
    timestamp: string
    impact: {
        reviewerId: string
        username: string
        status: 'VALIDATED' | 'INVALIDATED' | 'PENDING'
    }[]
}

export interface WatchlistReviewer {
    id: string
    username: string
    activeScore: number
    shadowScoreV1: number | null
    shadowScoreV2: number | null
    metrics: unknown
    timestamp: string
    status: 'Excellent' | 'Good' | 'At Risk'
}

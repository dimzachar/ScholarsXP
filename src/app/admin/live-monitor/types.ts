export interface ActiveVote {
    id: string
    title: string
    url: string
    voteCount: number
    voteDistribution: Record<number, number>
    createdAt: string
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
    metrics: any
    timestamp: string
    status: 'Excellent' | 'Good' | 'At Risk'
}

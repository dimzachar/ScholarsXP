import { prisma } from '@/lib/prisma'

const MIN_VOTES_FOR_CONSENSUS = 5
const CONSENSUS_THRESHOLD = 0.50  // >50%

interface VoteConsensusResult {
    hasConsensus: boolean
    winningXp: number | null
    losingXp: number | null
    totalVotes: number
    distribution: Record<number, number>
    consensusPercentage: number
}

/**
 * Checks if a submission has reached community consensus through voting.
 */
export async function checkVoteConsensus(
    submissionId: string
): Promise<VoteConsensusResult> {
    const votes = await prisma.judgmentVote.findMany({
        where: { submissionId }
    })

    const totalVotes = votes.length

    if (totalVotes < MIN_VOTES_FOR_CONSENSUS) {
        return {
            hasConsensus: false,
            winningXp: null,
            losingXp: null,
            totalVotes,
            distribution: {},
            consensusPercentage: 0
        }
    }

    // Count votes per XP option
    const distribution: Record<number, number> = {}
    for (const vote of votes) {
        distribution[vote.voteXp] = (distribution[vote.voteXp] || 0) + 1
    }

    // Sort options by vote count
    const options = Object.entries(distribution)
        .map(([xp, count]) => ({ xp: parseInt(xp), count }))
        .sort((a, b) => b.count - a.count)

    if (options.length === 0) {
        return {
            hasConsensus: false,
            winningXp: null,
            losingXp: null,
            totalVotes,
            distribution,
            consensusPercentage: 0
        }
    }

    if (options.length === 1) {
        return {
            hasConsensus: true,
            winningXp: options[0].xp,
            losingXp: null,
            totalVotes,
            distribution,
            consensusPercentage: 1.0
        }
    }

    const [winner, loser] = options
    const consensusPercentage = winner.count / totalVotes
    const hasConsensus = consensusPercentage > CONSENSUS_THRESHOLD

    return {
        hasConsensus,
        winningXp: hasConsensus ? winner.xp : null,
        losingXp: hasConsensus ? loser.xp : null,
        totalVotes,
        distribution,
        consensusPercentage
    }
}

/**
 * Processes the outcome of a vote by updating the judgmentStatus of the involved peer reviews.
 */
export async function processVoteConsensus(
    submissionId: string,
    winningXp: number,
    losingXp: number | null
): Promise<void> {
    // Get peer reviews for this submission
    const reviews = await prisma.peerReview.findMany({
        where: {
            submissionId,
            // We only care about the reviews that match the vote options
            xpScore: { in: losingXp !== null ? [winningXp, losingXp] : [winningXp] }
        },
        select: { id: true, xpScore: true }
    })

    if (reviews.length === 0) {
        console.warn(`[Vote Processor] No reviews found for submission ${submissionId} matching vote options ${winningXp}/${losingXp}`)
        return
    }

    // Update PeerReview judgmentStatus
    // Note: We use a transaction to ensure all updates succeed or fail together
    await prisma.$transaction(
        reviews.map(review => {
            const validated = review.xpScore === winningXp
            return prisma.peerReview.update({
                where: { id: review.id },
                data: {
                    judgmentStatus: validated ? 'VALIDATED' : 'INVALIDATED'
                }
            })
        })
    )

    console.log(`✅ Processed vote consensus for ${submissionId}: winner=${winningXp}, loser=${losingXp}`)
}

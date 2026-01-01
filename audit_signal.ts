import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function auditInverseSignal() {
    console.log('--- Auditing Inverse Signal ---')

    const reviewers = await prisma.user.findMany({
        where: {
            peerReviews: {
                some: {}
            }
        },
        include: {
            peerReviews: {
                include: {
                    submission: true
                }
            }
        }
    })

    const results = reviewers.map(user => {
        const reviews = user.peerReviews
        const totalReviews = reviews.length
        if (totalReviews === 0) return null

        const deviations = reviews
            .filter(r => r.submission?.finalXp != null)
            .map(r => Math.abs(r.xpScore - r.submission!.finalXp!))

        const avgDeviation = deviations.length > 0
            ? deviations.reduce((a, b) => a + b, 0) / deviations.length
            : null

        const accuracy = avgDeviation !== null ? Math.max(0, 1 - (avgDeviation / 100)) : 0.5

        // Identify "Bad" signals
        const missedReviews = user.missedReviews || 0
        const votesInvalidated = reviews.filter(r => r.judgmentStatus === 'INVALIDATED').length
        const lateReviews = reviews.filter(r => r.isLate).length
        const timeliness = 1 - (lateReviews / totalReviews)

        let signals = 0
        if (missedReviews > 1) signals += 2
        if (votesInvalidated > 0) signals += 3
        if (accuracy < 0.30 && accuracy !== 0.5) signals += 2
        if (timeliness < 0.85) signals += 1

        const isBad = signals >= 2

        return {
            username: user.username || user.email,
            totalReviews,
            accuracy,
            avgDeviation,
            missedReviews,
            votesInvalidated,
            timeliness,
            isBad
        }
    }).filter(r => r !== null)

    const badReviewers = results.filter(r => r!.isBad)
    const goodReviewers = results.filter(r => !r!.isBad)

    const badAvgAcc = badReviewers.reduce((acc, r) => acc + r!.accuracy, 0) / (badReviewers.length || 1)
    const goodAvgAcc = goodReviewers.reduce((acc, r) => acc + r!.accuracy, 0) / (goodReviewers.length || 1)

    console.log(`Bad Reviewers (${badReviewers.length}) Avg Accuracy: ${(badAvgAcc * 100).toFixed(1)}%`)
    console.log(`Good Reviewers (${goodReviewers.length}) Avg Accuracy: ${(goodAvgAcc * 100).toFixed(1)}%`)

    if (badAvgAcc > goodAvgAcc) {
        console.log('⚠️ INVERSE SIGNAL DETECTED!')
        console.log('Top "Bad but Accurate" Reviewers:')
        badReviewers
            .sort((a, b) => b!.accuracy - a!.accuracy)
            .slice(0, 5)
            .forEach(r => {
                console.log(`- ${r!.username}: Acc=${(r!.accuracy * 100).toFixed(1)}%, Dev=${r!.avgDeviation?.toFixed(1)}, Missed=${r!.missedReviews}, Invalidated=${r!.votesInvalidated}, Time=${(r!.timeliness * 100).toFixed(1)}%`)
            })
    } else {
        console.log('✅ Signal is normal.')
    }

    await prisma.$disconnect()
}

auditInverseSignal()

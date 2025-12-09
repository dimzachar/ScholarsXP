import { prisma } from '@/lib/prisma'

export async function processReadySubmissions(): Promise<number> {
  try {
    // Find submissions that are ready for XP aggregation
    const readySubmissions = await prisma.submission.findMany({
      where: {
        status: 'UNDER_PEER_REVIEW',
        finalXp: null
      },
      include: {
        peerReviews: true
      }
    })

    let processedCount = 0
    let failedCount = 0
    const failedSubmissions: string[] = []

    console.log(`🔍 Found ${readySubmissions.length} submissions ready for processing`)

    for (const submission of readySubmissions) {
      if (submission.peerReviews.length >= 3) {
        try {
          // Switch to peer-only consensus finalization
          const { consensusCalculatorService } = await import('@/lib/consensus-calculator')
          
          console.log(`📝 Processing submission ${submission.id} with ${submission.peerReviews.length} reviews`)
          console.log(`📊 Review scores for ${submission.id}:`, submission.peerReviews.map(r => ({ id: r.id, score: r.xpScore, reviewer: r.reviewerId })))
          
          await consensusCalculatorService.calculateConsensus(submission.id)
          processedCount++
          console.log(`✅ Successfully processed submission ${submission.id}`)
        } catch (error: any) {
          failedCount++
          failedSubmissions.push(submission.id)
          const errorMessage = error.message
          
          // Log specific error types for debugging
          if (errorMessage.includes('Weekly submission cap reached')) {
            console.log(`⏰ Submission ${submission.id} blocked by weekly cap: ${errorMessage}`)
          } else if (errorMessage.includes('Not enough reviews')) {
            console.log(`⚠️ Submission ${submission.id} has insufficient reviews: ${errorMessage}`)
          } else {
            console.error(`❌ Failed to process submission ${submission.id}:`, errorMessage)
          }
        }
      } else {
        console.log(`📋 Submission ${submission.id} has only ${submission.peerReviews.length} reviews, needs 3+ for consensus`)
      }
    }

    console.log(`📊 Processing complete: ${processedCount} succeeded, ${failedCount} failed`)
    
    if (failedCount > 0) {
      console.log(`❌ Failed submissions: ${failedSubmissions.join(', ')}`)
    }

    return processedCount

  } catch (error) {
    console.error('❌ Error processing ready submissions:', error)
    throw new Error('Failed to process submissions')
  }
}

/**
 * Fallback function to handle submissions that might be stuck
 * This checks for submissions that have been under peer review for too long
 */
export async function processStuckSubmissions(): Promise<number> {
  try {
    const thresholdDays = 7 // Check submissions older than 7 days
    const thresholdDate = new Date()
    thresholdDate.setDate(thresholdDate.getDate() - thresholdDays)

    // Find submissions that have been under peer review for too long
    const stuckSubmissions = await prisma.submission.findMany({
      where: {
        status: 'UNDER_PEER_REVIEW',
        finalXp: null,
        createdAt: { lt: thresholdDate }
      },
      include: {
        peerReviews: true,
        user: true
      }
    })

    let processedCount = 0

    console.log(`🔍 Found ${stuckSubmissions.length} submissions stuck in peer review for >${thresholdDays} days`)

    for (const submission of stuckSubmissions) {
      try {
        console.log(`🔄 Attempting to finalize stuck submission ${submission.id} (created ${submission.createdAt.toISOString()})`)
        
        // Check if we have enough reviews
        if (submission.peerReviews.length >= 3) {
          const { consensusCalculatorService } = await import('@/lib/consensus-calculator')
          await consensusCalculatorService.calculateConsensus(submission.id)
          processedCount++
          console.log(`✅ Finalized stuck submission ${submission.id}`)
        } else {
          console.log(`⚠️ Stuck submission ${submission.id} only has ${submission.peerReviews.length} reviews, cannot finalize`)
        }
      } catch (error: any) {
        const errorMessage = error.message
        console.error(`❌ Failed to process stuck submission ${submission.id}:`, errorMessage)
      }
    }

    console.log(`📊 Stuck submissions processed: ${processedCount}/${stuckSubmissions.length}`)
    return processedCount

  } catch (error) {
    console.error('❌ Error processing stuck submissions:', error)
    return 0
  }
}

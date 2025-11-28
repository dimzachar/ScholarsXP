import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { generateReviewSummary } from './src/lib/ai-summary'

const prisma = new PrismaClient()

async function main() {
    console.log('🚀 Starting AI summary backfill...')

    try {
        // Find all finalized submissions without summary
        const submissions = await prisma.submission.findMany({
            where: {
                status: 'FINALIZED',
                aiSummary: null
            },
            select: {
                id: true,
                title: true,
                userId: true
            }
        })

        console.log(`📊 Found ${submissions.length} submissions needing summary`)
        console.log('\n') // Spacing

        let processed = 0
        let skipped = 0
        let failed = 0
        const total = submissions.length

        // Simple progress bar function
        const updateProgress = (current: number, total: number, title: string) => {
            const width = 30
            const percentage = Math.round((current / total) * 100)
            const filled = Math.round((width * current) / total)
            const empty = width - filled
            const bar = '█'.repeat(filled) + '░'.repeat(empty)

            // Clear line and write progress
            process.stdout.write(`\r[${bar}] ${percentage}% | ${current}/${total} | ${title.substring(0, 20).padEnd(20)}`)
        }

        for (const sub of submissions) {
            processed++
            updateProgress(processed, total, sub.title || 'Untitled')

            try {
                // Get reviews
                const reviews = await prisma.peerReview.findMany({
                    where: { submissionId: sub.id },
                    select: { comments: true, xpScore: true, qualityRating: true }
                })

                if (reviews.length < 3) {
                    skipped++
                    continue
                }

                // Generate summary
                const summary = await generateReviewSummary(sub.title || 'Untitled Submission', reviews)

                if (summary.startsWith('Failed to generate') || summary.startsWith('No detailed feedback')) {
                    failed++
                    continue
                }

                // Save to DB
                await prisma.submission.update({
                    where: { id: sub.id },
                    data: {
                        aiSummary: summary,
                        summaryGeneratedAt: new Date()
                    }
                })

                // Add small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500))

            } catch (err) {
                // console.error(`   ❌ Error processing submission:`, err)
                failed++
            }
        }

        console.log('\n\n🏁 Backfill complete!')
        console.log(`Total: ${total}`)
        console.log(`Processed: ${processed - skipped - failed}`)
        console.log(`Skipped: ${skipped}`)
        console.log(`Failed: ${failed}`)

    } catch (error) {
        console.error('❌ Fatal error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()

import OpenAI from 'openai'

/**
 * Generate a summary of peer reviews for a submission
 */
export async function generateReviewSummary(
    submissionTitle: string,
    reviews: Array<{ comments?: string | null; xpScore: number; qualityRating?: number | null }>
): Promise<string> {
    try {
        // console.log('🔧 Starting generateReviewSummary...')
        // console.log('🔑 OpenRouter API Key exists:', !!process.env.OPENROUTER_API_KEY)

        // Initialize OpenRouter client
        const openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: process.env.OPENROUTER_API_KEY,
            defaultHeaders: {
                "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
                "X-Title": "Scholars_XP",
            },
        })

        // Filter out empty reviews
        const validReviews = reviews.filter(r => r.comments && r.comments.trim().length > 10)

        if (validReviews.length === 0) {
            return "No detailed feedback available to summarize."
        }

        const reviewsText = validReviews.map((r, i) => `Review ${i + 1} (Score: ${r.xpScore}): ${r.comments}`).join('\n\n')

        const prompt = `
You are a helpful mentor for the Scholars_XP platform. Your goal is to help users improve their contributions.
Summarize the following peer reviews for the submission titled "${submissionTitle}".

Reviews:
${reviewsText}

Please provide a concise summary (max 3-4 sentences) that:
1. Highlights the main strengths mentioned by reviewers.
2. Points out the key areas for improvement.
3. Offers a constructive concluding remark.

Do not use bullet points. Write in a flowing, encouraging paragraph.
`

        // console.log(`🤖 Generating summary for "${submissionTitle}" with ${validReviews.length} reviews`)
        // console.log(`📝 Prompt preview: ${prompt.substring(0, 100)}...`)

        const response = await openai.chat.completions.create({
            model: 'kwaipilot/kat-coder-pro:free',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful, constructive mentor.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 300
        })

        // console.log('✅ OpenRouter response received')
        const content = response.choices[0]?.message?.content

        if (!content) {
            // console.error('❌ No content in OpenRouter response', response)
            return "Unable to generate summary."
        }

        return content

    } catch (error: any) {
        // console.error('❌ Error generating review summary:', error)
        // console.error('❌ Error message:', error?.message)
        // console.error('❌ Error stack:', error?.stack)
        if (error?.response) {
            // console.error('❌ Error response data:', error.response.data)
        }
        return `Failed to generate feedback summary. Error: ${error?.message || 'Unknown error'}`
    }
}

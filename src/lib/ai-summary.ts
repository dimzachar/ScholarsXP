import OpenAI from 'openai'

// Fallback models in order of preference
const MODELS = [
    'z-ai/glm-4.5-air:free',
    'xiaomi/mimo-v2-flash:free',
]

/**
 * Generate a summary of peer reviews for a submission
 */
export async function generateReviewSummary(
    submissionTitle: string,
    reviews: Array<{ comments?: string | null; xpScore: number; qualityRating?: number | null }>,
    options?: { verbose?: boolean }
): Promise<string> {
    const verbose = options?.verbose ?? false
    const log = (msg: string) => verbose && console.log(msg)

    try {
        if (!process.env.OPENROUTER_API_KEY) {
            log('❌ OPENROUTER_API_KEY not set')
            return "Unable to generate summary - API key missing."
        }

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

        // Try each model until one works
        let lastError: Error | null = null
        for (const model of MODELS) {
            try {
                log(`🤖 Trying model: ${model}`)

                const response = await openai.chat.completions.create({
                    model,
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
                    max_tokens: 300,
                    // @ts-expect-error - OpenRouter specific: disable reasoning/thinking mode
                    reasoning: { enabled: false }
                })

                const content = response.choices[0]?.message?.content
                const finishReason = response.choices[0]?.finish_reason

                if (content && content.trim().length > 20) {
                    log(`✅ Success with ${model}`)
                    return content.trim()
                }

                // Detailed logging for empty responses
                log(`⚠️ Empty response from ${model}`)
                log(`   - finish_reason: ${finishReason}`)
                log(`   - choices count: ${response.choices?.length}`)
                log(`   - content length: ${content?.length ?? 0}`)
                log(`   - content preview: "${content?.substring(0, 100) || '(empty)'}"`)
                log(`   - full response: ${JSON.stringify(response, null, 2)}`)
            } catch (modelError: any) {
                lastError = modelError
                log(`⚠️ Model ${model} failed: ${modelError?.message || 'Unknown error'}`)
                // Continue to next model
            }
        }

        log(`❌ All models failed. Last error: ${lastError?.message}`)
        return "Unable to generate summary."

    } catch (error: any) {
        const msg = error?.message || 'Unknown error'
        verbose && console.error('❌ Error generating review summary:', msg)
        return "Unable to generate feedback summary at this time."
    }
}

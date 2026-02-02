import OpenAI from 'openai';
import { buildSecurePrompt } from './prompt-defense';

// Using model with JSON mode support for structured outputs
const MODELS = ['arcee-ai/trinity-large-preview:free', 'z-ai/glm-4.5-air:free'];

interface Review {
  comments?: string | null;
  xpScore: number;
  qualityRating?: number | null;
}

/**
 * Generate a summary of peer reviews for a submission
 * Uses secure prompt with injection defense layers
 */
export async function generateReviewSummary(
  submissionTitle: string,
  reviews: Review[],
  options?: { verbose?: boolean }
): Promise<string> {
  const verbose = options?.verbose ?? false;
  const log = (msg: string) => verbose && console.log(msg);

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      log('❌ OPENROUTER_API_KEY not set');
      return 'Unable to generate summary - API key missing.';
    }

    // Build secure prompt with defense layers
    const prompt = buildSecurePrompt({
      submissionTitle,
      reviews,
    });

    if (!prompt) {
      return 'No detailed feedback available to summarize.';
    }

    // Initialize OpenRouter client
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'Scholars_XP',
      },
    });

    // Try each model until one works
    let lastError: Error | null = null;
    for (const model of MODELS) {
      try {
        log(`🤖 Trying model: ${model}`);

        const response = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful, constructive mentor. Always respond with valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 300,
          response_format: { type: 'json_object' },
          // @ts-expect-error - OpenRouter specific
          reasoning: { enabled: false },
        });

        const content = response.choices[0]?.message?.content;
        const finishReason = response.choices[0]?.finish_reason;

        if (!content) {
          log(`⚠️ Empty response from ${model}`);
          continue;
        }

        // Parse JSON response
        try {
          const parsed = JSON.parse(content);
          if (parsed.summary && typeof parsed.summary === 'string') {
            log(`✅ Success with ${model}`);
            return parsed.summary.trim();
          }
          log(`⚠️ Invalid JSON structure from ${model}`);
        } catch {
          // If JSON parsing fails but content looks like a summary, use it
          if (content.length > 50 && !content.includes('{')) {
            log(`✅ Success with ${model} (plain text)`);
            return content.trim();
          }
          log(`⚠️ JSON parse error from ${model}`);
        }

        log(`⚠️ Invalid response from ${model}`);
        log(`   - finish_reason: ${finishReason}`);
        log(`   - content preview: "${content?.substring(0, 100) || '(empty)'}"`);
      } catch (modelError: any) {
        lastError = modelError;
        log(`⚠️ Model ${model} failed: ${modelError?.message || 'Unknown error'}`);
        // Continue to next model
      }
    }

    log(`❌ All models failed. Last error: ${lastError?.message}`);
    return 'Unable to generate summary.';
  } catch (error: any) {
    const msg = error?.message || 'Unknown error';
    verbose && console.error('❌ Error generating review summary:', msg);
    return 'Unable to generate feedback summary at this time.';
  }
}

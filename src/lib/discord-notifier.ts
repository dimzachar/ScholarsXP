/**
 * Discord Webhook Notifier
 * 
 * Sends real-time promotion notifications to Discord via webhook
 * Only sends major role promotions (category changes: Initiate → Apprentice → etc.)
 */

interface PromotionData {
  username: string
  oldCategory: string
  newCategory: string
  date: Date
  isDemotion?: boolean
}

/**
 * Sends a promotion or demotion notification to Discord
 * Format: "Date @username has been promoted: Initiate -> Apprentice"
 * Format: "Date @username has been demoted: Apprentice -> Initiate"
 */
export async function notifyDiscordPromotion(data: PromotionData): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  
  // Skip if webhook not configured
  if (!webhookUrl) {
    return
  }

  try {
    const formattedDate = data.date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })

    const action = data.isDemotion ? 'demoted' : 'promoted'
    const message = `${formattedDate} @${data.username} has been ${action}: ${data.oldCategory} -> ${data.newCategory}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    console.log(`[Discord] Sent ${action} notification for ${data.username}`)
  } catch (error) {
    console.error('[Discord] Failed to send webhook:', error)
    // Don't throw - webhook failures shouldn't break the promotion flow
  }
}

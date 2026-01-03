/**
 * Vote Analytics API - Stores click/interaction events
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const event = await req.json()
    
    // Validate required fields
    if (!event.submissionId || !event.eventType || !event.visitorId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Store in database using raw query (works before prisma generate)
    await prisma.$executeRaw`
      INSERT INTO "VoteAnalyticsEvent" (
        "id", "sessionId", "visitorId", "submissionId", "eventType",
        "votedXp", "buttonPosition", "highXpPosition", "timeSpentMs", "timestamp"
      ) VALUES (
        gen_random_uuid(),
        ${event.sessionId || 'unknown'},
        ${event.visitorId},
        ${event.submissionId},
        ${event.eventType},
        ${event.votedXp || null},
        ${event.buttonPosition || null},
        ${event.highXpPosition || null},
        ${event.timeSpentMs || null},
        ${new Date(event.timestamp || Date.now())}
      )
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    // Silent fail for analytics - don't break user experience
    console.error('[Vote Analytics] Error:', error)
    return NextResponse.json({ success: false }, { status: 200 })
  }
}

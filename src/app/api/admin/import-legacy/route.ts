import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { storeLegacyContentFingerprint, generateContentFingerprint } from '@/lib/duplicate-content-detector'
import { getWeekNumber } from '@/lib/utils'
import { Prisma } from '@prisma/client'

interface LegacyImportRequest {
  csvData: string
}

interface LegacySubmissionData {
  timestamp: string
  discordHandle: string
  role: string
  submissionLink: string
  xp?: number
  notes?: string
}

/**
 * Simple platform detection for legacy imports
 */
function detectPlatformFromUrl(url: string): string {
  const urlLower = url.toLowerCase()

  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'Twitter'
  } else if (urlLower.includes('medium.com')) {
    return 'Medium'
  } else if (urlLower.includes('reddit.com')) {
    return 'Reddit'
  } else if (urlLower.includes('notion.so') || urlLower.includes('notion.site')) {
    return 'Notion'
  } else if (urlLower.includes('linkedin.com')) {
    return 'LinkedIn'
  } else if (urlLower.includes('github.com')) {
    return 'GitHub'
  } else if (urlLower.includes('substack.com')) {
    return 'Substack'
  } else {
    return 'Other'
  }
}

// Basic sleep util for retry backoff
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Detect transient DB/network errors that are safe to retry
function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase()
  return (
    msg.includes('server has closed the connection') ||
    msg.includes("can't reach database server") ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('read econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('p1001') || // Prisma: can\'t reach database server
    msg.includes('p1008')    // Prisma: operation timed out
  )
}

// Small retry helper to harden import against transient pool disconnects
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  let attempt = 0
  let lastErr: unknown

  while (attempt <= maxRetries) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < maxRetries && isTransientError(err)) {
        const backoff = 250 * Math.pow(2, attempt) // 250ms, 500ms, 1000ms, 2000ms
        console.warn(`Transient error on ${label} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${backoff}ms...`, err)
        await delay(backoff)
        attempt++
        continue
      }
      throw err
    }
  }
  // Should not reach, but TypeScript friendly return
  throw lastErr instanceof Error ? lastErr : new Error('Unknown error')
}

function parseCSV(csvData: string): LegacySubmissionData[] {
  console.log('📊 Parsing CSV data:', csvData.substring(0, 200) + '...')

  const lines = csvData.trim().split('\n')
  console.log('📝 Found lines:', lines.length)

  if (lines.length < 1) {
    throw new Error('CSV data is empty')
  }

  // Handle case where there's no header row or it's tab-separated
  if (lines.length === 1 || !lines[0].includes(',') || lines[0].includes('\t')) {
    console.log('🔍 Detected tab-separated format')

    // Parse your format: "4/28/2025 15:59	tr2uochy	Initiate	https://x.com/tr2uochy/status/1916854557097034232"
    const submissions: LegacySubmissionData[] = []

    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim().replace(/^"|"$/g, '')) // Remove quotes
      console.log('📋 Parsing line parts:', parts)

      if (parts.length >= 4) {
        // Clean Discord handle
        const discordHandle = parts[1]?.replace(/^@/, '').trim() // Remove @ prefix
        if (!discordHandle || discordHandle === '') {
          console.log('⚠️ Skipping entry with empty Discord handle')
          continue
        }

        // Extract URLs from the submission link field (might contain multiple URLs)
        const urlText = parts[3]
        const urlMatches = urlText.match(/https?:\/\/[^\s\n"]+/g)

        if (!urlMatches || urlMatches.length === 0) {
          console.log('⚠️ Skipping entry with no valid URLs:', urlText)
          continue
        }

        // Process each URL separately
        for (const url of urlMatches) {
          const cleanUrl = url.replace(/[,;"\s]+$/, '') // Remove trailing punctuation

          submissions.push({
            timestamp: parts[0],
            discordHandle: discordHandle,
            role: parts[2],
            submissionLink: cleanUrl,
            xp: parts[4] && !isNaN(Number(parts[4])) ? Number(parts[4]) : undefined,
            notes: parts[5] || undefined
          })
        }
      }
    }

    console.log('✅ Parsed submissions:', submissions)
    return submissions
  }

  // Original CSV parsing logic for comma-separated files
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  console.log('📋 Headers found:', headers)
  const submissions: LegacySubmissionData[] = []

  // Find column indices
  const timestampIndex = headers.findIndex(h =>
    h.includes('timestamp') || h.includes('time') || h.includes('date')
  )
  const discordIndex = headers.findIndex(h =>
    h.includes('discord') || h.includes('handle') || h.includes('username')
  )
  const roleIndex = headers.findIndex(h =>
    h.includes('role') || h.includes('position')
  )
  const linkIndex = headers.findIndex(h =>
    h.includes('link') || h.includes('url') || h.includes('submission')
  )
  const notesIndex = headers.findIndex(h =>
    h.includes('notes') || h.includes('comment')
  )

  console.log('🔍 Column indices:', { timestampIndex, discordIndex, roleIndex, linkIndex, notesIndex })

  if (timestampIndex === -1 || discordIndex === -1 || roleIndex === -1 || linkIndex === -1) {
    throw new Error('CSV must contain columns for: Timestamp, Discord Handle, Role, and Submission Link')
  }

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    
    if (values.length < Math.max(timestampIndex, discordIndex, roleIndex, linkIndex) + 1) {
      continue // Skip malformed rows
    }

    const submissionLink = values[linkIndex]
    if (!submissionLink || !submissionLink.startsWith('http')) {
      continue // Skip rows without valid URLs
    }

    submissions.push({
      timestamp: values[timestampIndex],
      discordHandle: values[discordIndex],
      role: values[roleIndex],
      submissionLink: submissionLink,
      notes: notesIndex !== -1 ? values[notesIndex] : undefined
    })
  }

  return submissions
}

/**
 * Legacy import handler for CSV data
 * Processes legacy submissions and creates user accounts if needed
 *
 * NOTE: AI evaluation is DISABLED for legacy imports to avoid rate limiting
 * and speed up the import process. AI evaluation remains ACTIVE for new submissions.
 */
async function importLegacyHandler(request: NextRequest) {
  try {
    const { csvData }: LegacyImportRequest = await request.json()

    // Ensure csvData is a string
    const csvDataString = typeof csvData === 'string' ? csvData : String(csvData || '')

    if (!csvDataString || !csvDataString.trim()) {
      return NextResponse.json({
        error: 'CSV data is required'
      }, { status: 400 })
    }

    // Parse CSV data
    let submissions: LegacySubmissionData[]
    try {
      submissions = parseCSV(csvDataString)
    } catch (error) {
      return NextResponse.json({
        error: `CSV parsing error: ${error instanceof Error ? error.message : 'Invalid format'}`
      }, { status: 400 })
    }

    if (submissions.length === 0) {
      return NextResponse.json({
        error: 'No valid submissions found in CSV data'
      }, { status: 400 })
    }

    let imported = 0
    let duplicates = 0
    const duplicateDetails: { url: string; type: 'LEGACY' | 'CURRENT'; existingId?: string }[] = []
    const errors: string[] = []

    // Warm connection and then process each submission
    try {
      await prisma.$connect()
    } catch (e) {
      // Continue; each call below has its own retry anyway
      console.warn('Prisma connect warning before import:', e)
    }

    // Prefetch duplicates and users to avoid N+1 queries
    const uniqueUrls = Array.from(new Set(submissions.map(s => s.submissionLink)))
    const uniqueHandles = Array.from(new Set(submissions.map(s => s.discordHandle)))

    const [legacyUrls, currentUrls, existingUsersArr] = await Promise.all([
      withRetry(
        () => prisma.legacySubmission.findMany({ where: { url: { in: uniqueUrls } }, select: { url: true } }),
        'legacySubmission.findMany(url prefetch)'
      ),
      withRetry(
        () => prisma.submission.findMany({ where: { url: { in: uniqueUrls } }, select: { url: true } }),
        'submission.findMany(url prefetch)'
      ),
      withRetry(
        () => prisma.user.findMany({ where: { discordHandle: { in: uniqueHandles } }, select: { id: true, discordHandle: true } }),
        'user.findMany(handle prefetch)'
      )
    ])

    const legacyUrlSet = new Set(legacyUrls.map(u => u.url))
    const currentUrlSet = new Set(currentUrls.map(u => u.url))
    const userByHandle = new Map<string, { id: string; discordHandle: string | null }>()
    for (const u of existingUsersArr) {
      if (u.discordHandle) userByHandle.set(u.discordHandle, { id: u.id, discordHandle: u.discordHandle })
    }

    // Create missing users in bulk
    const toCreateHandles = uniqueHandles.filter(h => !!h && !userByHandle.has(h))
    if (toCreateHandles.length > 0) {
      await withRetry(
        () => prisma.user.createMany({
          data: toCreateHandles.map(h => ({
            email: `${h}@legacy.import`,
            username: h,
            discordHandle: h,
            role: 'USER'
          })),
          skipDuplicates: true
        }),
        'user.createMany'
      )
      const newlyCreated = await withRetry(
        () => prisma.user.findMany({ where: { discordHandle: { in: toCreateHandles } }, select: { id: true, discordHandle: true } }),
        'user.findMany(refetch after createMany)'
      )
      for (const u of newlyCreated) {
        if (u.discordHandle) userByHandle.set(u.discordHandle, { id: u.id, discordHandle: u.discordHandle })
      }
    }

    // Fast-path bulk processing: prefilter duplicates, then create in bulk
    const newItems: Array<{
      submission: LegacySubmissionData
      userId: string
      submittedAt: Date
      legacyXp: number
    }> = []

    for (const submission of submissions) {
      try {
        // Parse timestamp
        let submittedAt: Date
        try {
          submittedAt = new Date(submission.timestamp)
          if (isNaN(submittedAt.getTime())) {
            throw new Error('Invalid date')
          }
        } catch {
          submittedAt = new Date() // Fallback to current date
        }

        // Resolve user for this Discord handle
        let user = userByHandle.get(submission.discordHandle)

        if (!user) {
          // Create new user account for legacy import
          const created = await withRetry(
            () => prisma.user.create({
              data: {
                email: `${submission.discordHandle}@legacy.import`, // Temporary email
                username: submission.discordHandle,
                discordHandle: submission.discordHandle,
                role: submission.role === 'Initiate' ? 'USER' : 'USER', // Map roles as needed
                totalXp: 0, // Will be calculated later
                currentWeekXp: 0,
                streakWeeks: 0,
                missedReviews: 0
              }
            }),
            'user.create'
          )
          user = { id: created.id, discordHandle: created.discordHandle ?? submission.discordHandle }
          if (user.discordHandle) userByHandle.set(user.discordHandle, user)
          console.log(`Created legacy user account for ${submission.discordHandle}`)
        }

        // Fast duplicate checks from prefetched sets
        if (legacyUrlSet.has(submission.submissionLink)) {
          duplicates++
          duplicateDetails.push({ url: submission.submissionLink, type: 'LEGACY' })
          continue
        }

        if (currentUrlSet.has(submission.submissionLink)) {
          duplicates++
          duplicateDetails.push({ url: submission.submissionLink, type: 'CURRENT' })
          continue
        }

        // Collect for bulk insert
        const legacyXp = submission.xp && submission.xp > 0 ? submission.xp : 0
        newItems.push({ submission, userId: user.id, submittedAt, legacyXp })

      } catch (error) {
        const errorMsg = `Row ${imported + duplicates + errors.length + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error('Legacy import error:', errorMsg)
      }
    }

    if (newItems.length > 0) {
      // 1) Bulk insert legacy submissions
      const legacyData = newItems.map(({ submission, submittedAt, legacyXp }) => ({
        url: submission.submissionLink,
        discordHandle: submission.discordHandle,
        submittedAt,
        role: submission.role,
        notes: submission.notes,
        processed: false,
        aiXp: 0,
        peerXp: legacyXp > 0 ? legacyXp : null,
        finalXp: legacyXp > 0 ? legacyXp : null
      }))

      await withRetry(
        () => prisma.legacySubmission.createMany({ data: legacyData, skipDuplicates: true }),
        'legacySubmission.createMany'
      )

      // 2) Fetch inserted legacy submissions to get IDs (by URL)
      const newUrls = newItems.map(i => i.submission.submissionLink)
      const insertedLegacy = await withRetry(
        () => prisma.legacySubmission.findMany({ where: { url: { in: newUrls } }, select: { id: true, url: true } }),
        'legacySubmission.findMany(fetch inserted)'
      )
      const legacyIdByUrl = new Map(insertedLegacy.map(r => [r.url, r.id]))

      // 3) Bulk fingerprints (basic URL-based)
      const fingerprintRows = newItems.map(({ submission }) => {
        const platform = detectPlatformFromUrl(submission.submissionLink)
        const fp = generateContentFingerprint(submission.submissionLink)
        const legacyId = legacyIdByUrl.get(submission.submissionLink) as string
        return {
          legacySubmissionId: legacyId,
          hash: fp.hash,
          normalizedContent: fp.normalizedContent,
          keyPhrases: fp.keyPhrases,
          contentLength: fp.contentLength,
          wordCount: fp.wordCount,
          url: submission.submissionLink,
          platform
        }
      })
      // Some drivers limit batch size; split if large
      const fpChunk = 500
      for (let i = 0; i < fingerprintRows.length; i += fpChunk) {
        const slice = fingerprintRows.slice(i, i + fpChunk)
        await withRetry(
          () => prisma.contentFingerprint.createMany({ data: slice, skipDuplicates: true }),
          'contentFingerprint.createMany'
        )
      }

      // 4) Bulk XP transactions and aggregated user XP updates
      const xpTxRows: { userId: string; amount: number; type: 'SUBMISSION_REWARD'; description: string; weekNumber: number; createdAt: Date; sourceType: 'LEGACY_SUBMISSION' }[] = []
      const xpByUser = new Map<string, number>()
      for (const item of newItems) {
        if (item.legacyXp > 0) {
          const wn = getWeekNumber(item.submittedAt)
          xpTxRows.push({
            userId: item.userId,
            amount: item.legacyXp,
            type: 'SUBMISSION_REWARD',
            description: `Legacy import: ${item.submission.submissionLink} (${item.submission.role})`,
            weekNumber: wn,
            createdAt: item.submittedAt,
            sourceType: 'LEGACY_SUBMISSION'
          })
          xpByUser.set(item.userId, (xpByUser.get(item.userId) || 0) + item.legacyXp)
        }
      }

      if (xpTxRows.length > 0) {
        // Create transactions in batches
        const txChunk = 500
        for (let i = 0; i < xpTxRows.length; i += txChunk) {
          const slice = xpTxRows.slice(i, i + txChunk)
          await withRetry(
            () => prisma.xpTransaction.createMany({ data: slice }),
            'xpTransaction.createMany'
          )
        }

        // Single SQL to increment per-user totals using VALUES (parameterized)
        const pairs = Array.from(xpByUser.entries())
        if (pairs.length > 0) {
          const values = Prisma.join(
            pairs.map(([id, amtRaw]) => {
              const amt = Math.max(0, Math.trunc(amtRaw))
              return Prisma.sql`(${id}::uuid, ${amt})`
            })
          )
          await withRetry(
            () => prisma.$executeRaw`UPDATE "User" AS u
              SET "totalXp" = u."totalXp" + v.sum_xp
              FROM (VALUES ${values}) AS v(id, sum_xp)
              WHERE u.id = v.id;`,
            'user.bulkIncrement'
          )
        }
      }

      imported += newItems.length
      // Add to legacyUrlSet to prevent duplicates within this run
      for (const u of newUrls) legacyUrlSet.add(u)
    }

    return NextResponse.json({
      message: `Legacy import completed: ${imported} imported, ${duplicates} duplicates skipped, ${errors.length} errors`,
      imported,
      duplicates,
      duplicateDetails,
      errors: errors.slice(0, 20) // Limit error list
    })

  } catch (error) {
    console.error('Legacy import error:', error)
    return NextResponse.json({
      error: 'Internal server error during import'
    }, { status: 500 })
  }
}

// Legacy import handler (auth temporarily bypassed for testing)
/* disabled: legacy unauth import handler (kept for reference, not exported) */
async function POST_unsecured_DISABLED(request: NextRequest) {
  console.log('🔍 Legacy import API called - AI evaluation disabled for legacy imports')

  try {
    return await importLegacyHandler(request)
  } catch (error) {
    console.error('❌ Legacy import error:', error)
    return NextResponse.json({
      error: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 })
  }
}

// TODO: Re-enable auth when ready: export const POST = withPermission(['ADMIN'])(importLegacyHandler)
// Secured admin-only POST endpoint (replacing temporary bypass)
export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  return importLegacyHandler(request)
})

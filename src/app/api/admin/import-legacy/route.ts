import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { storeLegacyContentFingerprint } from '@/lib/duplicate-content-detector'
import { getWeekNumber } from '@/lib/utils'

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
        let discordHandle = parts[1]?.replace(/^@/, '').trim() // Remove @ prefix
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
    const errors: string[] = []

    // Process each submission
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

        // Create or find user account for this Discord handle
        let user = await prisma.user.findFirst({
          where: { discordHandle: submission.discordHandle }
        })

        if (!user) {
          // Create new user account for legacy import
          user = await prisma.user.create({
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
          })
          console.log(`Created legacy user account for ${submission.discordHandle}`)
        }

        // Check if URL already exists
        const existingLegacy = await prisma.legacySubmission.findUnique({
          where: { url: submission.submissionLink }
        })

        if (existingLegacy) {
          duplicates++
          continue
        }

        // Check if URL exists in current submissions
        const existingCurrent = await prisma.submission.findFirst({
          where: { url: submission.submissionLink }
        })

        if (existingCurrent) {
          duplicates++
          continue
        }

        // Get XP from CSV data - if not provided, default to 0 (admin can assign later)
        const legacyXp = submission.xp && submission.xp > 0 ? submission.xp : 0

        // Calculate correct week number from submission date
        const submissionWeekNumber = getWeekNumber(submittedAt)

        // Create legacy submission record with XP values
        // For legacy submissions: peerXP = finalXP (no AI evaluation), aiXP = 0
        const legacySubmission = await prisma.legacySubmission.create({
          data: {
            url: submission.submissionLink,
            discordHandle: submission.discordHandle,
            submittedAt: submittedAt,
            role: submission.role,
            notes: submission.notes,
            processed: false,
            aiXp: 0, // Legacy submissions have no AI evaluation
            peerXp: legacyXp > 0 ? legacyXp : null, // Store XP as peerXp for legacy submissions
            finalXp: legacyXp > 0 ? legacyXp : null // Store finalXp only if XP > 0
          }
        })

        // Award XP for legacy submission (if XP provided)
        if (legacyXp > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              totalXp: { increment: legacyXp }
            }
          })

          // Create XP transaction record for legacy submissions
          await prisma.xpTransaction.create({
            data: {
              userId: user.id,
              amount: legacyXp,
              type: 'SUBMISSION_REWARD', // Use SUBMISSION_REWARD for legacy content
              description: `Legacy import: ${submission.submissionLink} (${submission.role})`,
              weekNumber: submissionWeekNumber // Use correct week number from submission date
            }
          })
        }

        // Create basic fingerprint for duplicate detection (skip AI content fetching for legacy imports)
        try {
          // For legacy imports, we'll create a simple fingerprint based on the URL
          // This allows duplicate detection without expensive AI content fetching
          const platform = detectPlatformFromUrl(submission.submissionLink)
          await storeLegacyContentFingerprint(
            legacySubmission.id,
            submission.submissionLink,
            submission.submissionLink, // Use URL as content for basic fingerprinting
            platform
          )
          console.log(`📝 Created basic fingerprint for legacy submission: ${submission.submissionLink}`)
        } catch (fingerprintError) {
          // Log fingerprint creation error but don't fail the import
          console.warn(`Could not create fingerprint for ${submission.submissionLink}:`, fingerprintError)
        }

        imported++

      } catch (error) {
        const errorMsg = `Row ${imported + duplicates + errors.length + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(errorMsg)
        console.error('Legacy import error:', errorMsg)
      }
    }

    return NextResponse.json({
      message: `Legacy import completed: ${imported} imported, ${duplicates} duplicates skipped, ${errors.length} errors`,
      imported,
      duplicates,
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
export async function POST(request: NextRequest) {
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

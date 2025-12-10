import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const runningOnVercel =
  process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV)

const disablePoolerFlag = process.env.SUPABASE_DISABLE_POOLER === 'true'
const forcePoolerFlag = process.env.SUPABASE_FORCE_POOLER === 'true'
const directUrl = process.env.DIRECT_URL

const directIsLocalHost = Boolean(directUrl?.match(/(localhost|127\.0\.0\.1)/))

const preferDirectDatabase =
  Boolean(directUrl) &&
  !forcePoolerFlag &&
  (disablePoolerFlag || directIsLocalHost)

const databaseUrl = preferDirectDatabase
  ? directUrl!
  : process.env.DATABASE_URL ?? directUrl

if (!databaseUrl) {
  throw new Error(
    'Database connection string missing. Set DATABASE_URL or DIRECT_URL.'
  )
}

if (
  preferDirectDatabase &&
  process.env.NODE_ENV !== 'production' &&
  process.env.SUPPRESS_LOGS !== 'true'
) {
  console.info('[prisma] Using DIRECT_URL for Prisma datasource')
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? [] : [],
    datasources: {
      db: { url: databaseUrl }
    }
    // Configure connection pooling via DATABASE_URL parameters
    // The connection limit should be set in the DATABASE_URL itself
    // e.g., DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=10"
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Graceful shutdown to close connections properly (only in Node.js environment)
// Check for process.exit to ensure we're not in Edge Runtime where it's unavailable
if (
  typeof process !== 'undefined' &&
  typeof process.on === 'function' &&
  typeof process.exit === 'function'
) {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })

  process.on('SIGINT', async () => {
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

// Lightweight, idempotent schema patcher for local/dev environments
// Adds XP v2 audit columns to PeerReview if missing to prevent runtime P2022 errors
export async function patchPeerReviewV2Columns(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "PeerReview" ADD COLUMN IF NOT EXISTS "contentCategory" TEXT'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "PeerReview" ADD COLUMN IF NOT EXISTS "qualityTier" TEXT'
    )
  } catch (err) {
    // Non-fatal: if lacks privileges or already exists, continue
    console.warn('[prisma] PeerReview v2 column patch skipped:', err)
  }
}

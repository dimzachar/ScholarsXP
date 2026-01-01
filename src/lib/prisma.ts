// Suppress prisma:query debug logs
if (process.env.DEBUG?.includes('prisma')) {
  process.env.DEBUG = process.env.DEBUG
    .split(',')
    .filter((d) => !d.trim().startsWith('prisma:'))
    .join(',')
}

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

// Enforce lower connection limit in development to prevent pool exhaustion
// Also increase connect_timeout for cold-start scenarios
let finalDatabaseUrl = databaseUrl
if (process.env.NODE_ENV !== 'production' && finalDatabaseUrl.includes('pooler.supabase.com')) {
  try {
    const url = new URL(finalDatabaseUrl)
    url.searchParams.set('connection_limit', '10')
    url.searchParams.set('pool_timeout', '30')
    url.searchParams.set('connect_timeout', '30')
    finalDatabaseUrl = url.toString()
    console.info('[prisma] Enforced connection limit: 10, pool timeout: 30s, connect timeout: 30s')
  } catch (e) {
    console.warn('[prisma] Failed to parse database URL for connection limit adjustment')
  }
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
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: { url: finalDatabaseUrl }
    }
    // Configure connection pooling via DATABASE_URL parameters
    // The connection limit should be set in the DATABASE_URL itself
    // e.g., DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=10"
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Warm up the connection pool on first load to avoid cold-start timeouts
let connectionWarmedUp = false
export async function warmupConnection(): Promise<boolean> {
  if (connectionWarmedUp) return true
  
  const maxRetries = 3
  const retryDelay = 1000
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      connectionWarmedUp = true
      if (process.env.SUPPRESS_LOGS !== 'true') {
        console.info(`[prisma] Connection warmed up (attempt ${attempt})`)
      }
      return true
    } catch (err) {
      if (attempt < maxRetries) {
        console.warn(`[prisma] Connection warmup attempt ${attempt} failed, retrying...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
      } else {
        console.error('[prisma] Connection warmup failed after all retries:', err)
      }
    }
  }
  return false
}

// Auto-warmup in development (non-blocking)
if (process.env.NODE_ENV !== 'production' && !globalForPrisma.prisma) {
  warmupConnection().catch(() => {})
}

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
let patchApplied = false
export async function patchPeerReviewV2Columns(): Promise<void> {
  // Only run once per process to avoid repeated slow ALTER TABLE calls
  if (patchApplied) return
  patchApplied = true

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "PeerReview" ADD COLUMN IF NOT EXISTS "contentCategory" TEXT'
    )
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "PeerReview" ADD COLUMN IF NOT EXISTS "qualityTier" TEXT'
    )
  } catch (err) {
    // Non-fatal: if lacks privileges, timeout, or already exists, continue
    console.warn('[prisma] PeerReview v2 column patch skipped:', err)
  }
}

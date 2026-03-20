import { createServiceClient } from '@/lib/supabase-server'
import { detectPlatform, normalizeUrl, getWeekNumber, getWeekBoundaries } from '@/lib/utils'
import { canFeatureUrl } from '@/lib/embed-policy'
import { rankFeaturedWithOptions, type FeaturedInput, type ScoredFeatured, type RankerKind } from '@/lib/featured-ranker'
import { getRedditSummary } from '@/lib/reddit-summary'
import { getLinkPreviewLookup } from '@/lib/link-preview'
import { withQueryCache, QueryCache } from '@/lib/cache/query-cache'

export type FeaturedRange = 'week' | 'month' | 'all'
export type FeaturedCacheMode = 'default' | 'refresh' | 'bypass'

const FEATURED_CACHE_VERSION = 'v1'
const FEATURED_CACHE_TTL_SECONDS = 60 * 10
const FEATURED_RESOLUTION_BATCH_SIZE = 6

export type GetFeaturedOptions = {
  ranker?: RankerKind
  authorBoost?: boolean
  autoTune?: boolean
  cacheMode?: FeaturedCacheMode
}

export type FeaturedWarmRequest = {
  range: FeaturedRange
  limit: number
  options?: Omit<GetFeaturedOptions, 'cacheMode'>
}

const DEFAULT_FEATURED_WARM_REQUESTS: FeaturedWarmRequest[] = [
  { range: 'week', limit: 24, options: { ranker: 'enhanced', authorBoost: true, autoTune: false } },
  { range: 'month', limit: 24, options: { ranker: 'enhanced', authorBoost: true, autoTune: false } },
  { range: 'all', limit: 24, options: { ranker: 'enhanced', authorBoost: true, autoTune: false } },
]

export function getFeaturedCacheKey(
  range: FeaturedRange,
  limit = 24,
  opts?: Omit<GetFeaturedOptions, 'cacheMode'>
): string {
  const ranker = opts?.ranker || 'baseline'
  const authorBoost = opts?.authorBoost ?? false
  const autoTune = opts?.autoTune ?? false
  return `featured:${FEATURED_CACHE_VERSION}:default:${range}:${limit}:${ranker}:${authorBoost}:${autoTune}`
}

export async function invalidateFeaturedCache(): Promise<number> {
  return QueryCache.invalidatePattern(`featured:${FEATURED_CACHE_VERSION}:`)
}

export async function warmFeaturedCaches(requests: FeaturedWarmRequest[] = DEFAULT_FEATURED_WARM_REQUESTS): Promise<void> {
  await Promise.all(
    requests.map((request) =>
      getFeatured(request.range, request.limit, {
        ...request.options,
        cacheMode: 'refresh',
      })
    )
  )
}

function isSupported(url: string, platformHint?: string | null): boolean {
  if (platformHint === 'Twitter' || platformHint === 'Reddit' || platformHint === 'Medium') {
    return true
  }

  return canFeatureUrl(url)
}

function dedupeKey(url: string): string {
  const norm = normalizeUrl(url)
  const platform = detectPlatform(norm)
  try {
    const u = new URL(norm)
    if (platform === 'Twitter') {
      const m = u.pathname.match(/status\/(\d+)/)
      if (m?.[1]) return `tw:${m[1]}`
    }
    if (/youtu\.be|youtube\.com/.test(u.hostname)) {
      const v = u.searchParams.get('v') || u.pathname.replace(/^\//, '')
      if (v) return `yt:${v}`
    }
    if (platform === 'Reddit') {
      const m = u.pathname.match(/comments\/([a-z0-9]+)/i)
      if (m?.[1]) return `rd:${m[1]}`
    }
    return `${u.hostname}${u.pathname}`
  } catch {
    return norm
  }
}

async function isTweetAvailable(url: string): Promise<boolean> {
  try {
    let u = url
    try {
      const parsed = new URL(url)
      if (parsed.hostname.toLowerCase() === 'x.com') {
        parsed.hostname = 'twitter.com'
        u = parsed.toString()
      }
    } catch {}
    const api = `https://publish.twitter.com/oembed?url=${encodeURIComponent(u)}`
    const res = await fetch(api, { headers: { 'User-Agent': 'ScholarsXP/featured-check/1.0' } })
    if (res.status === 404 || res.status === 410) return false
    if (res.status === 401) return false
    if (res.status === 403) {
      // 403 is ambiguous (private, rate-limited, or geo/IP blocked). Treat as uncertain but allow.
      return true
    }
    return true
  } catch {
    return true
  }
}

export async function getFeatured(
  range: FeaturedRange,
  limit = 24,
  opts?: GetFeaturedOptions
): Promise<ScoredFeatured[]> {
  const cacheMode = opts?.cacheMode || 'default'
  const cacheKey = getFeaturedCacheKey(range, limit, opts)

  return withQueryCache(
    cacheKey,
    FEATURED_CACHE_TTL_SECONDS,
    () => getFeaturedUncached(range, limit, opts),
    {
      refreshCache: cacheMode === 'refresh',
      skipCache: cacheMode === 'bypass',
      logPerformance: false,
    }
  )
}

export async function getFeaturedUncached(
  range: FeaturedRange,
  limit = 24,
  opts?: Omit<GetFeaturedOptions, 'cacheMode'>
): Promise<ScoredFeatured[]> {
  const supabase = createServiceClient() as any

  const now = new Date()
  let startDate: Date | null = null
  
  if (range === 'week') {
    const currentWeek = getWeekNumber(now)
    const year = now.getFullYear()
    const boundaries = getWeekBoundaries(currentWeek, year)
    startDate = boundaries.startDate
    // Adjust for timezone - database seems to store local time, but we're comparing with UTC
    // Add the timezone offset to align with database storage
    const timezoneOffset = now.getTimezoneOffset() * 60000 // Convert to milliseconds
    startDate = new Date(startDate.getTime() - timezoneOffset)
  } else if (range === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    startDate.setHours(0, 0, 0, 0)
    // Adjust for timezone - database seems to store local time, but we're comparing with UTC
    const timezoneOffset = now.getTimezoneOffset() * 60000 // Convert to milliseconds
    startDate = new Date(startDate.getTime() - timezoneOffset)
  }

  // Fetch Submissions: finalized only; require finalXp
  let submissionsQuery = supabase
    .from('Submission')
    .select('id,url,platform,userId,finalXp,aiXp,peerXp,reviewCount,consensusScore,createdAt,status')
    .order('createdAt', { ascending: false })
    .limit(500) // cap raw set; we'll score and slice later

  if (startDate) {
    submissionsQuery = submissionsQuery.gte('createdAt', startDate.toISOString())
  }

  // Only finalized submissions
  submissionsQuery = submissionsQuery.eq('status', 'FINALIZED').not('finalXp', 'is', null)

  const { data: submissionsRaw, error: subErr } = await submissionsQuery
  if (subErr) {
    console.error('Featured: submission fetch error', subErr)
    console.error('Featured: Supabase error details:', {
      message: subErr.message,
      status: subErr.status,
      statusText: subErr.statusText,
      body: subErr.body
    })
  }

  const submissions: FeaturedInput[] = (submissionsRaw || [])
    .filter((r: any) => !!r?.url && isSupported(r.url, r.platform))
    .map((r: any) => ({
      id: r.id,
      url: r.url,
      platform: r.platform || null,
      userId: r.userId || null,
      authorKey: r.userId || null,
      createdAt: r.createdAt,
      reviewCount: r.reviewCount ?? null,
      consensusScore: r.consensusScore ?? null,
      aiXp: r.aiXp ?? null,
      peerXp: r.peerXp ?? null,
      finalXp: r.finalXp ?? null,
      origin: 'submission',
    }))

  // Fetch LegacySubmission within range when possible; all for all-time
  let legacyQuery = supabase
    .from('LegacySubmission')
    .select('id,url,submittedAt,importedAt,aiXp,peerXp,finalXp,discordHandle')
    .order('importedAt', { ascending: false })
    // .limit(50000)

  if (startDate) {
    // Filter by COALESCE(submittedAt, importedAt) >= startDate
    // Expressed via PostgREST OR with AND groups:
    // (submittedAt not null AND submittedAt >= startDate) OR (submittedAt is null AND importedAt >= startDate)
    const iso = startDate.toISOString()
    legacyQuery = legacyQuery.or(`and(submittedAt.not.is.null,submittedAt.gte.${iso}),and(submittedAt.is.null,importedAt.gte.${iso})`)
  }

  // Require finalXp present
  legacyQuery = legacyQuery.not('finalXp', 'is', null)

  const { data: legacyRaw, error: legacyErr } = await legacyQuery
  if (legacyErr) {
    console.error('Featured: legacy fetch error', legacyErr)
  }

  const legacy: FeaturedInput[] = (legacyRaw || [])
    .filter((r: any) => !!r?.url && isSupported(r.url))
    .map((r: any) => ({
      id: r.id,
      url: r.url,
      platform: detectPlatform(r.url) || null,
      userId: null,
      authorKey: r.discordHandle ? `legacy:${String(r.discordHandle).toLowerCase()}` : null,
      createdAt: r.submittedAt || r.importedAt,
      reviewCount: null,
      consensusScore: null,
      aiXp: r.aiXp ?? null,
      peerXp: r.peerXp ?? null,
      finalXp: r.finalXp ?? null,
      origin: 'legacy',
    }))

  const pickPreferredCandidate = (current: FeaturedInput, candidate: FeaturedInput): FeaturedInput => {
    const currentXp = current.finalXp ?? Number.NEGATIVE_INFINITY
    const candidateXp = candidate.finalXp ?? Number.NEGATIVE_INFINITY
    if (candidateXp > currentXp) return candidate
    if (candidateXp < currentXp) return current

    const toTimestamp = (iso: string): number => {
      const t = new Date(iso).getTime()
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
    }

    const currentTs = toTimestamp(current.createdAt)
    const candidateTs = toTimestamp(candidate.createdAt)
    if (candidateTs > currentTs) return candidate
    if (candidateTs < currentTs) return current

    const currentHasUser = Boolean(current.userId)
    const candidateHasUser = Boolean(candidate.userId)
    if (candidateHasUser !== currentHasUser) {
      return candidateHasUser ? candidate : current
    }

    if (candidate.origin !== current.origin) {
      return candidate.origin === 'submission' ? candidate : current
    }

    return current
  }

  // Merge, dedupe by content key while preferring higher quality/recent candidates
  const mergedOrder: string[] = []
  const mergedByKey = new Map<string, FeaturedInput>()
  for (const item of [...submissions, ...legacy]) {
    const key = dedupeKey(item.url)
    const existing = mergedByKey.get(key)
    if (!existing) {
      mergedByKey.set(key, item)
      mergedOrder.push(key)
      continue
    }

    const preferred = pickPreferredCandidate(existing, item)
    if (preferred === existing) {
      // if (DEBUG_AUTHOR && isDebug(item)) {
      //   console.log('[FeaturedDebug] deduped out by key', { id: item.id, key, url: item.url, authorKey: item.authorKey })
      // }
      continue
    }

    mergedByKey.set(key, preferred)
    // if (DEBUG_AUTHOR && (isDebug(item) || isDebug(existing))) {
    //   console.log('[FeaturedDebug] dedupe replaced entry', {
    //     key,
    //     replacedId: existing.id,
    //     keptId: preferred.id,
    //     keptAuthorKey: preferred.authorKey,
    //   })
    // }
  }

  const merged: FeaturedInput[] = mergedOrder
    .map((key) => mergedByKey.get(key))
    .filter((it): it is FeaturedInput => Boolean(it))

  const ranked = rankFeaturedWithOptions(merged, range, 1, 6, { ranker: opts?.ranker, authorBoost: opts?.authorBoost, autoTune: opts?.autoTune }) as (ScoredFeatured & { breakdown?: any })[]

  // Server-side filter: exclude Reddit posts that are removed/unavailable.
  // To avoid heavy network calls, evaluate in order until we collect `limit` items.
  const result: ScoredFeatured[] = []
  for (let offset = 0; offset < ranked.length && result.length < limit; offset += FEATURED_RESOLUTION_BATCH_SIZE) {
    const batch = ranked.slice(offset, offset + FEATURED_RESOLUTION_BATCH_SIZE)
    const resolvedBatch = await Promise.all(batch.map((item) => resolveFeaturedItem(item)))

    for (const resolvedItem of resolvedBatch) {
      if (!resolvedItem) continue
      result.push(resolvedItem)
      if (result.length >= limit) {
        break
      }
    }
  }

  return result
}

async function resolveFeaturedItem(item: ScoredFeatured): Promise<ScoredFeatured | null> {
  const platform = item.platform || detectPlatform(item.url)

  if (platform === 'Reddit') {
    try {
      const summary = await getRedditSummary(item.url)
      if (summary?.removed) {
        return null
      }
    } catch {}

    return item
  }

  if (platform === 'Twitter') {
    try {
      const ok = await isTweetAvailable(item.url)
      return ok ? item : null
    } catch {
      return item
    }
  }

  if (platform === 'Medium') {
    try {
      const lookup = await getLinkPreviewLookup(item.url)
      if (lookup.unavailable || !lookup.resolved) {
        return null
      }

      return {
        ...item,
        preview: lookup.preview,
      }
    } catch {
      return null
    }
  }

  return item
}

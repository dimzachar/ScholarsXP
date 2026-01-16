import { createServiceClient } from '@/lib/supabase-server'
import { detectPlatform, normalizeUrl, getWeekNumber, getWeekBoundaries } from '@/lib/utils'
import { canFeatureUrl } from '@/lib/embed-policy'
import { rankFeaturedWithOptions, type FeaturedInput, type ScoredFeatured, type RankerKind } from '@/lib/featured-ranker'
import { getRedditSummary } from '@/lib/reddit-summary'

export type FeaturedRange = 'week' | 'month' | 'all'

function isSupported(url: string): boolean {
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
  opts?: { ranker?: RankerKind; authorBoost?: boolean; autoTune?: boolean }
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
    console.log('Featured: week range - currentWeek:', currentWeek, 'year:', year, 'startDate:', startDate?.toISOString(), 'timezoneOffset:', timezoneOffset/3600000, 'hours')
    
    // Debug: Log the actual query parameters
    console.log('Featured: Query parameters - startDate ISO:', startDate?.toISOString())
  } else if (range === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    startDate.setHours(0, 0, 0, 0)
    // Adjust for timezone - database seems to store local time, but we're comparing with UTC
    const timezoneOffset = now.getTimezoneOffset() * 60000 // Convert to milliseconds
    startDate = new Date(startDate.getTime() - timezoneOffset)
    console.log('Featured: month range - startDate:', startDate?.toISOString(), 'timezoneOffset:', timezoneOffset/3600000, 'hours')
  }

  // Fetch Submissions: finalized only; require finalXp
  console.log('Featured: Building Supabase query with parameters:')
  console.log('  - Table: Submission')
  console.log('  - Select: id,url,platform,userId,finalXp,aiXp,peerXp,reviewCount,consensusScore,createdAt,status')
  console.log('  - Order: createdAt DESC')
  console.log('  - Limit: 500')
  console.log('  - startDate:', startDate?.toISOString())
  
  let submissionsQuery = supabase
    .from('Submission')
    .select('id,url,platform,userId,finalXp,aiXp,peerXp,reviewCount,consensusScore,createdAt,status')
    .order('createdAt', { ascending: false })
    .limit(500) // cap raw set; we'll score and slice later

  if (startDate) {
    console.log('  - Adding filter: createdAt >=', startDate.toISOString())
    submissionsQuery = submissionsQuery.gte('createdAt', startDate.toISOString())
  }

  // Only finalized submissions
  console.log('  - Adding filter: status = FINALIZED')
  console.log('  - Adding filter: finalXp is not null')
  submissionsQuery = submissionsQuery.eq('status', 'FINALIZED').not('finalXp', 'is', null)

  console.log('Featured: Executing Supabase query for range:', range, 'with startDate:', startDate?.toISOString())
  const { data: submissionsRaw, error: subErr } = await submissionsQuery
  if (subErr) {
    console.error('Featured: submission fetch error', subErr)
    console.error('Featured: Supabase error details:', {
      message: subErr.message,
      status: subErr.status,
      statusText: subErr.statusText,
      body: subErr.body
    })
  } else {
    console.log('Featured: submissions fetched:', submissionsRaw?.length || 0, 'items')
    if (submissionsRaw && submissionsRaw.length > 0) {
      console.log('Featured: First submission example:', {
        id: submissionsRaw[0]?.id,
        url: submissionsRaw[0]?.url,
        createdAt: submissionsRaw[0]?.createdAt,
        status: submissionsRaw[0]?.status,
        finalXp: submissionsRaw[0]?.finalXp
      })
    }
  }

  const submissions: FeaturedInput[] = (submissionsRaw || [])
    .filter((r: any) => !!r?.url && isSupported(r.url))
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

  // Debug diagnostics: trace specific author through stages when env is set
  const DEBUG_AUTHOR_RAW = process.env.FEATURED_DEBUG_AUTHOR || ''
  const DEBUG_AUTHOR = DEBUG_AUTHOR_RAW.toLowerCase()
  // Try to resolve DEBUG_AUTHOR to userId(s) via User table (matches username or discordHandle)
  const debugUserIds = new Set<string>()
  if (DEBUG_AUTHOR) {
    // If looks like UUID, use directly
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRe.test(DEBUG_AUTHOR_RAW)) {
      debugUserIds.add(DEBUG_AUTHOR_RAW)
    } else {
      try {
        const pattern = `%${DEBUG_AUTHOR_RAW}%`
        const { data: usersMatch, error: usersErr } = await supabase
          .from('User')
          .select('id,username,discordHandle')
          .or(`username.ilike.${pattern},discordHandle.ilike.${pattern}`)

        if (!usersErr && Array.isArray(usersMatch)) {
          for (const u of usersMatch) {
            if (u?.id) debugUserIds.add(String(u.id))
          }
          console.log('[FeaturedDebug] matched User ids for', DEBUG_AUTHOR_RAW, Array.from(debugUserIds))
        }
      } catch (e) {
        console.log('[FeaturedDebug] user lookup failed', e)
      }
    }
  }
  const isDebug = (it: FeaturedInput): boolean => {
    if (!DEBUG_AUTHOR) return false
    const parts = [it.authorKey, it.userId, it.id, it.url]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase())
    if (parts.some((p) => p.includes(DEBUG_AUTHOR))) return true
    if (it.userId && debugUserIds.has(String(it.userId))) return true
    return false
  }
  if (DEBUG_AUTHOR) {
    const dbg = submissions.filter(isDebug)
    if (dbg.length) {
      console.log('[FeaturedDebug] submissions matched', DEBUG_AUTHOR, dbg.map(d => ({ id: d.id, authorKey: d.authorKey, userId: d.userId, url: d.url, finalXp: d.finalXp, reviews: d.reviewCount, createdAt: d.createdAt })))
    } else {
      console.log('[FeaturedDebug] submissions matched', DEBUG_AUTHOR, '0 items')
    }
  }

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
  if (DEBUG_AUTHOR) {
    const dbg = legacy.filter(isDebug)
    if (dbg.length) {
      console.log('[FeaturedDebug] legacy matched', DEBUG_AUTHOR, dbg.map(d => ({ id: d.id, authorKey: d.authorKey, url: d.url, finalXp: d.finalXp, createdAt: d.createdAt })))
    } else {
      console.log('[FeaturedDebug] legacy matched', DEBUG_AUTHOR, '0 items')
    }
  }

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
  if (DEBUG_AUTHOR) {
    const dbg = merged.filter(isDebug)
    console.log('[FeaturedDebug] merged matched', DEBUG_AUTHOR, dbg.length)
  }

  const ranked = rankFeaturedWithOptions(merged, range, 1, 6, { ranker: opts?.ranker, authorBoost: opts?.authorBoost, autoTune: opts?.autoTune }) as (ScoredFeatured & { breakdown?: any })[]
  
  // For enhanced ranker, ensure breakdown data is preserved
  if (opts?.ranker === 'enhanced' && range !== 'all') {
    // The enhanced ranker returns items with breakdown property, but we need to make sure it's preserved
    // through the ranking process. This is handled in the enhanced ranker implementation.
    // console.log('[FeaturedService] Enhanced ranking used, breakdown data preserved for', ranked.length, 'items')
  }
  if (DEBUG_AUTHOR) {
    const dbg = ranked.filter(isDebug)
    console.log('[FeaturedDebug] ranked (before availability) matched', DEBUG_AUTHOR, dbg.length)
  }

  // Server-side filter: exclude Reddit posts that are removed/unavailable.
  // To avoid heavy network calls, evaluate in order until we collect `limit` items.
  const result: ScoredFeatured[] = []
  for (const item of ranked) {
    if (result.length >= limit) break
    const platform = item.platform || detectPlatform(item.url)
    if (platform === 'Reddit') {
      try {
        const summary = await getRedditSummary(item.url)
        if (summary?.removed) {
          if (DEBUG_AUTHOR && isDebug(item)) {
            console.log('[FeaturedDebug] filtered removed Reddit post', { id: item.id, url: item.url })
          }
          continue
        }
      } catch (err) {
        if (DEBUG_AUTHOR && isDebug(item)) {
          console.log('[FeaturedDebug] reddit summary failed, allowing item', { id: item.id, url: item.url, error: String(err) })
        }
      }
      result.push(item)
      continue
    }

    if (platform === 'Twitter') {
      try {
        const ok = await isTweetAvailable(item.url)
        if (ok) {
          result.push(item)
        } else {
          if (DEBUG_AUTHOR && isDebug(item)) {
            console.log('[FeaturedDebug] twitter availability check failed', { id: item.id, url: item.url })
          }
        }
      } catch (err) {
        if (DEBUG_AUTHOR && isDebug(item)) {
          console.log('[FeaturedDebug] twitter availability error, allowing item', { id: item.id, url: item.url, error: String(err) })
        }
        result.push(item)
      }
      continue
    }

    // Other platforms: include as-is
    result.push(item)
  }

  if (DEBUG_AUTHOR) {
    const dbg = result.filter(isDebug)
    console.log('[FeaturedDebug] final result matched', DEBUG_AUTHOR, dbg.length)
    if (!dbg.length) {
      console.log('[FeaturedDebug] Note: final exclusions may be from Reddit/Twitter availability checks or per-author/platform caps in ranker.')
    }
  }

  return result
}

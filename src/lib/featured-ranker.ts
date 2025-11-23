import { rankFeaturedEnhanced } from './featured-ranker-enhanced'
import type { EnhancedScoreBreakdown } from './featured-ranker-enhanced'

type Range = 'week' | 'month' | 'all'

export type FeaturedInput = {
  id: string
  url: string
  platform?: string | null
  userId?: string | null
  authorKey?: string | null
  createdAt: string // ISO
  reviewCount?: number | null
  consensusScore?: number | null
  aiXp?: number | null
  peerXp?: number | null
  finalXp?: number | null
  origin: 'submission' | 'legacy'
}

export type ScoredFeatured = FeaturedInput & {
  score: number
}

// Extended type for enhanced ranking with breakdown
export type ScoredFeaturedWithBreakdown = FeaturedInput & {
  score: number
  breakdown: EnhancedScoreBreakdown
}

function ageDays(iso: string): number {
  const created = new Date(iso).getTime()
  const now = Date.now()
  return Math.max(0, (now - created) / (1000 * 60 * 60 * 24))
}

/**
 * Compute a composite score for ranking featured items.
 * Conservative weights to avoid extreme swings with small samples.
 */
export function computeFeaturedScore(item: FeaturedInput, range: Range): number {
  // Always rely on finalized XP only (peer-driven). If missing, treat as 0.
  const base = item.finalXp ?? 0

  const reviews = item.reviewCount ?? 0
  const reviewFactor = Math.log1p(Math.max(0, reviews)) // 0..~

  const consensus = item.consensusScore ?? 0
  const consensusBonus = Math.max(0, consensus) * 2 // small stabilizer

  const age = ageDays(item.createdAt)
  const halfLifeDays = range === 'week' ? 7 : range === 'month' ? 21 : 365 // minimal decay for all-time
  const decay = Math.exp(-age / halfLifeDays)

  // Neutralize platform bias; handle diversity via caps instead
  const platformBoost = 1

  const raw = (base + consensusBonus) * (1 + 0.3 * reviewFactor)
  const scored = Math.max(0, raw) * decay * platformBoost
  return scored
}

export type FeaturedScoreBreakdown = {
  base: number
  consensus: number
  consensusBonus: number
  reviews: number
  reviewFactor: number
  ageDays: number
  halfLifeDays: number
  decay: number
  raw: number
  score: number
}

export function computeFeaturedScoreBreakdown(item: FeaturedInput, range: Range): FeaturedScoreBreakdown {
  const base = item.finalXp ?? 0
  const reviews = Math.max(0, item.reviewCount ?? 0)
  const reviewFactor = Math.log1p(reviews)
  const consensus = item.consensusScore ?? 0
  const consensusBonus = Math.max(0, consensus) * 2
  const age = ageDays(item.createdAt)
  const halfLifeDays = range === 'week' ? 7 : range === 'month' ? 21 : 365
  const decay = Math.exp(-age / halfLifeDays)
  const raw = (base + consensusBonus) * (1 + 0.3 * reviewFactor)
  const score = Math.max(0, raw) * decay
  return {
    base,
    consensus,
    consensusBonus,
    reviews,
    reviewFactor,
    ageDays: age,
    halfLifeDays,
    decay,
    raw,
    score,
  }
}

export function meetsMinimumThreshold(item: FeaturedInput, range: Range): boolean {
  const reviews = item.reviewCount ?? 0
  if (range === 'week') return reviews >= 3 && item.origin === 'submission'
  if (range === 'month') return reviews >= 3 && item.origin === 'submission'
  return true // All-time includes both regular and legacy submissions
}

export function rankFeatured(items: FeaturedInput[], range: Range, perAuthorCap = 1, perPlatformCap: number = Number.POSITIVE_INFINITY): ScoredFeatured[] {
  return rankFeaturedWithOptions(items, range, perAuthorCap, perPlatformCap)
}

export type RankerKind = 'baseline' | 'eb' | 'zscore' | 'conf' | 'enhanced'

export type RankerOptions = {
  ranker?: RankerKind
  authorBoost?: boolean
  autoTune?: boolean
}

// Optional diagnostics controlled by env vars.
// FEATURED_DEBUG_AUTHOR: substring of authorKey/userId/url/id
// FEATURED_DEBUG_USER_ID: exact userId (UUID) to match
const DEBUG_AUTHOR = (process.env.FEATURED_DEBUG_AUTHOR || '').toLowerCase()
const DEBUG_USER_ID = (process.env.FEATURED_DEBUG_USER_ID || '').toLowerCase()
function isDebugItem(it: FeaturedInput): boolean {
  if (!DEBUG_AUTHOR) return false
  const parts = [it.authorKey, it.userId, it.id, it.url]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
  if (parts.some((p) => p.includes(DEBUG_AUTHOR))) return true
  if (DEBUG_USER_ID && String(it.userId || '').toLowerCase() === DEBUG_USER_ID) return true
  return false
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const i = Math.floor((s.length - 1) * Math.min(1, Math.max(0, p)))
  return s[i]
}

function winsorize(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

export function computeAuthorMultipliers(
  items: FeaturedInput[],
  now = new Date(),
  params = { w1: 0.5, w2: 0.3, w3: 0.2, lambda: 0.2 }
): Map<string, number> {
  const byAuthor = new Map<string, { countRange: number; count30d: number; avgXpRange: number }>()
  const cutoff30 = new Date(now.getTime() - 30 * 86400000)
  for (const it of items) {
    const key = it.authorKey || it.userId || `legacy:${it.id}`
    const st = byAuthor.get(key) || { countRange: 0, count30d: 0, avgXpRange: 0 }
    st.countRange += 1
    if (new Date(it.createdAt) >= cutoff30) st.count30d += 1
    const xp = it.finalXp ?? 0
    st.avgXpRange = st.avgXpRange + (xp - st.avgXpRange) / st.countRange
    byAuthor.set(key, st)
  }
  const valsR: number[] = []
  const valsD: number[] = []
  const valsXp: number[] = []
  for (const st of byAuthor.values()) {
    valsR.push(st.countRange)
    valsD.push(st.count30d)
    valsXp.push(st.avgXpRange)
  }
  const p95R = percentile(valsR, 0.95) || 1
  const p95D = percentile(valsD, 0.95) || 1
  const p95Xp = percentile(valsXp, 0.95) || 1
  const mult = new Map<string, number>()
  for (const [key, st] of byAuthor.entries()) {
    const normR = Math.min(1, st.countRange / (p95R || 1))
    const normD = Math.min(1, st.count30d / (p95D || 1))
    const normXp = Math.min(1, st.avgXpRange / (p95Xp || 1))
    const authorScore = params.w1 * normR + params.w2 * normD + params.w3 * normXp
    mult.set(key, 1 + params.lambda * Math.max(0, Math.min(1, authorScore)))
  }
  return mult
}

export function computeFeaturedScoreEB(
  item: FeaturedInput,
  range: Range,
  stats: { meanXp: number; p1: number; p99: number },
  params: { kBase: number; kLegacy: number; gamma: number; beta: number; rcap: number; HL: number; c: number }
): number {
  const n = Math.max(0, item.reviewCount ?? 0)
  const k = (item.origin === 'legacy' || n === 0) ? params.kLegacy : params.kBase
  const alpha = n / (n + k)
  const base = winsorize(item.finalXp ?? 0, stats.p1, stats.p99)
  const finalXpAdj = alpha * base + (1 - alpha) * stats.meanXp
  const consensusRaw = item.consensusScore ?? 0
  const consensus = Math.max(-params.c, Math.min(params.c, consensusRaw))
  const consBonus = params.gamma * consensus
  const reviewsMult = 1 + params.beta * Math.min(Math.log1p(n), params.rcap)
  const age = ageDays(item.createdAt)
  const decay = Math.exp(-age / params.HL)
  const raw = Math.max(0, finalXpAdj + consBonus) * reviewsMult
  return raw * decay
}

function median(arr: number[]): number { if (!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const mid=Math.floor(s.length/2); return s.length%2? s[mid] : (s[mid-1]+s[mid])/2 }
function mad(arr: number[], med: number): number { if (!arr.length) return 0; const dev=arr.map(x=>Math.abs(x-med)); return median(dev) }
function ageHours(iso: string): number { const t=new Date(iso).getTime(); return Math.max(0, (Date.now()-t)/3600000) }

export function computeFeaturedScoreZScore(
  item: FeaturedInput,
  range: Range,
  stats: { medianXp: number; madXp: number },
  params: { beta: number; gamma: number; c: number; tau: number }
): number {
  const base = item.finalXp ?? 0
  const z = (base - stats.medianXp) / (1.4826 * (stats.madXp || 1e-6))
  const n = Math.max(0, item.reviewCount ?? 0)
  const reviewsMult = 1 + params.beta * Math.log1p(n)
  const cons = Math.max(-params.c, Math.min(params.c, item.consensusScore ?? 0))
  const consMult = 1 + params.gamma * (cons / (params.c || 1))
  const hotness = Math.max(0, z) * consMult * reviewsMult
  const ageH = ageHours(item.createdAt)
  const score = hotness / Math.pow(ageH + 2, params.tau)
  return score
}

export function computeFeaturedScoreConfidence(
  item: FeaturedInput,
  range: Range,
  stats: { meanXp: number },
  params: { nCap: number; gamma: number; HL: number; c: number }
): number {
  const n = Math.max(0, item.reviewCount ?? 0)
  const conf = Math.min(1, n / Math.max(1, params.nCap))
  const base = item.finalXp ?? 0
  const xpConf = conf * base + (1 - conf) * stats.meanXp
  const cons = Math.max(-params.c, Math.min(params.c, item.consensusScore ?? 0))
  const consAdj = params.gamma * conf * cons
  const age = ageDays(item.createdAt)
  const decay = Math.exp(-age / params.HL)
  return Math.max(0, xpConf + consAdj) * decay
}

export function rankFeaturedWithOptions(
  items: FeaturedInput[], 
  range: Range, 
  perAuthorCap = 1,
  perPlatformCap: number = Number.POSITIVE_INFINITY,
  options: RankerOptions = {}
): ScoredFeatured[] {
  // Default to EB with author boost if not specified
  const ranker: RankerKind = options.ranker || 'eb'
  const authorBoost = options.authorBoost ?? true
  
  // Use enhanced ranking for week and month if requested
  if (ranker === 'enhanced' && (range === 'week' || range === 'month')) {
    const enhancedResults = rankFeaturedEnhanced(items, range, perAuthorCap, perPlatformCap)
    // Enhanced results already include breakdown, just cast to ensure type compatibility
    return enhancedResults as ScoredFeatured[]
  }
  
  const eligible = items.filter((it) => meetsMinimumThreshold(it, range))
  if (DEBUG_AUTHOR) {
    const dbgAll = items.filter(isDebugItem)
    const dbgElig = eligible.filter(isDebugItem)
    if (dbgAll.length && dbgElig.length !== dbgAll.length) {
      const excluded = dbgAll.filter((x) => !dbgElig.includes(x))
      console.log('[FeaturedDebug] excluded by threshold', excluded.map(e => ({ id: e.id, url: e.url, origin: e.origin, reviews: e.reviewCount, createdAt: e.createdAt })))
    }
  }

  // Precompute stats for EB if needed
  let stats: { meanXp: number; p1: number; p99: number } | null = null
  let robust: { medianXp: number; madXp: number } | null = null
  const xs = eligible.map((it) => (it.finalXp ?? 0))
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
  if (ranker === 'eb' || ranker === 'conf') {
    const p1 = percentile(xs, 0.01)
    const p99 = percentile(xs, 0.99)
    stats = { meanXp: mean, p1, p99 }
  }
  if (ranker === 'zscore') {
    robust = { medianXp: median(xs), madXp: mad(xs, median(xs)) }
  }

  // Author multipliers
  const multipliers = authorBoost ? computeAuthorMultipliers(eligible) : new Map<string, number>()

  const scored: ScoredFeatured[] = []
  for (const it of eligible) {
    let score = 0
    if (ranker === 'eb' && stats) {
      // Auto-tune from current eligible set if requested
      const ns = eligible.map((e) => Math.max(0, e.reviewCount ?? 0))
      const p50n = percentile(ns, 0.5)
      const p95n = percentile(ns, 0.95)
      const kBase = options.autoTune ? Math.min(10, Math.max(4, Math.round(p50n + 1))) : (range === 'week' ? 5 : range === 'month' ? 6 : 8)
      const kLegacy = options.autoTune ? Math.min(12, kBase + 3) : (range === 'week' ? 8 : range === 'month' ? 10 : 12)
      const beta = options.autoTune ? (p95n > 10 ? 0.3 : p95n > 5 ? 0.25 : 0.2) : (range === 'all' ? 0.15 : 0.25)
      const rcap = options.autoTune ? Math.min(2.7, Math.max(1.8, Math.log1p(p95n))) : (range === 'week' ? 2.3 : range === 'month' ? 2.5 : 2.0)
      const HL = range === 'week' ? 5 : range === 'month' ? 14 : 180
      const gamma = (range === 'month') ? 1.2 : 1.0
      const c = 5
      score = computeFeaturedScoreEB(it, range, stats, { kBase, kLegacy, gamma, beta, rcap, HL, c })
    } else if (ranker === 'zscore' && robust) {
      const params = range === 'week'
        ? { beta: 0.25, gamma: 0.2, c: 5, tau: 1.5 }
        : range === 'month'
        ? { beta: 0.25, gamma: 0.25, c: 5, tau: 1.6 }
        : { beta: 0.2, gamma: 0.2, c: 5, tau: 1.7 }
      score = computeFeaturedScoreZScore(it, range, robust, params)
    } else if (ranker === 'conf' && stats) {
      const params = range === 'week'
        ? { nCap: 12, gamma: 1.0, HL: 5, c: 5 }
        : range === 'month'
        ? { nCap: 15, gamma: 1.2, HL: 14, c: 5 }
        : { nCap: 20, gamma: 1.0, HL: 180, c: 5 }
      score = computeFeaturedScoreConfidence(it, range, { meanXp: mean }, params)
    } else {
      score = computeFeaturedScore(it, range)
    }
    const aKey = it.authorKey || it.userId || `legacy:${it.id}`
    const mult = multipliers.get(aKey) ?? 1
    score *= mult
    if (!isFinite(score) || score <= 0) {
      if (DEBUG_AUTHOR && isDebugItem(it)) {
        console.log('[FeaturedDebug] skipped non-positive score', { id: it.id, url: it.url, base: it.finalXp ?? 0, reviews: it.reviewCount ?? 0, consensus: it.consensusScore ?? 0, mult })
      }
      continue
    }
    if (DEBUG_AUTHOR && isDebugItem(it)) {
      console.log('[FeaturedDebug] scored', { id: it.id, score: Number(score.toFixed(3)), url: it.url, mult })
    }
    scored.push({ ...it, score })
  }

  scored.sort((a, b) => (b.score - a.score) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))

  const authorCounts = new Map<string, number>()
  const platformCounts = new Map<string, number>()
  const filtered: ScoredFeatured[] = []
  for (const s of scored) {
    const aKey = s.authorKey || s.userId || `legacy:${s.id}`
    const pKey = (s.platform || 'unknown').toLowerCase()
    const aUsed = authorCounts.get(aKey) || 0
    const pUsed = platformCounts.get(pKey) || 0
    if (aUsed >= perAuthorCap) {
      if (DEBUG_AUTHOR && isDebugItem(s)) {
        console.log('[FeaturedDebug] capped by perAuthorCap', { id: s.id, aKey, aUsed, perAuthorCap })
      }
      continue
    }
    if (pUsed >= perPlatformCap) {
      if (DEBUG_AUTHOR && isDebugItem(s)) {
        console.log('[FeaturedDebug] capped by perPlatformCap', { id: s.id, pKey, pUsed, perPlatformCap })
      }
      continue
    }
    filtered.push(s)
    authorCounts.set(aKey, aUsed + 1)
    platformCounts.set(pKey, pUsed + 1)
  }

  return filtered
}

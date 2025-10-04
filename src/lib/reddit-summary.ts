export type RedditSummary = {
  title?: string
  author?: string
  subreddit?: string
  score?: number
  num_comments?: number
  created_utc?: number
  selftext?: string
  thumbnail?: string
  permalink?: string
  url?: string
  over_18?: boolean
  removed?: boolean
}

import { sharedMemoryCache } from '@/lib/memory-cache'

function normalizeHost(u: URL) {
  if (/^(old|m)\.reddit\.com$/i.test(u.hostname)) {
    u.hostname = 'www.reddit.com'
  }
  if (/^reddit\.com$/i.test(u.hostname)) {
    u.hostname = 'www.reddit.com'
  }
}

function isCommentsPath(pathname: string) {
  return /\/comments\//.test(pathname)
}

export function buildJsonUrlFromCanonical(canonical: string): string | null {
  try {
    const u = new URL(canonical)
    normalizeHost(u)
    if (!isCommentsPath(u.pathname)) return null

    const idMatch = u.pathname.match(/\/comments\/([a-z0-9]+)/i)
    const postId = idMatch?.[1]
    if (!postId) return null

    const base = `${u.protocol}//${u.host}`
    const jsonUrl = new URL(`/comments/${postId}.json`, base)

    const search = new URLSearchParams()
    const raw = u.searchParams
    for (const [key, value] of raw.entries()) {
      if (/^(utm_|fbclid|gclid|campaign$)/i.test(key)) continue
      search.append(key, value)
    }
    search.set('raw_json', '1')
    jsonUrl.search = search.toString()
    return jsonUrl.toString()
  } catch {
    return null
  }
}

const DEFAULT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'ScholarsXP/featured-embed/1.0'

type OAuthTokenCache = {
  token: string
  expires: number
}

let oauthTokenCache: OAuthTokenCache | null = null
let oauthTokenPromise: Promise<string | null> | null = null

function shouldRetryWithOAuth(status: number): boolean {
  return status === 401 || status === 403 || status === 429
}

function toOAuthJsonUrl(jurl: string): string | null {
  try {
    const u = new URL(jurl)
    u.hostname = 'oauth.reddit.com'
    return u.toString()
  } catch {
    return null
  }
}

function markTokenStale() {
  oauthTokenCache = null
}

async function requestNewOAuthToken(signal?: AbortSignal): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'read' })
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      body: body.toString(),
      cache: 'no-store',
      redirect: 'follow',
      signal,
    })
    if (!res.ok) {
      return null
    }
    const json = await res.json().catch(() => null)
    const token = typeof json?.access_token === 'string' ? json.access_token : null
    if (!token) return null
    const expiresIn = Number(json?.expires_in) || 3600
    oauthTokenCache = {
      token,
      expires: Date.now() + Math.max(0, (expiresIn - 60) * 1000),
    }
    return token
  } catch {
    return null
  }
}

async function getRedditOAuthToken(signal?: AbortSignal): Promise<string | null> {
  const now = Date.now()
  if (oauthTokenCache && oauthTokenCache.expires > now + 5000) {
    return oauthTokenCache.token
  }
  if (!oauthTokenPromise) {
    oauthTokenPromise = requestNewOAuthToken(signal)
  }
  try {
    const token = await oauthTokenPromise
    if (!token) {
      markTokenStale()
    }
    return token
  } finally {
    oauthTokenPromise = null
  }
}

function buildSummaryFromPost(post: any): RedditSummary {
  const removed = Boolean(post?.removed_by_category || post?.removed || post?.selftext?.includes('[removed]') || post?.author === '[deleted]')

  let previewUrl: string | undefined
  try {
    const src = post?.preview?.images?.[0]?.source?.url as string | undefined
    if (typeof src === 'string') previewUrl = src
    if (!previewUrl && post?.gallery_data && post?.media_metadata) {
      const firstId = post.gallery_data.items?.[0]?.media_id
      const meta = firstId && post.media_metadata[firstId]
      const gallerySrc = meta?.s?.u || meta?.s?.gif || meta?.s?.mp4
      if (typeof gallerySrc === 'string') previewUrl = gallerySrc
    }
  } catch {
    // ignore
  }

  if (!previewUrl && typeof post?.thumbnail === 'string' && post.thumbnail?.startsWith('http')) {
    previewUrl = post.thumbnail
  }
  if (previewUrl) {
    previewUrl = previewUrl.replace(/&amp;/g, '&')
  }

  let permalink: string | undefined = post?.permalink
  if (permalink && !permalink.startsWith('/')) {
    try {
      const purl = new URL(permalink)
      permalink = purl.pathname + purl.search + purl.hash
    } catch {
      // keep as-is
    }
  }

  return {
    title: post?.title,
    author: post?.author,
    subreddit: post?.subreddit,
    score: post?.score,
    num_comments: post?.num_comments,
    created_utc: post?.created_utc,
    selftext: post?.selftext,
    thumbnail: previewUrl,
    permalink,
    url: post?.url,
    over_18: Boolean(post?.over_18),
    removed,
  }
}

async function parseRedditSummaryResponse(res: Response): Promise<RedditSummary | null> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return null
  }
  const data = await res.json().catch(() => null)
  const post = Array.isArray(data) && data[0]?.data?.children?.[0]?.data
  if (!post) {
    return null
  }
  return buildSummaryFromPost(post)
}

async function fetchSummaryViaOAuth(jurl: string, signal?: AbortSignal): Promise<RedditSummary | null> {
  const oauthUrl = toOAuthJsonUrl(jurl)
  if (!oauthUrl) return null
  const token = await getRedditOAuthToken(signal)
  if (!token) return null
  try {
    const res = await fetch(oauthUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
      next: { revalidate: Number(process.env.REDDIT_JSON_REVALIDATE || 300) },
      redirect: 'follow',
      cache: 'no-store',
      signal,
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        markTokenStale()
      }
      if ([404, 410, 451].includes(res.status)) {
        return { removed: true }
      }
      return null
    }
    return await parseRedditSummaryResponse(res)
  } catch {
    return null
  }
}

async function resolveCanonical(input: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const u = new URL(input)
    normalizeHost(u)
    if (!isCommentsPath(u.pathname) || /\/s\//.test(u.pathname) || u.hostname === 'redd.it') {
      const res = await fetch(u.toString(), {
        redirect: 'follow',
        // Let Next.js cache redirects for a short window
        next: { revalidate: Number(process.env.REDDIT_REDIRECT_REVALIDATE || 300) },
        headers: {
          'User-Agent': DEFAULT_USER_AGENT
        },
        signal,
      })
      if (res?.url) {
        return res.url
      }
    }
    return u.toString()
  } catch {
    return null
  }
}

async function fetchSummaryFromJsonUrl(jurl: string, signal?: AbortSignal): Promise<RedditSummary | null> {
  const res = await fetch(jurl, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json'
    },
    // Allow Next.js data cache with revalidation to dedupe repeated calls
    next: { revalidate: Number(process.env.REDDIT_JSON_REVALIDATE || 300) },
    redirect: 'follow',
    cache: 'no-store',
    signal,
  })
  if (!res.ok) {
    if ([404, 410, 451].includes(res.status)) {
      return { removed: true }
    }
    if (shouldRetryWithOAuth(res.status)) {
      const fallback = await fetchSummaryViaOAuth(jurl, signal)
      if (fallback) {
        return fallback
      }
    }
    return null
  }
  return await parseRedditSummaryResponse(res)
}

export async function getRedditSummary(inputUrl: string, timeoutMs = 6000): Promise<RedditSummary | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const canonical = await resolveCanonical(inputUrl, controller.signal)
    const jsonUrl = canonical && buildJsonUrlFromCanonical(canonical)
    if (!jsonUrl) return null
    // Memory cache by JSON URL (canonical across variants)
    const ttlSec = Number(process.env.REDDIT_SUMMARY_CACHE_TTL || 600)
    const ttlMs = Math.max(0, ttlSec * 1000)
    const cacheKey = `reddit:summary:${jsonUrl}`
    const cached = sharedMemoryCache.get(cacheKey) as RedditSummary | null | undefined
    if (cached !== undefined) return cached

    const summary = await fetchSummaryFromJsonUrl(jsonUrl, controller.signal)
    if (summary !== null) {
      sharedMemoryCache.set(cacheKey, summary, ttlMs)
    }
    return summary
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

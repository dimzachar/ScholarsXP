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

function buildJsonUrlFromCanonical(canonical: string): string | null {
  try {
    const u = new URL(canonical)
    normalizeHost(u)
    if (!isCommentsPath(u.pathname)) return null
    if (!u.pathname.endsWith('.json')) u.pathname = u.pathname.replace(/\/?$/, '.json')
    const search = u.searchParams
    if (!search.has('raw_json')) search.set('raw_json', '1')
    u.search = search.toString()
    return u.toString()
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
          'User-Agent': process.env.REDDIT_USER_AGENT || 'ScholarsXP/featured-embed/1.0'
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
      'User-Agent': process.env.REDDIT_USER_AGENT || 'ScholarsXP/featured-embed/1.0',
      'Accept': 'application/json'
    },
    // Allow Next.js data cache with revalidation to dedupe repeated calls
    next: { revalidate: Number(process.env.REDDIT_JSON_REVALIDATE || 300) },
    redirect: 'follow',
    signal,
  })
  if (!res.ok) {
    if ([404, 410, 451].includes(res.status)) {
      return { removed: true }
    }
    return { removed: false }
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return { removed: false }
  }
  const data = await res.json()
  const post = Array.isArray(data) && data[0]?.data?.children?.[0]?.data
  if (!post) {
    return { removed: false }
  }
  // Consider common removal signals
  const removed = Boolean(post.removed_by_category || post.removed || post.selftext?.includes('[removed]') || post.author === '[deleted]')

  // Prefer high-quality preview image if available
  let previewUrl: string | undefined
  try {
    const src = post.preview?.images?.[0]?.source?.url as string | undefined
    if (typeof src === 'string') previewUrl = src
    // Galleries
    if (!previewUrl && post.gallery_data && post.media_metadata) {
      const firstId = post.gallery_data.items?.[0]?.media_id
      const meta = firstId && post.media_metadata[firstId]
      const gallerySrc = meta?.s?.u || meta?.s?.gif || meta?.s?.mp4
      if (typeof gallerySrc === 'string') previewUrl = gallerySrc
    }
  } catch {
    // ignore
  }
  // Fallback to thumbnail if it's a real URL
  if (!previewUrl && typeof post.thumbnail === 'string' && post.thumbnail?.startsWith('http')) {
    previewUrl = post.thumbnail
  }
  // Decode HTML entities in URLs (e.g., &amp;)
  if (previewUrl) {
    previewUrl = previewUrl.replace(/&amp;/g, '&')
  }

  // Normalize permalink to always start with '/'
  let permalink: string | undefined = post.permalink
  if (permalink && !permalink.startsWith('/')) {
    try {
      const purl = new URL(permalink)
      permalink = purl.pathname + purl.search + purl.hash
    } catch {
      // keep as-is
    }
  }

  const summary: RedditSummary = {
    title: post.title,
    author: post.author,
    subreddit: post.subreddit,
    score: post.score,
    num_comments: post.num_comments,
    created_utc: post.created_utc,
    selftext: post.selftext,
    thumbnail: previewUrl,
    permalink,
    url: post.url,
    over_18: Boolean(post.over_18),
    removed,
  }
  return summary
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
    sharedMemoryCache.set(cacheKey, summary, ttlMs)
    return summary
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

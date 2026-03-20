import dns from 'node:dns/promises'
import net from 'node:net'
import { withCache } from '@/lib/cache'
import type { LinkPreview, LinkPreviewLookupResult } from '@/types/link-preview'

const LINK_PREVIEW_TTL_SECONDS = 60 * 60 * 6
const FETCH_TIMEOUT_MS = 5000
const MAX_REDIRECTS = 2

type TextResponse = {
  body: string
  finalUrl: URL
  contentType: string
  status: number
}

type TextFetchResult = {
  response: TextResponse | null
  unavailable: boolean
}

function isMediumHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'medium.com' || normalized.endsWith('.medium.com')
}

function isValidHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url
    }
    return null
  } catch {
    return null
  }
}

function extractMeta(html: string, key: string, attr: 'property' | 'name' = 'property'): string | undefined {
  const regex1 = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i')
  const regex2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${key}["'][^>]*>`, 'i')
  const match1 = html.match(regex1)
  const match2 = html.match(regex2)
  return match1?.[1] || match2?.[1]
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim()
}

function extractDescription(html: string): string | undefined {
  return (
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'twitter:description', 'name') ||
    extractMeta(html, 'description', 'name')
  )?.trim()
}

function toAbsoluteUrl(raw: string | undefined, baseUrl: URL): string | undefined {
  if (!raw) return undefined
  try {
    return new URL(raw, baseUrl).toString()
  } catch {
    return undefined
  }
}

function extractImage(html: string, baseUrl: URL): string | undefined {
  const fromMeta = toAbsoluteUrl(
    extractMeta(html, 'og:image') ||
      extractMeta(html, 'twitter:image', 'name') ||
      extractMeta(html, 'image', 'itemprop'),
    baseUrl,
  )

  if (fromMeta) {
    return fromMeta
  }

  const mediumImageMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
  for (const match of mediumImageMatches) {
    const candidate = match[1]
    if (!candidate) continue
    if (candidate.includes('miro.medium.com') || candidate.includes('cdn-images-1.medium.com')) {
      return toAbsoluteUrl(candidate, baseUrl)
    }
  }

  const firstImageMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
  return toAbsoluteUrl(firstImageMatch?.[1], baseUrl)
}

function extractJsonLdImage(html: string, baseUrl: URL): string | undefined {
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []

  for (const script of scripts) {
    const contentMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
    const rawJson = contentMatch?.[1]?.trim()
    if (!rawJson) continue

    try {
      const parsed = JSON.parse(rawJson)
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

      while (queue.length) {
        const node = queue.shift()
        if (!node || typeof node !== 'object') continue

        const imageValue = (node as Record<string, unknown>).image
        if (typeof imageValue === 'string') {
          return toAbsoluteUrl(imageValue, baseUrl)
        }
        if (Array.isArray(imageValue)) {
          const first = imageValue.find((value) => typeof value === 'string')
          if (typeof first === 'string') {
            return toAbsoluteUrl(first, baseUrl)
          }
        }
        if (imageValue && typeof imageValue === 'object' && 'url' in imageValue) {
          const imageUrl = (imageValue as { url?: unknown }).url
          if (typeof imageUrl === 'string') {
            return toAbsoluteUrl(imageUrl, baseUrl)
          }
        }

        for (const value of Object.values(node as Record<string, unknown>)) {
          if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
              queue.push(...value)
            } else {
              queue.push(value)
            }
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return undefined
}

function extractPreloadImage(html: string, baseUrl: URL): string | undefined {
  const preloadMatch = html.match(/<link[^>]+rel=["'][^"']*preload[^"']*["'][^>]+as=["']image["'][^>]+href=["']([^"']+)["'][^>]*>/i)
  return toAbsoluteUrl(preloadMatch?.[1], baseUrl)
}

function extractSiteName(html: string, baseUrl: URL): string | null {
  const metaSiteName =
    extractMeta(html, 'og:site_name') ||
    extractMeta(html, 'application-name', 'name')

  if (metaSiteName?.trim()) {
    return metaSiteName.trim()
  }

  return baseUrl.hostname
}

function isGenericMediumTitle(title: string | null): boolean {
  if (!title) return false

  const normalized = title.toLowerCase().replace(/\s+/g, ' ').trim()
  return (
    normalized === 'medium' ||
    normalized === 'sign up | medium' ||
    normalized === 'page not found | medium' ||
    normalized === '404 | medium' ||
    normalized === 'error | medium'
  )
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.local') ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  )
}

function isBlockedAddress(address: string): boolean {
  if (address === '169.254.169.254') return true

  if (net.isIPv4(address)) {
    const octets = address.split('.').map((value) => parseInt(value, 10))
    const [a, b] = octets
    if (a === 10) return true
    if (a === 127) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 0) return true
    return false
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase()
    if (normalized === '::1') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true
    }
    return false
  }

  return true
}

async function assertPublicHost(target: URL): Promise<void> {
  if (isBlockedHostname(target.hostname)) {
    throw new Error('Blocked host')
  }

  const records = await dns.lookup(target.hostname, { all: true })
  if (!records.length) {
    throw new Error('Host resolution failed')
  }

  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new Error('Blocked network address')
    }
  }
}

async function fetchHtmlWithRedirects(startUrl: URL): Promise<{ html: string; finalUrl: URL } | null> {
  const result = await fetchTextWithRedirects(startUrl)
  const response = result.response
  if (!response || !response.contentType.includes('text/html')) {
    return null
  }

  return {
    html: response.body,
    finalUrl: response.finalUrl,
  }
}

async function fetchTextWithRedirects(startUrl: URL): Promise<TextFetchResult> {
  let currentUrl = startUrl

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicHost(currentUrl)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(currentUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'manual',
        next: { revalidate: LINK_PREVIEW_TTL_SECONDS },
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) {
          return null
        }

        const nextUrl = new URL(location, currentUrl)
        currentUrl = nextUrl
        continue
      }

      if (response.status === 404 || response.status === 410) {
        return { response: null, unavailable: true }
      }

      if (!response.ok) {
        return { response: null, unavailable: false }
      }

      const contentType = response.headers.get('content-type') || ''
      const body = await response.text()
      return {
        response: {
          body,
          finalUrl: currentUrl,
          contentType,
          status: response.status,
        },
        unavailable: false,
      }
    } catch {
      return { response: null, unavailable: false }
    } finally {
      clearTimeout(timeout)
    }
  }

  return { response: null, unavailable: false }
}

function decodeXmlEntities(value: string | undefined): string | undefined {
  if (!value) return value

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  }

function stripHtml(value: string | undefined): string | undefined {
  if (!value) return value
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function firstImageFromMarkup(value: string | undefined, baseUrl: URL): string | undefined {
  if (!value) return undefined

  const attributes = ['src', 'data-src', 'data-srcset', 'srcset']

  for (const attribute of attributes) {
    const regex = new RegExp(`<img[^>]+${attribute}=["']([^"']+)["'][^>]*>`, 'i')
    const match = value.match(regex)
    const raw = decodeXmlEntities(match?.[1])
    if (!raw) continue

    const candidate = raw.split(',')[0]?.trim().split(/\s+/)[0]
    const absolute = toAbsoluteUrl(candidate, baseUrl)
    if (absolute) {
      return absolute
    }
  }

  return undefined
}

function extractFeedMediaImage(item: string, baseUrl: URL): string | undefined {
  const patterns = [
    /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i,
    /<thumbnail>([\s\S]*?)<\/thumbnail>/i,
  ]

  for (const pattern of patterns) {
    const match = item.match(pattern)
    const candidate = decodeXmlEntities(match?.[1])?.trim()
    const absolute = toAbsoluteUrl(candidate, baseUrl)
    if (absolute) {
      return absolute
    }
  }

  return undefined
}

function normalizeArticleIdentity(url: string): string {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    return `${parsed.hostname.toLowerCase()}/${segments[segments.length - 1] || ''}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function getMediumFeedUrl(articleUrl: URL): URL | null {
  const hostname = articleUrl.hostname.toLowerCase()
  const segments = articleUrl.pathname.split('/').filter(Boolean)

  if (hostname === 'medium.com') {
    const firstSegment = segments[0]
    if (!firstSegment) return null
    if (firstSegment.startsWith('@')) {
      return new URL(`https://medium.com/feed/${firstSegment}`)
    }
    return new URL(`https://medium.com/feed/${firstSegment}`)
  }

  if (hostname.endsWith('.medium.com')) {
    return new URL(`https://${hostname}/feed`)
  }

  return null
}

function deriveTitleFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    const slug = parsed.pathname.split('/').filter(Boolean).pop()
    if (!slug) return null

    const cleaned = slug
      .replace(/-[a-f0-9]{8,}$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned) return null

    return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase())
  } catch {
    return null
  }
}

async function getMediumFeedPreview(articleUrl: URL): Promise<Partial<LinkPreview> | null> {
  const feedUrl = getMediumFeedUrl(articleUrl)
  if (!feedUrl) {
    return null
  }

  const response = await fetchTextWithRedirects(feedUrl)
  if (!response.response) {
    return null
  }

  if (
    !response.response.contentType.includes('xml') &&
    !response.response.contentType.includes('rss') &&
    !response.response.contentType.includes('text/plain')
  ) {
    return null
  }

  const items = response.response.body.match(/<item\b[\s\S]*?<\/item>/gi) || []
  const targetIdentity = normalizeArticleIdentity(articleUrl.toString())

  for (const item of items) {
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
    const itemLink = decodeXmlEntities(linkMatch?.[1])?.trim()
    if (!itemLink) continue

    const sameArticle =
      normalizeArticleIdentity(itemLink) === targetIdentity ||
      itemLink.toLowerCase().includes(articleUrl.pathname.split('/').filter(Boolean).pop()?.toLowerCase() || '')

    if (!sameArticle) {
      continue
    }

    const title = decodeXmlEntities(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1])?.trim() || null
    const descriptionMarkup =
      decodeXmlEntities(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1]) ||
      decodeXmlEntities(item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1])

    const image =
      extractFeedMediaImage(item, articleUrl) ||
      firstImageFromMarkup(descriptionMarkup, articleUrl) ||
      null

    const description = stripHtml(descriptionMarkup) || null

    return {
      title,
      description,
      image,
      canonicalUrl: itemLink,
      siteName: response.response.finalUrl.hostname,
      hostname: articleUrl.hostname,
    }
  }

  return null
}

async function fetchLinkPreviewLookupUncached(rawUrl: string): Promise<LinkPreviewLookupResult> {
  const target = isValidHttpUrl(rawUrl)
  if (!target) {
    return { preview: null, unavailable: false, resolved: false }
  }

  const pageResponse = await fetchTextWithRedirects(target)
  if (pageResponse.unavailable) {
    return { preview: null, unavailable: true, resolved: false }
  }

  const document =
    pageResponse.response && pageResponse.response.contentType.includes('text/html')
      ? {
          html: pageResponse.response.body,
          finalUrl: pageResponse.response.finalUrl,
        }
      : null

  if (!document) {
    const directMediumFeedPreview = await getMediumFeedPreview(target)
    if (directMediumFeedPreview) {
      return {
        preview: {
          title: directMediumFeedPreview.title || deriveTitleFromUrl(target.toString()),
          description: directMediumFeedPreview.description || null,
          image: directMediumFeedPreview.image || null,
          canonicalUrl: directMediumFeedPreview.canonicalUrl || target.toString(),
          siteName: directMediumFeedPreview.siteName || target.hostname,
          hostname: target.hostname,
        },
        unavailable: false,
        resolved: true,
      }
    }

    return { preview: null, unavailable: false, resolved: false }
  }

  const { html, finalUrl } = document
  const rawTitle = (extractMeta(html, 'og:title') || extractTitle(html))?.trim() || null
  let title = rawTitle
  let description = extractDescription(html) || null
  const extractedImage =
    extractImage(html, finalUrl) ||
    extractJsonLdImage(html, finalUrl) ||
    extractPreloadImage(html, finalUrl) ||
    null
  let image = extractedImage
  let canonicalUrl = finalUrl.toString()
  let siteName = extractSiteName(html, finalUrl)
  let resolved =
    Boolean(image || description) ||
    Boolean(rawTitle && !(isMediumHostname(finalUrl.hostname) && isGenericMediumTitle(rawTitle)))

  const isMediumHost = isMediumHostname(finalUrl.hostname)

  if (isMediumHost && (!resolved || !title || !image)) {
    const feedPreview = await getMediumFeedPreview(finalUrl)
    if (feedPreview) {
      title = title || feedPreview.title || null
      description = description || feedPreview.description || null
      image = image || feedPreview.image || null
      canonicalUrl = feedPreview.canonicalUrl || canonicalUrl
      siteName = feedPreview.siteName || siteName
      resolved = true
    }
  }

  title = title || deriveTitleFromUrl(finalUrl.toString())

  return {
    preview: {
      title,
      description,
      image,
      canonicalUrl,
      siteName,
      hostname: finalUrl.hostname,
    },
    unavailable: false,
    resolved,
  }
}

export async function getLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  const result = await getLinkPreviewLookup(rawUrl)
  return result.preview
}

export async function getLinkPreviewLookup(rawUrl: string): Promise<LinkPreviewLookupResult> {
  const cacheKey = `link-preview:v4:${rawUrl}`
  return withCache(cacheKey, LINK_PREVIEW_TTL_SECONDS, () => fetchLinkPreviewLookupUncached(rawUrl))
}

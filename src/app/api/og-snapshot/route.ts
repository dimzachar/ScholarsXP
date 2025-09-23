import { NextResponse } from 'next/server'
import dns from 'node:dns/promises'
import net from 'node:net'

function isValidHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u
    return null
  } catch {
    return null
  }
}

function extractMeta(html: string, key: string, attr: 'property' | 'name' = 'property'): string | undefined {
  const regex = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i')
  const m = html.match(regex)
  return m?.[1]
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim()
}

function extractDescription(html: string): string | undefined {
  return (
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'twitter:description', 'name') ||
    extractMeta(html, 'description', 'name')
  )?.trim()
}

function extractImage(html: string, baseUrl: URL): string | undefined {
  const raw = (
    extractMeta(html, 'og:image') ||
    extractMeta(html, 'twitter:image', 'name')
  )
  if (!raw) return undefined
  try {
    const u = new URL(raw, baseUrl)
    return u.toString()
  } catch {
    return undefined
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const input = searchParams.get('url') || ''
  const target = isValidHttpUrl(input)
  if (!target) {
    return NextResponse.json({ error: 'Invalid or missing url' }, { status: 400 })
  }

  // SSRF hardening: resolve host and block private/link-local/metadata ranges (IPv4/IPv6)
  const hostname = target.hostname
  if (isBlockedHostname(hostname)) {
    return NextResponse.json({ error: 'Blocked host' }, { status: 400 })
  }

  try {
    const records = await dns.lookup(hostname, { all: true })
    if (!records || records.length === 0) {
      return NextResponse.json({ error: 'Host resolution failed' }, { status: 400 })
    }
    for (const rec of records) {
      if (isBlockedAddress(rec.address)) {
        return NextResponse.json({ error: 'Blocked network address' }, { status: 400 })
      }
    }
  } catch {
    return NextResponse.json({ error: 'DNS resolution error' }, { status: 400 })
  }

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(target.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      // Do not auto-follow redirects (avoid redirecting to private IPs)
      redirect: 'manual',
      // Next.js fetch cache control: revalidate occasionally
      next: { revalidate: 60 * 60 },
    })

    // Block manual redirects
    if (res.status >= 300 && res.status < 400) {
      return NextResponse.json({ title: null, description: null, image: null, error: 'Redirect blocked' })
    }

    if (!res.ok) {
      // Return a soft success to avoid noisy client 502s; frontend will fallback
      return NextResponse.json({ title: null, description: null, image: null, error: `Upstream ${res.status}` })
    }

    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) {
      return NextResponse.json({ title: null, description: null, image: null, error: 'Unsupported content-type' })
    }

    const html = await res.text()
    const title = (extractMeta(html, 'og:title') || extractTitle(html))?.trim()
    const description = extractDescription(html)
    const image = extractImage(html, target)

    return NextResponse.json(
      {
        title: title || null,
        description: description || null,
        image: image || null,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch (err: any) {
    const aborted = err?.name === 'AbortError'
    // Soft success to keep UI quiet; include error for debugging
    return NextResponse.json({ title: null, description: null, image: null, error: aborted ? 'Timeout' : 'Fetch failed' })
  } finally {
    clearTimeout(t)
  }
}

// ------------------------
// SSRF helpers
// ------------------------
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h === '0.0.0.0' ||
    h === '::1'
  )
}

function isBlockedAddress(address: string): boolean {
  // Metadata IPv4
  if (address === '169.254.169.254') return true

  if (net.isIPv4(address)) {
    const octets = address.split('.').map(n => parseInt(n, 10))
    const [a,b] = octets
    // 10.0.0.0/8
    if (a === 10) return true
    // 127.0.0.0/8
    if (a === 127) return true
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true
    // 169.254.0.0/16 (link-local, includes metadata 169.254.169.254)
    if (a === 169 && b === 254) return true
    // 0.0.0.0
    if (a === 0) return true
    return false
  }

  if (net.isIPv6(address)) {
    // Block loopback ::1
    if (address === '::1') return true
    // Unique local addresses fc00::/7 -> starts with fc or fd
    const lc = address.toLowerCase()
    if (lc.startsWith('fc') || lc.startsWith('fd')) return true
    // Link-local fe80::/10
    if (lc.startsWith('fe8') || lc.startsWith('fe9') || lc.startsWith('fea') || lc.startsWith('feb')) return true
    return false
  }

  // Unknown format – block conservatively
  return true
}

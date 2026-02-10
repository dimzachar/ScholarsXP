'use client'

import React, { useEffect, useRef, useState } from 'react'
import { detectPlatform } from '@/lib/utils'
import { sanitizeUrl, sanitizeImageUrl } from '@/lib/url-sanitizer'

type Props = {
  url: string
}

function loadScriptOnce(id: string, src: string) {
  if (typeof window === 'undefined') return
  const existing = document.getElementById(id) as HTMLScriptElement | null
  if (existing) return existing
  const s = document.createElement('script')
  s.id = id
  s.async = true
  s.src = src
  document.body.appendChild(s)
  return s
}

function waitForGlobal<T = any>(path: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const parts = path.split('.')
      // @ts-ignore
      let ref: any = window
      for (const p of parts) {
        ref = ref?.[p]
      }
      if (ref) return resolve(ref as T)
      if (Date.now() - start > timeoutMs) return resolve(null)
      setTimeout(check, 100)
    }
    check()
  })
}

function isYouTube(url: string) {
  try {
    const u = new URL(url)
    return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')
  } catch {
    return false
  }
}

function toRedditEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = 'www.redditmedia.com'
    const path = u.pathname
    const qs = 'ref_source=embed&ref=share&embed=true&theme=dark'
    return `https://${host}${path}${u.search ? u.search + '&' : '?'}${qs}`
  } catch {
    return null
  }
}

export default function FeaturedEmbed({ url }: Props) {
  const platform = detectPlatform(url)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)
  const renderedRef = useRef(false)
  const renderSeqRef = useRef(0)
  const redditEmbedEnabled = process.env.NEXT_PUBLIC_ENABLE_REDDIT_EMBED === 'true'

  // Track container width and re-render embeds responsively
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // Twitter embed via widgets.createTweet for reliability
  useEffect(() => {
    if (platform !== 'Twitter') return
    const match = url.match(/status\/(\d+)/)
    const tweetId = match?.[1]
    if (!tweetId) return
    if (containerWidth == null) return

    let cancelled = false
    const seq = ++renderSeqRef.current
    const script = loadScriptOnce('twitter-wjs', 'https://platform.twitter.com/widgets.js')

    const render = async () => {
      const twttr: any = await waitForGlobal('twttr.widgets')
      if (cancelled) return
      if (!twttr || !containerRef.current) { setFailed(true); return }
      try {
        // Clear any previous content before re-rendering at a new width
        containerRef.current.innerHTML = ''
        const width = Math.max(250, Math.min(550, Math.floor(containerWidth)))
        const el = await twttr.createTweet(tweetId, containerRef.current, { align: 'center', width })
        // Tweak the produced iframe to remove top/bottom gaps and fit the card
        try {
          if (el && el instanceof HTMLElement) {
            el.style.margin = '0'
            el.style.display = 'block'
            el.style.maxWidth = '100%'
            el.style.width = '100%'
            el.style.border = '0'
          }
        } catch {}
        // If another render started in the meantime, clear this one
        if (seq !== renderSeqRef.current && containerRef.current) {
          containerRef.current.innerHTML = ''
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    if ((window as any)?.twttr?.widgets) {
      render()
    } else if (script) {
      script.addEventListener('load', render, { once: true })
    }

    return () => {
      cancelled = true
      // Cleanup any embed left over from an earlier render attempt
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [platform, url, containerWidth])

  if (isYouTube(url)) {
    // Basic YouTube iframe embed for quick testing
    const embed = url
      .replace('watch?v=', 'embed/')
      .replace('youtu.be/', 'www.youtube.com/embed/')
    return (
      <div className="aspect-video w-full overflow-hidden">
        <iframe
          className="h-full w-full"
          src={embed}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video player"
        />
      </div>
    )
  }

  if (platform === 'Twitter') {
    const match = url.match(/status\/(\d+)/)
    const tweetId = match?.[1]
    return <div className="w-full" ref={containerRef} />
  }

  if (platform === 'Reddit') {
    const embedUrl = toRedditEmbedUrl(url)

    const [ready, setReady] = useState(false)
    const [errored, setErrored] = useState(false)
    const [unavailable, setUnavailable] = useState(false)
    const [summary, setSummary] = useState<null | {
      title?: string
      author?: string
      subreddit?: string
      thumbnail?: string
      selftext?: string
      removed?: boolean
    }>(null)

    useEffect(() => {
      setReady(false)
      setErrored(false)
      if (!redditEmbedEnabled || !embedUrl) return
      const t = setTimeout(() => {
        // Some Reddit embeds silently fail due to third-party cookies/Recaptcha
        setErrored(true)
      }, 5000)
      return () => clearTimeout(t)
    }, [embedUrl, redditEmbedEnabled])

    // Prefetch summary early to detect removed/not-found and skip iframe
    useEffect(() => {
      let cancelled = false
      const run = async () => {
        try {
          const res = await fetch(`/api/reddit/summary?url=${encodeURIComponent(url)}`)
          if (cancelled) return
          if (!res.ok) {
            if ([403, 404, 410, 451].includes(res.status)) {
              setUnavailable(true)
            }
            return
          }
          const json = await res.json()
          if (cancelled) return
          setSummary({
            title: json.title,
            author: json.author,
            subreddit: json.subreddit,
            thumbnail: json.thumbnail,
            selftext: json.selftext,
            removed: json.removed,
          })
           if (json.removed) setUnavailable(true)
        } catch {
          // ignore
        }
      }
      run()
      return () => { cancelled = true }
    }, [url])

    // When errored or stalled, fetch a lightweight server-side summary as a fallback
    useEffect(() => {
      if (!errored) return
      let cancelled = false
      const run = async () => {
        try {
          const res = await fetch(`/api/reddit/summary?url=${encodeURIComponent(url)}`)
          if (!res.ok) {
            if ([403, 404, 410, 451].includes(res.status)) {
              setUnavailable(true)
            }
            return
          }
          const json = await res.json()
          if (!cancelled) {
            setSummary({
              title: json.title,
              author: json.author,
              subreddit: json.subreddit,
              thumbnail: json.thumbnail,
              selftext: json.selftext,
              removed: json.removed,
            })
          }
        } catch {
          // ignore
        }
      }
      run()
      return () => { cancelled = true }
    }, [errored, url])

    if (redditEmbedEnabled && embedUrl && !errored && !unavailable) {
      return (
        <div className="w-full overflow-hidden" style={{ height: 420 }}>
          <iframe
            title="Reddit embed"
            src={embedUrl}
            loading="lazy"
            className="w-full h-full"
            // Intentionally avoid sandbox here; Reddit’s embed relies on features that break under sandbox
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setReady(true)}
            onError={() => setErrored(true)}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Loading Reddit…
            </div>
          )}
        </div>
      )
    }

    // Fallback: static card using server-side summary if available, else a plain link
    try {
      const u = new URL(url)
      const safeThumbnail = sanitizeImageUrl(summary?.thumbnail)
      return (
        <a
          href={sanitizeUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {safeThumbnail && (
             
            // deepcode ignore DOMXSS: URL validated at submission via security.validateURL() - only Twitter/X, Reddit, Medium, Notion, LinkedIn allowed. Additional sanitization via sanitizeImageUrl blocks non-http(s) protocols.
            <img src={safeThumbnail} alt={summary.title || 'thumbnail'} className="w-full h-40 object-cover" />
          )}
          <div className="p-3 space-y-1">
            <div className="text-xs text-muted-foreground">{summary?.subreddit ? `r/${summary.subreddit}` : u.hostname}</div>
            <div className="font-semibold leading-snug text-base truncate">{summary?.title || (u.pathname || '/')}</div>
            {summary?.author && (
              <div className="text-xs text-muted-foreground">u/{summary.author}</div>
            )}
            {(unavailable || summary?.removed) ? (
              <div className="text-xs text-muted-foreground">Post unavailable or removed</div>
            ) : summary?.selftext ? (
              <div className="text-sm text-muted-foreground line-clamp-3">{summary.selftext}</div>
            ) : null}
            {!summary && (
              <div className="text-xs text-muted-foreground mt-1">Open on Reddit</div>
            )}
          </div>
        </a>
      )
    } catch {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block p-2">
          <div className="text-base font-semibold truncate">{url}</div>
        </a>
      )
    }
  }

  // Block Notion entirely in embeds
  if (platform === 'Notion') {
    return null
  }

  // Medium: fetch OG snapshot for nicer preview
  if (platform === 'Medium') {
    const [data, setData] = useState<{ title?: string; description?: string; image?: string } | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      let cancelled = false
      const run = async () => {
        try {
          const res = await fetch(`/api/og-snapshot?url=${encodeURIComponent(url)}`)
          if (!res.ok) {
            setError(`API returned ${res.status}`)
            throw new Error('og fetch failed')
          }
          const json = await res.json()
          if (!cancelled) {
            // Debug: log what we received
            if (process.env.NODE_ENV === 'development') {
              console.log('Medium OG data:', { url, image: json.image, title: json.title })
            }
            setData(json)
            setLoaded(true)
          }
        } catch (err) {
          if (!cancelled) {
            setLoaded(true)
            if (process.env.NODE_ENV === 'development') {
              console.error('Medium OG fetch error:', err)
            }
          }
        }
      }
      run()
      return () => { cancelled = true }
    }, [url])

    const safeImage = sanitizeImageUrl(data?.image)

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {safeImage ? (
           
          // deepcode ignore DOMXSS: URL from /api/og-snapshot which validates input URL via security checks. Additional sanitization via sanitizeImageUrl blocks non-http(s) protocols.
          <img 
            src={safeImage} 
            alt={data?.title || 'cover'} 
            className="w-full h-56 object-cover"
            onError={(e) => {
              if (process.env.NODE_ENV === 'development') {
                console.error('Medium image failed to load:', safeImage)
              }
              // Hide broken image
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : loaded ? (
          // Only show placeholder after data is loaded and no image found
          <div className="w-full h-40 bg-muted flex items-center justify-center text-xs text-muted-foreground">
            {error || 'No preview available'}
          </div>
        ) : null}
        <div className="p-3 space-y-1">
          <div className="text-sm text-muted-foreground">medium.com</div>
          <div className="font-semibold leading-snug text-base">{data?.title || 'Medium article'}</div>
          {data?.description && (
            <div className="text-sm text-muted-foreground line-clamp-3">{data.description}</div>
          )}
        </div>
      </a>
    )
  }

  // Notion, LinkedIn, or unknown: simple link preview for MVP
  try {
    const u = new URL(url)
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full rounded-md p-2 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <div className="text-sm text-muted-foreground">{u.hostname}</div>
        <div className="text-base font-semibold truncate">{u.pathname || '/'}</div>
      </a>
    )
  } catch {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block p-2">
        <div className="text-base font-semibold truncate">{url}</div>
      </a>
    )
  }
}






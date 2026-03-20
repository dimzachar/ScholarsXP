'use client'

import React, { useEffect, useRef, useState } from 'react'
import { detectPlatform } from '@/lib/utils'
import { sanitizeUrl, sanitizeImageUrl } from '@/lib/url-sanitizer'
import type { LinkPreview } from '@/types/link-preview'

type Props = {
  url: string
  platform?: string | null
  preview?: LinkPreview | null
}

type RedditSummary = {
  title?: string
  author?: string
  subreddit?: string
  thumbnail?: string
  selftext?: string
  removed?: boolean
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

function loadScriptOnce(id: string, src: string) {
  if (typeof window === 'undefined') return
  const existing = document.getElementById(id) as HTMLScriptElement | null
  if (existing) return existing
  const script = document.createElement('script')
  script.id = id
  script.async = true
  script.src = src
  document.body.appendChild(script)
  return script
}

function waitForGlobal<T = unknown>(path: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now()

    const check = () => {
      const parts = path.split('.')
      let ref: any = window
      for (const part of parts) {
        ref = ref?.[part]
      }

      if (ref) {
        resolve(ref as T)
        return
      }

      if (Date.now() - start > timeoutMs) {
        resolve(null)
        return
      }

      setTimeout(check, 100)
    }

    check()
  })
}

function isYouTube(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')
  } catch {
    return false
  }
}

function toRedditEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = 'www.redditmedia.com'
    const query = 'ref_source=embed&ref=share&embed=true&theme=dark'
    return `https://${host}${parsed.pathname}${parsed.search ? `${parsed.search}&` : '?'}${query}`
  } catch {
    return null
  }
}

function TwitterEmbed({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const renderSeqRef = useRef(0)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => setContainerWidth(element.clientWidth)
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    window.addEventListener('resize', updateWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  useEffect(() => {
    const match = url.match(/status\/(\d+)/)
    const tweetId = match?.[1]
    if (!tweetId || containerWidth == null) return

    let cancelled = false
    const seq = ++renderSeqRef.current
    const script = loadScriptOnce('twitter-wjs', 'https://platform.twitter.com/widgets.js')

    const renderTweet = async () => {
      const widgets: any = await waitForGlobal('twttr.widgets')
      if (cancelled) return
      if (!widgets || !containerRef.current) return

      try {
        containerRef.current.innerHTML = ''
        const width = Math.max(250, Math.min(550, Math.floor(containerWidth)))
        const tweet = await widgets.createTweet(tweetId, containerRef.current, { align: 'center', width })

        if (tweet && tweet instanceof HTMLElement) {
          tweet.style.margin = '0'
          tweet.style.display = 'block'
          tweet.style.maxWidth = '100%'
          tweet.style.width = '100%'
          tweet.style.border = '0'
        }

        if (seq !== renderSeqRef.current && containerRef.current) {
          containerRef.current.innerHTML = ''
        }
      } catch {
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }
      }
    }

    if ((window as any)?.twttr?.widgets) {
      renderTweet()
    } else if (script) {
      script.addEventListener('load', renderTweet, { once: true })
    }

    return () => {
      cancelled = true
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [url, containerWidth])

  return <div className="w-full" ref={containerRef} />
}

function RedditEmbed({ url }: { url: string }) {
  const redditEmbedEnabled = process.env.NEXT_PUBLIC_ENABLE_REDDIT_EMBED === 'true'
  const embedUrl = toRedditEmbedUrl(url)
  const [ready, setReady] = useState(false)
  const [errored, setErrored] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [summary, setSummary] = useState<RedditSummary | null>(null)

  useEffect(() => {
    setReady(false)
    setErrored(false)
    if (!redditEmbedEnabled || !embedUrl) return

    const timeout = setTimeout(() => {
      setErrored(true)
    }, 5000)

    return () => clearTimeout(timeout)
  }, [embedUrl, redditEmbedEnabled])

  useEffect(() => {
    let cancelled = false

    const loadSummary = async () => {
      try {
        const response = await fetch(`/api/reddit/summary?url=${encodeURIComponent(url)}`)
        if (cancelled) return

        if (!response.ok) {
          if ([403, 404, 410, 451].includes(response.status)) {
            setUnavailable(true)
          }
          return
        }

        const json = await response.json()
        if (cancelled) return

        setSummary({
          title: json.title,
          author: json.author,
          subreddit: json.subreddit,
          thumbnail: json.thumbnail,
          selftext: json.selftext,
          removed: json.removed,
        })

        if (json.removed) {
          setUnavailable(true)
        }
      } catch {
        // Ignore summary failures and fall back to a plain link card.
      }
    }

    loadSummary()
    return () => {
      cancelled = true
    }
  }, [url, errored])

  if (redditEmbedEnabled && embedUrl && !errored && !unavailable) {
    return (
      <div className="relative w-full overflow-hidden" style={{ height: 420 }}>
        <iframe
          title="Reddit embed"
          src={embedUrl}
          loading="lazy"
          className="h-full w-full"
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setReady(true)}
          onError={() => setErrored(true)}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading Reddit...
          </div>
        )}
      </div>
    )
  }

  try {
    const parsed = new URL(url)
    const safeThumbnail = sanitizeImageUrl(summary?.thumbnail)

    return (
      <a
        href={sanitizeUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {safeThumbnail && (
          <img
            src={safeThumbnail}
            alt={summary?.title || 'thumbnail'}
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        )}
        <div className="space-y-1 p-3">
          <div className="text-xs text-muted-foreground">
            {summary?.subreddit ? `r/${summary.subreddit}` : parsed.hostname}
          </div>
          <div className="truncate text-base font-semibold leading-snug">
            {summary?.title || parsed.pathname || '/'}
          </div>
          {summary?.author && <div className="text-xs text-muted-foreground">u/{summary.author}</div>}
          {(unavailable || summary?.removed) ? (
            <div className="text-xs text-muted-foreground">Post unavailable or removed</div>
          ) : summary?.selftext ? (
            <div className="line-clamp-3 text-sm text-muted-foreground">{summary.selftext}</div>
          ) : null}
          {!summary && <div className="mt-1 text-xs text-muted-foreground">Open on Reddit</div>}
        </div>
      </a>
    )
  } catch {
    return (
      <a href={sanitizeUrl(url)} target="_blank" rel="noopener noreferrer" className="block p-2">
        <div className="truncate text-base font-semibold">{url}</div>
      </a>
    )
  }
}

function MediumPreviewCard({ url, preview }: { url: string; preview?: LinkPreview | null }) {
  const [imageFailed, setImageFailed] = useState(false)
  const safeImage = imageFailed ? null : sanitizeImageUrl(preview?.image)
  const href = sanitizeUrl(preview?.canonicalUrl || url)
  const sourceLabel = preview?.siteName || preview?.hostname || 'Medium'
  const fallbackTitle = deriveTitleFromUrl(preview?.canonicalUrl || url) || 'Medium article'
  const title = preview?.title || fallbackTitle

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="relative aspect-[16/9] w-full bg-muted">
        {safeImage ? (
          <img
            src={safeImage}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Medium article
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{sourceLabel}</div>
        <div className="line-clamp-2 text-base font-semibold leading-snug">
          {title}
        </div>
        {preview?.description && (
          <div className="line-clamp-3 text-sm text-muted-foreground">{preview.description}</div>
        )}
      </div>
    </a>
  )
}

function SimpleLinkCard({ url }: { url: string }) {
  try {
    const parsed = new URL(url)
    return (
      <a
        href={sanitizeUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full rounded-md p-2 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <div className="text-sm text-muted-foreground">{parsed.hostname}</div>
        <div className="truncate text-base font-semibold">{parsed.pathname || '/'}</div>
      </a>
    )
  } catch {
    return (
      <a href={sanitizeUrl(url)} target="_blank" rel="noopener noreferrer" className="block p-2">
        <div className="truncate text-base font-semibold">{url}</div>
      </a>
    )
  }
}

export default function FeaturedEmbed({ url, platform: platformHint, preview }: Props) {
  const platform = platformHint || detectPlatform(url)

  if (isYouTube(url)) {
    const embedUrl = url
      .replace('watch?v=', 'embed/')
      .replace('youtu.be/', 'www.youtube.com/embed/')

    return (
      <div className="aspect-video w-full overflow-hidden">
        <iframe
          className="h-full w-full"
          src={embedUrl}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video player"
        />
      </div>
    )
  }

  if (platform === 'Twitter') {
    return <TwitterEmbed url={url} />
  }

  if (platform === 'Reddit') {
    return <RedditEmbed url={url} />
  }

  if (platform === 'Notion') {
    return null
  }

  if (platform === 'Medium') {
    return <MediumPreviewCard url={url} preview={preview} />
  }

  return <SimpleLinkCard url={url} />
}

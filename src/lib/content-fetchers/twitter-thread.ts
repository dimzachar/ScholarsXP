import 'server-only'
import { ContentData } from '@/types/task-types'

function safeNow(): Date {
  try { return new Date() } catch { return new Date() }
}

function cleanHtmlToText(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const noTags = noScript.replace(/<[^>]+>/g, '')
  return noTags.replace(/\s+/g, ' ').trim()
}

export async function extractTwitterThreadViaJina(url: string): Promise<ContentData> {
  const u = new URL(url)
  const httpUrl = `http://${u.host}${u.pathname}`
  const readerUrl = `https://r.jina.ai/${httpUrl}`
  const res = await fetch(readerUrl, { headers: { 'User-Agent': 'ScholarsXP/1.0' } })
  if (!res.ok) throw new Error(`Jina reader failed: ${res.status}`)
  const md = await res.text()

  const lines = md.split('\n')
  const contentLines: string[] = []
  let inPost = false
  for (const line of lines) {
    const l = line.trim()
    if (/^Post$/i.test(l) || /^Conversation$/i.test(l)) { inPost = true; continue }
    if (/^(Trending now|What's happening|Terms of Service|Privacy Policy)/i.test(l)) { inPost = false; continue }
    if (inPost) contentLines.push(l)
  }
  const content = contentLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return {
    url,
    platform: 'Twitter',
    content,
    title: 'Twitter Thread (reader)',
    extractedAt: safeNow(),
    metadata: { extractionMethod: 'jina-reader' }
  }
}

export async function extractSingleTweetViaOEmbed(url: string): Promise<ContentData> {
  let u = url
  try {
    const parsed = new URL(url)
    if (parsed.hostname.toLowerCase() === 'x.com') {
      parsed.hostname = 'twitter.com'
      u = parsed.toString()
    }
  } catch {}
  const api = `https://publish.twitter.com/oembed?url=${encodeURIComponent(u)}`
  const res = await fetch(api, { headers: { 'User-Agent': 'ScholarsXP/1.0' } })
  if (!res.ok) throw new Error(`oEmbed failed: ${res.status}`)
  const data = await res.json() as { html?: string; author_name?: string }
  const html = data.html || ''
  const text = cleanHtmlToText(html)
  return {
    url,
    platform: 'Twitter',
    content: text,
    title: `Tweet by ${data.author_name || 'unknown'}`,
    extractedAt: safeNow(),
    metadata: { extractionMethod: 'twitter-oembed' }
  }
}

export async function extractTwitterThread(url: string): Promise<ContentData> {
  const allowReader = (process.env.ALLOW_EXTERNAL_READER_FALLBACK || 'true').toLowerCase() === 'true'
  const errors: any[] = []
  if (allowReader) {
    try { return await extractTwitterThreadViaJina(url) } catch (e) { errors.push(e) }
  }
  try { return await extractSingleTweetViaOEmbed(url) } catch (e) { errors.push(e) }
  const err = errors.map(x => (x as any)?.message || String(x)).join(' | ')
  throw new Error(`Twitter extraction failed: ${err}`)
}


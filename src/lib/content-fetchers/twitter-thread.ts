import { ContentData } from '@/types/task-types'

function parseTwitterUrl(u: string): { username?: string; tweetId?: string } {
  try {
    const url = new URL(u)
    const host = url.hostname.toLowerCase()
    if (!host.includes('twitter.com') && !host.includes('x.com')) return {}
    // Expected path: /<username>/status/<id>
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 3 && parts[1] === 'status') {
      return { username: parts[0], tweetId: parts[2] }
    }
    return {}
  } catch {
    return {}
  }
}
function tweetIdToDate(tweetId?: string): Date | undefined {
  try {
    if (!tweetId) return undefined
    const id = BigInt(tweetId)
    const tsMs = Number((id >> 22n)) + 1288834974657 // Twitter epoch
    return new Date(tsMs)
  } catch {
    return undefined
  }
}

type ApifyRun = {
  data?: {
    id: string
    status: string
    defaultDatasetId?: string
  }
  id?: string
  status?: string
  defaultDatasetId?: string
}

type ApifyTweetItem = {
  id?: string
  url?: string
  text?: string
  fullText?: string
  full_text?: string
  authorUsername?: string
  authorId?: string
  conversationId?: string
  conversation_id?: string
  createdAt?: string
  index?: number
  position?: number
  demo?: boolean
}

function safeNow(): Date {
  try { return new Date() } catch { return new Date() }
}

function firstNonEmpty<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && (typeof v !== 'string' || v.trim().length > 0)) return v as T
}

function cleanHtmlToText(html: string): string {
  // Remove scripts and tags, keep text content
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  const noTags = noScript.replace(/<[^>]+>/g, '')
  // Collapse whitespace
  return noTags.replace(/\s+/g, ' ').trim()
}

function normalizeActorIdForRest(actor: string): string {
  // REST expects owner~name, not owner/name
  return actor.includes('~') ? actor : actor.replace('/', '~')
}

function isActorApifyOfficial(actorLower: string): boolean {
  return actorLower.includes('apify~twitter-scraper') || actorLower.includes('apify/twitter-scraper')
}

function toApidojoActor(): string {
  return 'apidojo/tweet-scraper'
}

async function startApifyRunWithInput(token: string, actor: string, input: Record<string, any>) {
  const restActor = normalizeActorIdForRest(actor)
  const res = await fetch(`https://api.apify.com/v2/acts/${restActor}/runs?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!res.ok) throw new Error(`Apify run start failed: ${res.status} ${res.statusText}`)
  return await res.json() as ApifyRun
}

async function pollApifyRun(runId: string, token: string, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(token)}`)
    if (!res.ok) throw new Error(`Apify run poll failed: ${res.status}`)
    const data = await res.json() as ApifyRun
    const status = (data.data?.status || (data.status as string) || '').toUpperCase()
    if (status === 'SUCCEEDED') return data
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) throw new Error(`Apify run ended: ${status}`)
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error('Apify run timed out')
}

async function getApifyItems(datasetId: string, token: string): Promise<ApifyTweetItem[]> {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&format=json&clean=true&limit=500`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Apify dataset fetch failed: ${res.status}`)
  return await res.json() as ApifyTweetItem[]
}

function buildThreadContent(items: ApifyTweetItem[], sourceUrl: string, extraMeta?: Record<string, any>): ContentData {
  if (!items || items.length === 0) {
    return {
      url: sourceUrl,
      platform: 'Twitter',
      content: '',
      title: 'Twitter Thread',
      extractedAt: safeNow(),
      metadata: { extractionMethod: 'apify-twitter-scraper', threadLength: 0, ...extraMeta }
    }
  }

  const root = items[0]
  const author = firstNonEmpty(root.authorUsername) || 'unknown'
  const convo = firstNonEmpty(root.conversationId, root.conversation_id)

  // Filter to author and same conversation when possible
  const filtered = items.filter(it => {
    const sameAuthor = !author || it.authorUsername === author
    const sameConvo = !convo || firstNonEmpty(it.conversationId, it.conversation_id) === convo
    return sameAuthor && sameConvo
  })

  // Sort by createdAt/index/position as available
  filtered.sort((a, b) => {
    const ai = a.createdAt ? Date.parse(a.createdAt) : 0
    const bi = b.createdAt ? Date.parse(b.createdAt) : 0
    if (ai && bi && ai !== bi) return ai - bi
    const ia = (a.index ?? a.position ?? 0)
    const ib = (b.index ?? b.position ?? 0)
    return ia - ib
  })

  const parts: string[] = []
  const tweetIds: string[] = []
  for (const [i, it] of filtered.entries()) {
    const text = firstNonEmpty(it.fullText, it.full_text, it.text) || ''
    const id = it.id
    if (id) tweetIds.push(id)
    if (text) {
      parts.push(`Tweet ${i + 1}:
${text.trim()}`)
    }
  }

  const content = parts.join('\n\n')
  const title = `Thread by @${author}: ${content.substring(0, 80).replace(/\n/g, ' ')}${content.length > 80 ? '…' : ''}`

  return {
    url: sourceUrl,
    platform: 'Twitter',
    content,
    title,
    extractedAt: safeNow(),
    metadata: {
      extractionMethod: 'apify-twitter-scraper',
      tweetIds,
      threadLength: filtered.length,
      author,
      conversationId: convo,
      ...extraMeta
    }
  }
}

function itemsLookLikeDemo(items: ApifyTweetItem[] | undefined): boolean {
  if (!items || items.length === 0) return true
  return items.every((it) => {
    const text = firstNonEmpty(it?.fullText, it?.full_text, it?.text)
    return Boolean((it as any)?.demo) || !text
  })
}

// Preferred: Use official apify-client SDK if available
export async function extractTwitterThreadViaApifyClient(url: string): Promise<ContentData> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')

  // Dynamically import to avoid bundling on client
  let ClientCtor: any
  try {
     
    const mod: any = await import('apify-client')
    ClientCtor = mod.ApifyClient || mod.ApifyApi
  } catch (e) {
    throw new Error('apify-client not installed')
  }

  let actor = process.env.APIFY_TW_SCRAPER_ACTOR || 'apidojo/tweet-scraper'
  if (!ClientCtor) throw new Error('apify-client export not found (ApifyClient/ApifyApi)')
  const client = new ClientCtor({ token })

  let actorLower = String(actor).toLowerCase()

  // Map inputs per-actor for higher success
  let input: Record<string, any> = buildApifyActorInput(actorLower, url)

  console.log(`🧪 [Apify SDK] Calling actor '${actor}' with keys: ${Object.keys(input).join(', ')}`)
  let run: any
  try {
    run = await client.actor(actor).call(input)
  } catch (e: any) {
    const msg = e?.message || String(e)
    const status = e?.statusCode || e?.status
    const clientMethod = e?.clientMethod
    console.error(`❌ [Apify SDK] Actor call failed: ${msg} (status=${status || 'n/a'}, method=${clientMethod || 'n/a'})`)
    // If official actor is not found (404), transparently retry with apidojo/tweet-scraper
    const notFound = (status === 404) || /record-not-found/i.test(msg || '')
    if (notFound && isActorApifyOfficial(actorLower)) {
      actor = toApidojoActor()
      actorLower = actor.toLowerCase()
      input = buildApifyActorInput(actorLower, url)
      console.log(`↪️  Retrying with '${actor}' via SDK`)
      run = await client.actor(actor).call(input)
    } else {
      throw e
    }
  }
  const runId: string | undefined = (run as any)?.id || (run as any)?.data?.id
  const datasetId: string | undefined = (run as any)?.defaultDatasetId || (run as any)?.data?.defaultDatasetId
  if (!datasetId) throw new Error('Apify dataset ID missing from run')
  console.log(`📦 [Apify SDK] Run completed: runId=${runId || '-'} datasetId=${datasetId}`)

  const dataset = client.dataset(datasetId)
  let listed: any
  try {
    listed = await dataset.listItems({ clean: true, limit: 500 })
  } catch (e: any) {
    console.error(`❌ [Apify SDK] listItems failed: ${e?.message || e}`)
    // Fallback to REST dataset fetch per Apify docs
    try {
      const restItems = await getApifyItems(datasetId, token)
      if (!itemsLookLikeDemo(restItems)) {
        const extraMeta = { apifyActor: actor, apifyRunId: runId, apifyDatasetId: datasetId }
        return buildThreadContent(restItems, url, extraMeta)
      }
    } catch { /* ignore and let it fail below */ }
    throw e
  }
  let items: ApifyTweetItem[] = (listed as any)?.items || []
  // If SDK returned empty or demo placeholders, fetch via REST as the docs specify
  if (itemsLookLikeDemo(items)) {
    try {
      const restItems = await getApifyItems(datasetId, token)
      if (!itemsLookLikeDemo(restItems)) {
        items = restItems
      }
    } catch (e) {
      console.error(`❌ [Apify REST] Dataset fetch failed: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (itemsLookLikeDemo(items)) {
    // If apidojo actor yielded demo/empty, try the official actor transparently
    const actorLowerNow = String(actor).toLowerCase()
    if (actorLowerNow.includes('apidojo/tweet-scraper')) {
      console.log('↪️  apidojo returned empty/demo items. Falling back to apify/twitter-scraper via run-sync.')
      try {
        const alt = await extractTwitterThreadViaApifyRunSync(url)
        return alt
      } catch (e) {
        console.error('❌  Fallback to apify/twitter-scraper failed:', e)
      }
    }
    throw new Error('Apify actor returned no usable items (empty or demo dataset). Check Apify plan/proxy or actor inputs.')
  }
  
  const extraMeta = { apifyActor: actor, apifyRunId: runId, apifyDatasetId: datasetId }
  return buildThreadContent(items, url, extraMeta)
}

export async function extractTwitterThreadViaApify(url: string): Promise<ContentData> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')
  let actor = process.env.APIFY_TW_SCRAPER_ACTOR || 'apidojo/tweet-scraper'

  console.log(`🧪 [Apify REST] Starting run for actor '${actor}'`)
  let run: any
  try {
    const input = buildApifyActorInput(actor.toLowerCase(), url)
    run = await startApifyRunWithInput(token, actor, input)
  } catch (e: any) {
    const msg = e?.message || String(e)
    const is404 = /\b404\b|not found|record-not-found/i.test(msg || '')
    if (is404 && isActorApifyOfficial(String(actor).toLowerCase())) {
      actor = toApidojoActor()
      console.log(`↪️  Retrying REST run with actor '${actor}'`)
      const input2 = buildApifyActorInput(actor.toLowerCase(), url)
      run = await startApifyRunWithInput(token, actor, input2)
    } else {
      throw e
    }
  }
  const runId = run.data?.id || (run.id as string)
  if (!runId) throw new Error('Apify run ID missing')
  const finished = await pollApifyRun(runId, token)
  const datasetId = finished.data?.defaultDatasetId || finished.defaultDatasetId
  if (!datasetId) throw new Error('Apify dataset ID missing')
  console.log(`📦 [Apify REST] Run succeeded: runId=${runId} datasetId=${datasetId}`)
  const items = await getApifyItems(datasetId, token)
  if (!items || items.length === 0) {
    throw new Error('Apify REST returned no items (empty dataset). Likely plan restriction or no visible tweets.')
  }
  const extraMeta = { apifyActor: actor, apifyRunId: runId, apifyDatasetId: datasetId }
  return buildThreadContent(items, url, extraMeta)
}

export async function extractTwitterThreadViaJina(url: string): Promise<ContentData> {
  // Safety net fallback; quality varies
  const u = new URL(url)
  const httpUrl = `http://${u.host}${u.pathname}`
  const readerUrl = `https://r.jina.ai/${httpUrl}`
  const res = await fetch(readerUrl, { headers: { 'User-Agent': 'ScholarsXP/1.0' } })
  if (!res.ok) throw new Error(`Jina reader failed: ${res.status}`)
  const md = await res.text()

  // Naive filtering: keep lines around Post/Conversation and @author blocks
  const lines = md.split('\n')
  const contentLines: string[] = []
  let inPost = false
  for (const line of lines) {
    const l = line.trim()
    if (/^Post$/i.test(l) || /^Conversation$/i.test(l)) { inPost = true; continue }
    if (/^(Trending now|What\'s happening|Terms of Service|Privacy Policy)/i.test(l)) { inPost = false; continue }
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
  // Ensure twitter.com host for oEmbed (x.com can 400)
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
  const allowReader = (process.env.ALLOW_EXTERNAL_READER_FALLBACK || 'false').toLowerCase() === 'true'
  const configuredActor = (process.env.APIFY_TW_SCRAPER_ACTOR || 'apidojo/tweet-scraper').toLowerCase()

  // Provider chain: Apify SDK → Apify run-sync → Apify REST → Jina (optional) → oEmbed
  const errors: any[] = []
  // Try SDK first for better ergonomics, then run-sync, then REST (for the configured actor)
  try { return await extractTwitterThreadViaApifyClient(url) } catch (e) { console.error('⚠️  Apify SDK failed:', e); errors.push(e) }
  try { return await extractTwitterThreadViaApifyRunSync(url) } catch (e) { console.error('⚠️  Apify run-sync failed:', e); errors.push(e) }
  try { return await extractTwitterThreadViaApify(url) } catch (e) { console.error('⚠️  Apify REST failed:', e); errors.push(e) }
  if (allowReader) { try { return await extractTwitterThreadViaJina(url) } catch (e) { errors.push(e) } }
  try { return await extractSingleTweetViaOEmbed(url) } catch (e) { errors.push(e) }
  const err = errors.map(x => x?.message || String(x)).join(' | ')
  throw new Error(`All Twitter providers failed: ${err}`)
}

async function extractTwitterThreadViaApifyRunSync(url: string): Promise<ContentData> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
  if (!token) throw new Error('APIFY_TOKEN not set')
  let actor = process.env.APIFY_TW_SCRAPER_ACTOR || 'apidojo/tweet-scraper'
  const restActor = normalizeActorIdForRest(actor)
  const input = buildApifyActorInput(actor.toLowerCase(), url)

  const endpoint = `https://api.apify.com/v2/acts/${restActor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json&clean=true&limit=500`
  let res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!res.ok) {
    // If official actor not found, retry with apidojo
    if (res.status === 404 && isActorApifyOfficial(actor.toLowerCase())) {
      actor = toApidojoActor()
      const altRest = normalizeActorIdForRest(actor)
      const altInput = buildApifyActorInput(actor.toLowerCase(), url)
      const altEndpoint = `https://api.apify.com/v2/acts/${altRest}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json&clean=true&limit=500`
      console.log(`↪️  Retrying run-sync with '${actor}'`)
      res = await fetch(altEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(altInput) })
    }
  }
  if (!res.ok) throw new Error(`run-sync dataset-items failed: ${res.status} ${res.statusText}`)
  const items = await res.json() as ApifyTweetItem[]
  if (itemsLookLikeDemo(items)) {
    if (actor.toLowerCase().includes('apidojo/tweet-scraper')) {
      // Try official actor as fallback
      actor = 'apify~twitter-scraper'
      const altInput = buildApifyActorInput(actor.toLowerCase(), url)
      const altEndpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json&clean=true&limit=500`
      const altRes = await fetch(altEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(altInput) })
      if (altRes.ok) {
        const altItems = await altRes.json() as ApifyTweetItem[]
        if (!itemsLookLikeDemo(altItems)) {
          const extraMeta = { apifyActor: actor, apifyRunId: 'sync', apifyDatasetId: 'inline' }
          return buildThreadContent(altItems, url, extraMeta)
        }
      }
    }
    throw new Error('run-sync returned no usable items')
  }
  const extraMeta = { apifyActor: actor, apifyRunId: 'sync', apifyDatasetId: 'inline' }
  return buildThreadContent(items, url, extraMeta)
}

function buildApifyActorInput(actorLower: string, url: string): Record<string, any> {
  // apify official twitter scraper
  if (actorLower.includes('apify~twitter-scraper') || actorLower.includes('apify/twitter-scraper')) {
    return {
      startUrls: [{ url }],
      includeQuotedTweets: true,
      includeRetweetText: false,
      onlyOwner: true,
      maxItems: 60,
      maxTweets: 60,
      addUserInfo: true,
    }
  }

  // apidojo/tweet-scraper (Tweet Scraper V2)
  if (actorLower.includes('apidojo/tweet-scraper')) {
    // Recommended usage per actor docs: use searchTerms only.
    // Build a conversation query from URL: conversation_id:<id> from:<username>
    const { username, tweetId } = parseTwitterUrl(url)
    const terms: string[] = []
    if (tweetId) terms.push(`conversation_id:${tweetId}`)
    if (username) terms.push(`from:${username}`)
    const query = terms.length ? terms.join(' ') : ''
    const dt = tweetIdToDate(tweetId)
    let start: string | undefined
    let end: string | undefined
    if (dt) {
      const d0 = new Date(dt)
      const d1 = new Date(dt)
      d0.setDate(d0.getDate() - 1)
      d1.setDate(d1.getDate() + 1)
      start = d0.toISOString().slice(0, 10)
      end = d1.toISOString().slice(0, 10)
    }

    const input: Record<string, any> = {
      searchTerms: query ? [query] : [],
      start,
      end,
      sort: 'Latest',
      maxItems: 120
    }
    const lang = (process.env.APIFY_TWEET_LANGUAGE || '').trim()
    if (lang) input.tweetLanguage = lang // only set if provided; must be string
    return input
  }

  // kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest
  if (actorLower.includes('twitter-x-data-tweet-scraper') || actorLower.includes('cheapest')) {
    return {
      urls: [url],
      includeReplies: false,
      includeRetweets: false,
      maxTweets: 60,
      onlyText: true,
    }
  }

  // Default: try to be compatible with startUrls input
  return {
    startUrls: [{ url }],
    onlyOwner: true,
    maxItems: 60,
    addUserInfo: true,
  }
}

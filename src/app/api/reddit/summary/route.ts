import { NextRequest, NextResponse } from 'next/server'
import { getRedditSummary } from '@/lib/reddit-summary'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  try {
    const summary = await getRedditSummary(url)
    if (!summary) {
      return NextResponse.json({ error: 'Could not resolve post' }, { status: 400 })
    }
    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Fetch failed' }, { status: 500 })
  }
}

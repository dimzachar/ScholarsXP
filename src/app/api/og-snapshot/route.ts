import { NextResponse } from 'next/server'
import { getLinkPreview } from '@/lib/link-preview'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const input = searchParams.get('url') || ''

  if (!input) {
    return NextResponse.json({ error: 'Invalid or missing url' }, { status: 400 })
  }

  const preview = await getLinkPreview(input)

  if (!preview) {
    return NextResponse.json({
      title: null,
      description: null,
      image: null,
      canonicalUrl: input,
      siteName: null,
      hostname: null,
      error: 'Preview unavailable',
    })
  }

  return NextResponse.json(preview, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'

/**
 * Internal API endpoint for Playwright navigation
 * This endpoint uses the available Playwright MCP tools to navigate to URLs
 */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }
    
    console.log(`🌐 [Playwright API] Navigating to ${url}`)

    // Use the actual browser_navigate_Playwright tool
    await browser_navigate_Playwright({ url })

    console.log(`✅ [Playwright API] Navigation completed for ${url}`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully navigated to ${url}` 
    })
    
  } catch (error) {
    console.error('❌ [Playwright API] Navigation failed:', error)
    return NextResponse.json(
      { error: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

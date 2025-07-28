import { NextRequest, NextResponse } from 'next/server'

/**
 * Internal API endpoint for closing Playwright browser
 * This endpoint uses the available Playwright MCP tools to close the browser
 */
export async function POST(request: NextRequest) {
  try {
    console.log(`🔒 [Playwright API] Closing browser`)

    // Use the actual browser_close_Playwright tool
    await browser_close_Playwright()

    console.log(`✅ [Playwright API] Browser closed successfully`)
    
    return NextResponse.json({ 
      success: true,
      message: 'Browser closed successfully'
    })
    
  } catch (error) {
    console.error('❌ [Playwright API] Browser close failed:', error)
    return NextResponse.json(
      { error: `Browser close failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

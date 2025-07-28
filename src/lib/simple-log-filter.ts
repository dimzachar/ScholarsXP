/**
 * Simple log filter - Works in all Next.js runtimes
 * Only overrides console methods, not stdout/stderr
 */

if (typeof window === 'undefined' && process.env.SUPPRESS_LOGS === 'true') {
  // Store original console methods
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  // Comprehensive suppression patterns
  const suppressPatterns = [
    // API routes and responses
    /GET \/api\//,
    /POST \/api\//,
    /PATCH \/api\//,
    /PUT \/api\//,
    /DELETE \/api\//,
    /\d+ in \d+ms/,
    /200 in/,
    /404 in/,
    /500 in/,
    
    // Supabase patterns
    /https:\/\/vhrnvkklkfgfmpcn/,
    /\/auth\/v1\//,
    /\/rest\/v1\//,
    /cache skip/i,
    /Cache skipped reason/i,
    /auto no cache/i,
    
    // Next.js internal patterns
    /pending revalidates/i,
    /use-cache:/i,
    /using filesystem cache/i,
    /cache handlers already initialized/i,
    /Compiled \/api\//,
    
    // Tree structure and formatting
    /^[\s│├└┌┐┘]*$/,
    /│/,
    /├/,
    /└/,
    /┌/,
    /┐/,
    /┘/,
    
    // Other noise patterns
    /select\=\*/i,
    /userId\.\./i,
    /review\.\./i,
    /ear\.\./i
  ]

  function shouldSuppress(message: string): boolean {
    // Don't suppress empty messages or very short ones
    if (!message || message.trim().length < 3) {
      return false
    }
    
    // Check against all patterns
    return suppressPatterns.some(pattern => pattern.test(message))
  }

  // Override all console methods
  console.log = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      original.log(...args)
    }
  }

  console.info = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      original.info(...args)
    }
  }

  console.warn = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      original.warn(...args)
    }
  }

  console.error = (...args: any[]) => {
    const message = args.join(' ')
    // Be more careful with errors - only suppress obvious noise
    if (!shouldSuppress(message) || message.includes('Error:') || message.includes('Failed')) {
      original.error(...args)
    }
  }

  console.debug = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      original.debug(...args)
    }
  }

  console.log('🔇 Simple log filter activated')
}

export {}

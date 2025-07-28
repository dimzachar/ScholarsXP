/**
 * Silent logger - Nuclear option to completely suppress Next.js logs
 * This should be imported as early as possible in the application
 */

// Only run on server side and check for Node.js runtime (not Edge Runtime)
if (typeof window === 'undefined' &&
    process.env.SUPPRESS_LOGS === 'true' &&
    typeof process.stdout !== 'undefined') {

  // Store original methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  // Only override stdout/stderr if they exist (Node.js runtime)
  let originalStdout: any = null
  let originalStderr: any = null

  try {
    if (process.stdout && process.stdout.write) {
      originalStdout = process.stdout.write.bind(process.stdout)
    }
    if (process.stderr && process.stderr.write) {
      originalStderr = process.stderr.write.bind(process.stderr)
    }
  } catch (e) {
    // Edge Runtime - skip stdout/stderr override
  }

  // Patterns to suppress
  const suppressPatterns = [
    // API routes
    /GET \/api\//,
    /POST \/api\//,
    /PATCH \/api\//,
    /PUT \/api\//,
    /DELETE \/api\//,
    // Response times
    /\d+ in \d+ms/,
    // Supabase
    /https:\/\/vhrnvkklkfgfmpcn/,
    /\/auth\/v1\//,
    /\/rest\/v1\//,
    /cache skip/,
    /Cache skipped reason/,
    // Tree characters
    /[│├└┌┐┘]/,
    // Next.js specific
    /pending revalidates/,
    /use-cache:/,
    /using filesystem cache/,
    /cache handlers already initialized/,
    /Compiled \/api\//,
    // Other noise
    /\(auto no cache\)/,
    /\(cache skip\)/
  ]

  function shouldSuppress(message: string): boolean {
    return suppressPatterns.some(pattern => pattern.test(message))
  }

  // Override all console methods
  console.log = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      originalConsole.log(...args)
    }
  }

  console.info = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      originalConsole.info(...args)
    }
  }

  console.warn = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      originalConsole.warn(...args)
    }
  }

  console.error = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      originalConsole.error(...args)
    }
  }

  console.debug = (...args: any[]) => {
    const message = args.join(' ')
    if (!shouldSuppress(message)) {
      originalConsole.debug(...args)
    }
  }

  // Override stdout/stderr only if available (Node.js runtime)
  if (originalStdout && process.stdout) {
    try {
      process.stdout.write = function(chunk: any, encoding?: any, callback?: any) {
        const message = chunk.toString()
        if (shouldSuppress(message)) {
          if (typeof callback === 'function') callback()
          return true
        }
        return originalStdout(chunk, encoding, callback)
      }
    } catch (e) {
      // Failed to override stdout - continue without it
    }
  }

  if (originalStderr && process.stderr) {
    try {
      process.stderr.write = function(chunk: any, encoding?: any, callback?: any) {
        const message = chunk.toString()
        if (shouldSuppress(message)) {
          if (typeof callback === 'function') callback()
          return true
        }
        return originalStderr(chunk, encoding, callback)
      }
    } catch (e) {
      // Failed to override stderr - continue without it
    }
  }

  console.log('🔇 Silent logger activated - API and Supabase logs suppressed')
}

export {}

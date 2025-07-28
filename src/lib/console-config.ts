/**
 * Nuclear option: Aggressive console configuration to suppress Next.js and Supabase logs
 * This file completely overrides Node.js logging to eliminate noise
 */

// Check if logging should be suppressed (now active in development too)
const shouldSuppressLogs = process.env.SUPPRESS_LOGS === 'true'

// If we're in a browser environment, don't do anything
if (typeof window !== 'undefined') {
  // Browser environment - don't override anything
} else if (shouldSuppressLogs) {
  // Server environment - apply aggressive filtering
  console.log('🔇 Aggressive log suppression enabled - Next.js and Supabase logs will be filtered')
}

// Only apply console filtering when needed and in server environment
if (typeof window === 'undefined' && shouldSuppressLogs) {
  // Store original methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  const originalStdoutWrite = process.stdout.write.bind(process.stdout)
  const originalStderrWrite = process.stderr.write.bind(process.stderr)

  // Function to check if a message should be suppressed
  function shouldSuppressMessage(message: string): boolean {
    return (
      // API request logs
      message.includes('GET /api/') ||
      message.includes('POST /api/') ||
      message.includes('PATCH /api/') ||
      message.includes('PUT /api/') ||
      message.includes('DELETE /api/') ||
      // Response time and status logs
      /\d+ in \d+ms/.test(message) ||
      message.includes('200 in') ||
      message.includes('404 in') ||
      message.includes('500 in') ||
      // Supabase logs
      message.includes('https://vhrnvkklkfgfmpcn') ||
      message.includes('/auth/v1/') ||
      message.includes('/rest/v1/') ||
      message.includes('cache skip') ||
      message.includes('Cache skipped reason') ||
      // Tree structure and indentation
      message.includes('│') ||
      message.includes('├') ||
      message.includes('└') ||
      message.includes('┌') ||
      message.includes('┐') ||
      message.includes('┘') ||
      message.includes('└') ||
      // Next.js specific logs
      message.includes('pending revalidates') ||
      message.includes('use-cache:') ||
      message.includes('using filesystem cache') ||
      message.includes('cache handlers already initialized') ||
      // Compilation logs we might want to suppress
      message.includes('Compiled /api/') ||
      // Other noise
      message.includes('(auto no cache)') ||
      message.includes('(cache skip)')
    )
  }

  // Override console methods to filter out noise
  console.log = (...args: any[]) => {
    const message = args.join(' ')

    if (shouldSuppressMessage(message)) {
      return // Suppress these logs
    }

    // Allow other logs through
    originalConsole.log(...args)
  }

  console.info = (...args: any[]) => {
    const message = args.join(' ')

    if (shouldSuppressMessage(message)) {
      return
    }

    originalConsole.info(...args)
  }

  console.debug = (...args: any[]) => {
    const message = args.join(' ')

    if (shouldSuppressMessage(message)) {
      return
    }

    originalConsole.debug(...args)
  }

  // Keep warnings and errors but filter them too
  console.warn = (...args: any[]) => {
    const message = args.join(' ')

    if (shouldSuppressMessage(message)) {
      return
    }

    originalConsole.warn(...args)
  }

  console.error = (...args: any[]) => {
    const message = args.join(' ')

    // Don't suppress actual errors, but suppress error-level logs that are just noise
    if (shouldSuppressMessage(message)) {
      return
    }

    originalConsole.error(...args)
  }

  // Override process.stdout.write to catch Next.js built-in request logging
  process.stdout.write = function(chunk: any, encoding?: any, callback?: any) {
    const message = chunk.toString()

    if (shouldSuppressMessage(message)) {
      // Suppress these logs by not writing them
      if (typeof callback === 'function') {
        callback()
      }
      return true
    }

    // Allow other logs through
    return originalStdoutWrite(chunk, encoding, callback)
  }

  // Also override stderr.write for completeness
  process.stderr.write = function(chunk: any, encoding?: any, callback?: any) {
    const message = chunk.toString()

    if (shouldSuppressMessage(message)) {
      // Suppress these logs by not writing them
      if (typeof callback === 'function') {
        callback()
      }
      return true
    }

    // Allow other logs through
    return originalStderrWrite(chunk, encoding, callback)
  }
}

export {}

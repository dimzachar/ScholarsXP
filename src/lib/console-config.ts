/**
 * Console configuration for production environments
 * This file helps reduce console noise in production while preserving important logs
 */

// Check if logging should be suppressed
const shouldSuppressLogs = process.env.NODE_ENV === 'production' || process.env.SUPPRESS_LOGS === 'true'

// Only apply console filtering when needed
if (shouldSuppressLogs) {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  // Override console methods to filter out noise
  console.log = (...args: any[]) => {
    // Allow important application logs but filter out library noise
    const message = args.join(' ')
    
    // Filter out common Supabase/Prisma noise
    if (
      message.includes('supabase') ||
      message.includes('prisma') ||
      message.includes('query') ||
      message.includes('SELECT') ||
      message.includes('INSERT') ||
      message.includes('UPDATE') ||
      message.includes('DELETE')
    ) {
      return // Suppress these logs
    }
    
    // Allow other logs through
    originalConsole.log(...args)
  }

  console.info = (...args: any[]) => {
    const message = args.join(' ')
    
    // Filter out library info logs
    if (
      message.includes('supabase') ||
      message.includes('prisma') ||
      message.includes('realtime')
    ) {
      return
    }
    
    originalConsole.info(...args)
  }

  console.debug = (...args: any[]) => {
    // Suppress all debug logs in production
    return
  }

  // Also filter authentication logs if desired
  const originalLog = originalConsole.log
  console.log = (...args: any[]) => {
    const message = args.join(' ')

    // Filter out authentication and request logs if SUPPRESS_AUTH_LOGS is set
    if (process.env.SUPPRESS_AUTH_LOGS === 'true') {
      if (
        message.includes('Authenticated user found') ||
        message.includes('GET /api/') ||
        message.includes('POST /api/') ||
        message.includes('cache skip')
      ) {
        return
      }
    }

    // Apply the existing filtering
    if (
      message.includes('supabase') ||
      message.includes('prisma') ||
      message.includes('query') ||
      message.includes('SELECT') ||
      message.includes('INSERT') ||
      message.includes('UPDATE') ||
      message.includes('DELETE')
    ) {
      return
    }

    originalLog(...args)
  }

  // Keep warnings and errors as they are important
  console.warn = originalConsole.warn
  console.error = originalConsole.error
}

export {}

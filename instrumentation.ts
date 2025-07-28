/**
 * Next.js Instrumentation Hook
 * This runs before the application starts and can be used to suppress logs
 */

export async function register() {
  if (process.env.SUPPRESS_LOGS === 'true') {
    // Import our simple log filter to suppress logs at the earliest possible moment
    await import('./src/lib/simple-log-filter')
  }
}

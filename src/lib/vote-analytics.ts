/**
 * Lightweight vote analytics tracking
 * Tracks user interactions on /vote page for bias detection
 */

export interface VoteEvent {
  sessionId: string
  visitorId: string
  submissionId: string
  eventType: 'view' | 'vote' | 'skip'
  // Vote-specific data
  votedXp?: number
  buttonPosition?: 'left' | 'right' // Which side was clicked
  highXpPosition?: 'left' | 'right' // Where was high XP shown
  // Timing
  timeSpentMs?: number // Time from view to action
  timestamp: number
}

// Generate anonymous visitor ID (stored in localStorage)
export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'server'
  
  let visitorId = localStorage.getItem('vote_visitor_id')
  if (!visitorId) {
    visitorId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    localStorage.setItem('vote_visitor_id', visitorId)
  }
  return visitorId
}

// Generate session ID (new per page load)
let sessionId: string | null = null
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
  return sessionId
}

// Track event (fire and forget, non-blocking)
export async function trackVoteEvent(event: Omit<VoteEvent, 'sessionId' | 'visitorId' | 'timestamp'>): Promise<void> {
  try {
    const fullEvent: VoteEvent = {
      ...event,
      sessionId: getSessionId(),
      visitorId: getVisitorId(),
      timestamp: Date.now()
    }
    
    // Use sendBeacon for reliability (works even on page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/vote/analytics', JSON.stringify(fullEvent))
    } else {
      // Fallback to fetch
      fetch('/api/vote/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullEvent),
        keepalive: true
      }).catch(() => {}) // Ignore errors
    }
  } catch {
    // Silent fail - analytics should never break the app
  }
}

// Helper to track case view start time
const viewStartTimes = new Map<string, number>()

export function markCaseViewed(submissionId: string): void {
  viewStartTimes.set(submissionId, Date.now())
  trackVoteEvent({
    submissionId,
    eventType: 'view'
  })
}

export function getTimeSpent(submissionId: string): number {
  const startTime = viewStartTimes.get(submissionId)
  if (!startTime) return 0
  return Date.now() - startTime
}

export function clearViewTime(submissionId: string): void {
  viewStartTimes.delete(submissionId)
}

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubmissionStatusProps {
  submissionId: string
  initialStatus?: string
  className?: string
}

type SubmissionStatus = 'PROCESSING' | 'PENDING' | 'AI_REVIEWED' | 'UNDER_PEER_REVIEW' | 'FINALIZED' | 'FLAGGED' | 'REJECTED'

interface StatusConfig {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  color: string
  bgColor: string
  textColor: string
}

const aiDisabled = (process.env.NEXT_PUBLIC_AI_DISABLED || 'false').toLowerCase() === 'true'

const statusConfig: Record<SubmissionStatus, StatusConfig> = {
  PROCESSING: {
    icon: Loader2,
    label: 'Processing',
    description: 'Your submission is being processed and validated...',
    color: 'border-blue-200',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700'
  },
  PENDING: {
    icon: Clock,
    label: aiDisabled ? 'Awaiting Review' : 'AI Evaluation',
    description: aiDisabled
      ? 'Content validated and waiting for peer reviewers. Automated scoring is currently disabled.'
      : 'Content validated, evaluating with AI...',
    color: 'border-yellow-200',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700'
  },
  AI_REVIEWED: {
    icon: CheckCircle,
    label: aiDisabled ? 'Queued for Peer Review' : 'AI Complete',
    description: aiDisabled
      ? 'Submission is ready for peer review. Final XP will be determined 100% by the community.'
      : 'AI evaluation complete! Queued for peer review to determine final XP.',
    color: 'border-purple-200',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700'
  },
  UNDER_PEER_REVIEW: {
    icon: Clock,
    label: 'Peer Review',
    description: 'Your submission is being reviewed by peers...',
    color: 'border-indigo-200',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700'
  },
  FINALIZED: {
    icon: CheckCircle,
    label: 'Complete',
    description: aiDisabled
      ? 'Congratulations! Peer reviewers finalized your submission and awarded XP.'
      : 'Congratulations! Your submission is complete and final XP has been awarded.',
    color: 'border-green-200',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700'
  },
  REJECTED: {
    icon: XCircle,
    label: 'Needs Attention',
    description: 'Your submission needs attention. Please check the requirements and try again.',
    color: 'border-red-200',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700'
  },
  FLAGGED: {
    icon: AlertTriangle,
    label: 'Under Review',
    description: 'Your submission is under manual review.',
    color: 'border-orange-200',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700'
  }
}

export function SubmissionStatus({ submissionId, initialStatus, className }: SubmissionStatusProps) {
  const [status, setStatus] = useState<SubmissionStatus>(initialStatus as SubmissionStatus || 'PROCESSING')
  const [xpAwarded, setXpAwarded] = useState<number | null>(null)
  const [taskTypes, setTaskTypes] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // supabase is already imported

    // Subscribe to real-time updates for this submission
    const subscription = supabase
      .channel(`submission-${submissionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'Submission',
        filter: `id=eq.${submissionId}`
      }, (payload) => {
        console.log('📡 Real-time submission update:', payload.new)
        
        const newStatus = payload.new.status as SubmissionStatus
        setStatus(newStatus)
        
        if (payload.new.finalXp) {
          setXpAwarded(payload.new.finalXp)
        } else if (payload.new.aiXp) {
          setXpAwarded(payload.new.aiXp)
        }
        
        if (payload.new.taskTypes) {
          setTaskTypes(payload.new.taskTypes)
        }
      })
      .subscribe((status) => {
        console.log('📡 Subscription status:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe()
    }
  }, [submissionId])

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-all duration-200',
      config.color,
      config.bgColor,
      className
    )}>
      <div className="flex items-start space-x-3">
        <div className={cn('flex-shrink-0 mt-0.5', config.textColor)}>
          <Icon 
            className={cn(
              'h-5 w-5',
              status === 'PROCESSING' && 'animate-spin'
            )} 
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className={cn('text-sm font-medium', config.textColor)}>
              {config.label}
            </h3>
            
            {!isConnected && (
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                <span>Connecting...</span>
              </div>
            )}
            
            {isConnected && (
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Live</span>
              </div>
            )}
          </div>
          
          <p className={cn('text-sm mt-1', config.textColor)}>
            {config.description}
          </p>
          
          {/* Show XP and task types for completed submissions */}
          {(status === 'FINALIZED' || status === 'AI_REVIEWED') && (xpAwarded || taskTypes.length > 0) && (
            <div className="mt-3 space-y-2">
              {xpAwarded && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-green-700">
                    {status === 'FINALIZED'
                      ? 'Final XP:'
                      : aiDisabled
                        ? 'Initial XP (legacy):'
                        : 'AI XP:'}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    +{xpAwarded?.toLocaleString()} XP
                  </span>
                  {status === 'AI_REVIEWED' && !aiDisabled && (
                    <span className="text-xs text-gray-500">(pending peer review)</span>
                  )}
                </div>
              )}

              {taskTypes.length > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-green-700">Task Types:</span>
                  <div className="flex space-x-1">
                    {taskTypes.map((taskType) => (
                      <span
                        key={taskType}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {taskType}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Show processing time estimate for processing status */}
          {status === 'PROCESSING' && (
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-xs text-blue-600">
                <Clock className="h-3 w-3" />
                <span>Estimated time: 1-3 minutes</span>
              </div>
            </div>
          )}
          
          {/* Show next steps for rejected submissions */}
          {status === 'REJECTED' && (
            <div className="mt-3">
              <div className="text-xs text-red-600">
                <p className="font-medium">Common issues:</p>
                <ul className="mt-1 space-y-1 list-disc list-inside">
                  {/* <li>Missing @ScholarsOfMove mention</li> */}
                  {/* <li>Missing #ScholarsOfMove hashtag</li> */}
                  <li>Content too short or not Movement-related</li>
                  <li>Duplicate content</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SubmissionStatus

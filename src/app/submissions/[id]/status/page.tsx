'use client'

import { useEffect, useState } from 'react'
import { useRouter, notFound } from 'next/navigation'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { SubmissionStatus } from '@/components/SubmissionStatus'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface SubmissionStatusPageProps {
  params: {
    id: string
  }
}

interface SubmissionData {
  id: string
  url: string
  platform: string
  status: string
  taskTypes: string[]
  aiXp: number | null
  finalXp: number | null
  createdAt: string
  user: { id: string; username: string | null; email: string | null } | null
}

const aiDisabled = (process.env.NEXT_PUBLIC_AI_DISABLED || 'false').toLowerCase() === 'true'

export default function SubmissionStatusPage({ params }: SubmissionStatusPageProps) {
  const { user, isLoading } = usePrivyAuthSync()
  const router = useRouter()
  const [submission, setSubmission] = useState<SubmissionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    async function fetchSubmission() {
      if (!user?.privyUserId) return

      try {
        const response = await fetch(`/api/submissions/${params.id}`, {
          headers: {
            'X-Privy-User-Id': user.privyUserId
          }
        })

        if (!response.ok) {
          if (response.status === 404) {
            setError('not_found')
          } else if (response.status === 403) {
            setError('not_found') // Treat forbidden as not found for security
          } else {
            setError('Failed to load submission')
          }
          return
        }

        const data = await response.json()
        setSubmission(data)
      } catch {
        setError('Failed to load submission')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchSubmission()
    }
  }, [user, params.id])

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading submission...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (error === 'not_found' || !submission) {
    notFound()
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>

          <h1 className="text-2xl font-bold text-gray-900">
            Submission Status
          </h1>
          <p className="text-gray-600 mt-1">
            Track the progress of your content submission
          </p>
        </div>

        {/* Submission Details Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                Submission Details
              </h2>

              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-500">URL:</span>
                  <div className="mt-1">
                    <a
                      href={submission.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                    >
                      {submission.url}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-500">Platform:</span>
                  <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {submission.platform}
                  </span>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-500">Submitted:</span>
                  <span className="ml-2 text-sm text-gray-900">
                    {new Date(submission.createdAt).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-500">Submission ID:</span>
                  <span className="ml-2 text-sm font-mono text-gray-600">
                    {submission.id}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Status Component */}
        <SubmissionStatus
          submissionId={submission.id}
          initialStatus={submission.status}
          className="mb-6"
        />

        {/* Processing Timeline */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Processing Timeline
          </h3>

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Submission Received</p>
                <p className="text-xs text-gray-500">
                  {new Date(submission.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                ['PENDING', 'AI_REVIEWED', 'UNDER_PEER_REVIEW', 'FINALIZED', 'REJECTED', 'FLAGGED'].includes(submission.status)
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              }`}></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Content Validation</p>
                <p className="text-xs text-gray-500">
                  {['PENDING', 'AI_REVIEWED', 'UNDER_PEER_REVIEW', 'FINALIZED', 'REJECTED', 'FLAGGED'].includes(submission.status)
                    ? 'Completed'
                    : 'In Progress'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                (aiDisabled
                  ? ['UNDER_PEER_REVIEW', 'FINALIZED']
                  : ['AI_REVIEWED', 'UNDER_PEER_REVIEW', 'FINALIZED']
                ).includes(submission.status)
                  ? 'bg-green-500'
                  : submission.status === 'PENDING'
                  ? 'bg-yellow-500'
                  : 'bg-gray-300'
              }`}></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {aiDisabled ? 'Review Queue (AI disabled)' : 'AI Evaluation'}
                </p>
                <p className="text-xs text-gray-500">
                  {aiDisabled
                    ? ((['UNDER_PEER_REVIEW', 'FINALIZED'].includes(submission.status)
                        ? 'Completed'
                        : submission.status === 'PENDING'
                        ? 'Queued for peer reviewers'
                        : 'Pending')
                      )
                    : ((['AI_REVIEWED', 'UNDER_PEER_REVIEW', 'FINALIZED'].includes(submission.status)
                        ? 'Completed'
                        : submission.status === 'PENDING'
                        ? 'In Progress'
                        : 'Pending')
                      )
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                submission.status === 'FINALIZED'
                  ? 'bg-green-500'
                  : submission.status === 'UNDER_PEER_REVIEW'
                  ? 'bg-yellow-500'
                  : ['AI_REVIEWED'].includes(submission.status)
                  ? 'bg-gray-300'
                  : 'bg-gray-300'
              }`}></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Peer Review</p>
                <p className="text-xs text-gray-500">
                  {submission.status === 'FINALIZED' && 'Completed'}
                  {submission.status === 'UNDER_PEER_REVIEW' && 'In Progress'}
                  {submission.status === 'AI_REVIEWED' && 'Queued'}
                  {!['FINALIZED', 'UNDER_PEER_REVIEW', 'AI_REVIEWED'].includes(submission.status) && 'Pending'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
                submission.status === 'FINALIZED'
                  ? 'bg-green-500'
                  : submission.status === 'REJECTED'
                  ? 'bg-red-500'
                  : submission.status === 'FLAGGED'
                  ? 'bg-orange-500'
                  : 'bg-gray-300'
              }`}></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Final Result</p>
                <p className="text-xs text-gray-500">
                  {submission.status === 'FINALIZED' && 'Complete - Final XP Awarded'}
                  {submission.status === 'REJECTED' && 'Needs Attention - See Requirements'}
                  {submission.status === 'FLAGGED' && 'Under Manual Review'}
                  {!['FINALIZED', 'REJECTED', 'FLAGGED'].includes(submission.status) && 'Pending'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 mb-2">
            Need Help?
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            If your submission is taking longer than expected or you have questions about the process:
          </p>
          <div className="space-y-2 text-sm text-blue-700">
            {/* <p>- Check that your content includes @ScholarsOfMove mention and #ScholarsOfMove hashtag</p> */}
            <p>- Ensure your content is Movement ecosystem related and original</p>
            <p>- Processing typically takes 1-5 minutes during normal hours</p>
            <p>- Contact support if your submission has been processing for more than 10 minutes</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Weekly Management API Route - MIGRATED to Standardized Error Handling
 *
 * Part of the API Error Handling Standardization Initiative
 *
 * Changes Applied:
 * - Added withErrorHandling wrapper
 * - Standardized error response format
 * - Added proper validation with custom error classes
 * - Replaced manual error handling with structured approach
 */

import { processWeeklyReset, checkMissedReviews, getWeeklyInsights } from '@/lib/weekly-manager'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling, createSuccessResponse, validateRequiredFields } from '@/lib/api-middleware'
import { ValidationError } from '@/lib/api-error-handler'

export const POST = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const { action } = await request.json()

    validateRequiredFields({ action }, ['action'])

    switch (action) {
      case 'reset':
        const resetResult = await processWeeklyReset()
        return createSuccessResponse({
          message: 'Weekly reset completed successfully',
          result: resetResult
        })

      case 'check_missed_reviews':
        const missedCount = await checkMissedReviews()
        return createSuccessResponse({
          message: 'Missed reviews check completed',
          missedReviewsCount: missedCount
        })

      default:
        throw new ValidationError('Invalid action', {
          validActions: ['reset', 'check_missed_reviews'],
          receivedAction: action
        })
    }
  })
)

export const GET = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const weekNumber = weekParam ? parseInt(weekParam) : undefined

    const insights = await getWeeklyInsights(weekNumber)

    return createSuccessResponse(insights)
  })
)


import { aggregateXP, processReadySubmissions } from '@/lib/xp-aggregator'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { ValidationError } from '@/lib/api-error-handler'

export const POST = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const { submissionId, processAll } = await request.json()

    if (processAll) {
      // Process all ready submissions
      const processedCount = await processReadySubmissions()

      return createSuccessResponse({
        message: `Processed ${processedCount} submissions`,
        processedCount
      })
    }

    if (!submissionId) {
      throw new ValidationError('Submission ID is required when not processing all', {
        field: 'submissionId'
      })
    }

    // Process specific submission
    const result = await aggregateXP(submissionId)

    return createSuccessResponse({
      message: 'XP aggregation completed successfully',
      result
    })
  })
)


import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildAvailabilityFairnessBands,
  buildBaselineQueueViewModel,
  buildGenericPoolGroups,
  getReviewerAssignmentModeDescription,
  getReviewerAssignmentModeLabel,
  getReviewerAssignmentUiMode,
  type ReviewerAssignmentUiMode
} from '@/lib/reviewer-assignment-ui'
import { type AlgorithmId } from '@/lib/reviewer-fairness-algorithms'
import { formatReliabilityPercent } from '@/lib/reviewer-ranking'

interface ReviewerPoolBucketRecord {
  id: string
  username: string | null
  email: string
  totalXp: number
  activeAssignments?: number
  metrics?: {
    reliabilityScore?: number | null
  }
}

interface ReviewerPoolBucketsProps {
  reviewers: ReviewerPoolBucketRecord[]
  algorithmId?: AlgorithmId
  uiMode?: ReviewerAssignmentUiMode
}

function getDisplayName(reviewer: ReviewerPoolBucketRecord): string {
  return reviewer.username || reviewer.email.split('@')[0]
}

function formatReviewerStats(reviewer: ReviewerPoolBucketRecord): string {
  return `Active ${reviewer.activeAssignments || 0} · Reliability ${formatReliabilityPercent(reviewer.metrics?.reliabilityScore)} · XP ${reviewer.totalXp || 0}`
}

function ReviewerCard({ reviewer }: { reviewer: ReviewerPoolBucketRecord }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{getDisplayName(reviewer)}</p>
          <p className="text-xs text-muted-foreground">{formatReviewerStats(reviewer)}</p>
        </div>
      </div>
    </div>
  )
}

function ReviewerPoolBucketsBaseline({ reviewers }: { reviewers: ReviewerPoolBucketRecord[] }) {
  const { rankedReviewers, buckets } = buildBaselineQueueViewModel(reviewers)
  const topReviewers = rankedReviewers.slice(0, 3)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pool Buckets</CardTitle>
        <CardDescription>
          Live queue grouped by active workload. Inside each bucket, reviewers are ranked by reliability and then XP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {topReviewers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Likely Next Picks</p>
                <p className="text-xs text-muted-foreground">
                  These reviewers are currently at the front of the automatic assignment queue.
                </p>
              </div>
              <Badge variant="secondary">Live queue</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {topReviewers.map((reviewer, index) => (
                <div
                  key={reviewer.id}
                  className={`rounded-lg border p-4 ${index === 0 ? 'bg-muted/30' : 'bg-muted/20'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">#{index + 1} {getDisplayName(reviewer)}</p>
                      <p className="text-xs text-muted-foreground">{formatReviewerStats(reviewer)}</p>
                    </div>
                    {index === 0 && (
                      <Badge variant="secondary">First up</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {buckets.map(({ activeAssignments, reviewers: bucketReviewers }) => (
            <div key={activeAssignments} className="rounded-lg border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {activeAssignments === 0 ? '0 Active Assignments' : `${activeAssignments} Active Assignments`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bucketReviewers.length} reviewer{bucketReviewers.length === 1 ? '' : 's'} in this workload bucket
                  </p>
                </div>
                <Badge variant="secondary">
                  {activeAssignments === 0 ? 'Front of queue' : 'Queued after lower-workload buckets'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {bucketReviewers.map(reviewer => (
                  <div key={reviewer.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">#{reviewer.rank} {getDisplayName(reviewer)}</p>
                        <p className="text-xs text-muted-foreground">
                          Reliability {formatReliabilityPercent(reviewer.metrics?.reliabilityScore)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          XP {reviewer.totalXp || 0}
                        </p>
                      </div>
                      {reviewer.rank <= 3 && (
                        <Badge variant="secondary">Top 3</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewerPoolBucketsFairness({ reviewers }: { reviewers: ReviewerPoolBucketRecord[] }) {
  const bands = buildAvailabilityFairnessBands(reviewers)
  const { buckets } = buildBaselineQueueViewModel(reviewers)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Fairness Selection Bands</CardTitle>
        <CardDescription>
          Reviewers are drawn from O3 fairness bands rather than a single strict queue. Workload grouping is shown as context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 lg:grid-cols-3">
          {bands.map(band => (
            <div key={band.key} className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{band.label}</p>
                  <p className="text-xs text-muted-foreground">{band.description}</p>
                </div>
                <Badge variant="secondary">{band.candidates.length}</Badge>
              </div>

              <div className="space-y-3">
                {band.candidates.slice(0, 8).map((candidate, index) => (
                  <div key={candidate.id} className="rounded-lg border bg-background p-3">
                    <p className="text-xs text-muted-foreground">
                      {band.key === 'o3-seat-1' ? 'In seat-1 band' : band.key === 'o3-seat-2' ? 'In seat-2 band' : 'In fairness band'} · Order {index + 1}
                    </p>
                    <p className="truncate text-sm font-medium">{getDisplayName(candidate)}</p>
                    <p className="text-xs text-muted-foreground">{formatReviewerStats(candidate)}</p>
                  </div>
                ))}

                {band.candidates.length > 8 && (
                  <p className="text-xs text-muted-foreground">
                    +{band.candidates.length - 8} more in this band
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Workload context</p>
            <p className="text-xs text-muted-foreground">
              Active assignment buckets remain useful context, but they are not a guaranteed pick order.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
            {buckets.map(({ activeAssignments, reviewers: bucketReviewers }) => (
              <div key={activeAssignments} className="rounded-xl border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {activeAssignments === 0 ? '0 active assignments' : `${activeAssignments} active assignments`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bucketReviewers.length} reviewer{bucketReviewers.length === 1 ? '' : 's'} in this workload group
                    </p>
                  </div>
                  <Badge variant="secondary">Workload group</Badge>
                </div>

                <div className="space-y-3">
                  {bucketReviewers.slice(0, 6).map(candidate => (
                    <ReviewerCard key={candidate.id} reviewer={candidate} />
                  ))}
                  {bucketReviewers.length > 6 && (
                    <p className="text-xs text-muted-foreground">
                      +{bucketReviewers.length - 6} more in this group
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewerPoolBucketsGeneric({ reviewers }: { reviewers: ReviewerPoolBucketRecord[] }) {
  const groups = buildGenericPoolGroups(reviewers)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{getReviewerAssignmentModeLabel('generic')}</CardTitle>
        <CardDescription>{getReviewerAssignmentModeDescription('generic')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No eligible reviewers are currently available.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
            {groups.map(group => (
              <div key={group.key} className="rounded-xl border bg-background p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{group.label}</p>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                  <Badge variant="secondary">{group.candidates.length}</Badge>
                </div>

                <div className="space-y-3">
                  {group.candidates.slice(0, 8).map(candidate => (
                    <ReviewerCard key={candidate.id} reviewer={candidate} />
                  ))}
                  {group.candidates.length > 8 && (
                    <p className="text-xs text-muted-foreground">
                      +{group.candidates.length - 8} more in this group
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ReviewerPoolBuckets({
  reviewers,
  algorithmId,
  uiMode
}: ReviewerPoolBucketsProps) {
  const mode = uiMode ?? getReviewerAssignmentUiMode(algorithmId ?? 'baseline')

  if (mode === 'baseline') {
    return <ReviewerPoolBucketsBaseline reviewers={reviewers} />
  }

  if (mode === 'fairness') {
    return <ReviewerPoolBucketsFairness reviewers={reviewers} />
  }

  return <ReviewerPoolBucketsGeneric reviewers={reviewers} />
}

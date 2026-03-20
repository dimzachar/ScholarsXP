import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { compareReviewerPriorityValues, formatReliabilityPercent } from '@/lib/reviewer-ranking'

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
}

export default function ReviewerPoolBuckets({ reviewers }: ReviewerPoolBucketsProps) {
  const rankedReviewers = [...reviewers].sort((a, b) => {
    return compareReviewerPriorityValues(
      {
        activeAssignments: a.activeAssignments,
        reliabilityScore: a.metrics?.reliabilityScore,
        totalXp: a.totalXp
      },
      {
        activeAssignments: b.activeAssignments,
        reliabilityScore: b.metrics?.reliabilityScore,
        totalXp: b.totalXp
      }
    )
  })

  const topReviewers = rankedReviewers.slice(0, 3)

  const bucketEntries = Array.from(
    rankedReviewers.reduce((acc, reviewer, index) => {
      const key = reviewer.activeAssignments || 0
      const bucket = acc.get(key) ?? []
      bucket.push({ ...reviewer, rank: index + 1 })
      acc.set(key, bucket)
      return acc
    }, new Map<number, Array<ReviewerPoolBucketRecord & { rank: number }>>()).entries()
  ).sort(([a], [b]) => a - b)

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
                      <p className="font-medium">
                        #{index + 1} {reviewer.username || reviewer.email.split('@')[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Active {reviewer.activeAssignments || 0} · Reliability {formatReliabilityPercent(reviewer.metrics?.reliabilityScore)} · XP {reviewer.totalXp || 0}
                      </p>
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
          {bucketEntries.map(([bucketKey, bucketReviewers]) => (
            <div key={bucketKey} className="rounded-lg border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {bucketKey === 0 ? '0 Active Assignments' : `${bucketKey} Active Assignments`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bucketReviewers.length} reviewer{bucketReviewers.length === 1 ? '' : 's'} in this workload bucket
                  </p>
                </div>
                <Badge variant="secondary">
                  {bucketKey === 0 ? 'Front of queue' : 'Queued after lower-workload buckets'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {bucketReviewers.map(reviewer => (
                  <div key={reviewer.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          #{reviewer.rank} {reviewer.username || reviewer.email.split('@')[0]}
                        </p>
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

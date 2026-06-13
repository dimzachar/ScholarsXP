import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildGenericPoolGroups,
  buildO3ReplayBands,
  type ReplayBand,
  type ReviewerAssignmentSelectionMode
} from '@/lib/reviewer-assignment-ui'
import { formatReliabilityPercent } from '@/lib/reviewer-ranking'

interface SelectionReplayCandidate {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  reliabilityScore: number
  activeAssignmentsBefore: number
  recentAssignmentsBefore?: number
  currentAssignmentStatus?: string
  selected: boolean
  inPool: boolean
  priority?: number
  reasons: string[]
}

interface SelectionReplayEvent {
  key: string
  assignedAt: string
  algorithmId?: string
  selectionMode?: ReviewerAssignmentSelectionMode
  isReassignment?: boolean
  selectedCount: number
  selectedReviewerIds?: string[]
  selectedAssignments: Array<{
    assignmentId: string
    reviewerId: string
    reviewerName: string
    status: string
  }>
  baselineOrderedPool?: SelectionReplayCandidate[]
  bands?: ReplayBand<SelectionReplayCandidate>[]
  seatPicks?: Array<{
    seat: number
    label: string
    bandKey: string
    reviewerId: string | null
  }>
  candidates: SelectionReplayCandidate[]
  poolSize: number
  limitations: string[]
}

interface SubmissionSelectionReplay {
  submissionId: string
  selectionLogic: string
  limitations: string[]
  events: SelectionReplayEvent[]
}

interface SelectionReplayPanelProps {
  replay: SubmissionSelectionReplay | null
}

function formatReplayTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

function getSelectionMode(event: SelectionReplayEvent): ReviewerAssignmentSelectionMode {
  if (event.selectionMode) {
    return event.selectionMode
  }

  return event.algorithmId === 'baseline' ? 'baseline' : 'generic_fairness'
}

function formatCandidateStats(candidate?: SelectionReplayCandidate | null): string {
  if (!candidate) {
    return 'Reliability - · XP - · Active -'
  }

  return `Reliability ${formatReliabilityPercent(candidate.reliabilityScore)} · XP ${candidate.totalXp} · Active ${candidate.activeAssignmentsBefore}`
}

function getBaselineOrderedPool(event: SelectionReplayEvent): SelectionReplayCandidate[] {
  return event.baselineOrderedPool?.filter(candidate => candidate.inPool) ??
    event.candidates.filter(candidate => candidate.inPool)
}

function getSeatPickForReviewer(
  event: SelectionReplayEvent,
  reviewerId: string
): { seat: number; label: string; bandKey: string; reviewerId: string | null } | undefined {
  return event.seatPicks?.find(pick => pick.reviewerId === reviewerId)
}

function SelectionModeBadge({ mode }: { mode: ReviewerAssignmentSelectionMode }) {
  const label = mode === 'baseline'
    ? 'Baseline queue'
    : mode === 'o3_initial'
      ? 'O3 initial assignment'
      : mode === 'a3_reassignment'
        ? '3A reassignment'
        : 'Fairness selector'

  return <Badge variant="secondary">{label}</Badge>
}

function SelectedReviewerCard({
  event,
  selection,
  mode
}: {
  event: SelectionReplayEvent
  selection: {
    assignmentId: string
    reviewerId: string
    reviewerName: string
    status: string
  }
  mode: ReviewerAssignmentSelectionMode
}) {
  const details = event.candidates.find(item => item.id === selection.reviewerId)
  const seatPick = getSeatPickForReviewer(event, selection.reviewerId)

  return (
    <div key={selection.assignmentId} className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{selection.reviewerName}</p>
        {mode === 'o3_initial' ? (
          <Badge variant="secondary">{seatPick ? `Seat ${seatPick.seat}` : 'Selected'}</Badge>
        ) : mode === 'a3_reassignment' ? (
          <Badge variant="secondary">3A pick</Badge>
        ) : (
          <Badge variant="secondary">{mode === 'baseline' ? `#${details?.priority ?? '-'}` : 'Selected'}</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{formatCandidateStats(details)}</p>
      {mode === 'a3_reassignment' && (
        <p className="mt-1 text-xs text-muted-foreground">
          Recent assignments: {details?.recentAssignmentsBefore ?? '-'}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Current assignment status: {selection.status}</p>
    </div>
  )
}

function O3SeatPicksSection({ event }: { event: SelectionReplayEvent }) {
  if (!event.seatPicks?.length) {
    return null
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Seat picks</p>
        <p className="text-xs text-muted-foreground">
          Picks are deterministic for replay because O3 hashes the submission ID for each seat.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {event.seatPicks.map(pick => {
          const reviewer = event.candidates.find(candidate => candidate.id === pick.reviewerId)

          return (
            <div key={`${pick.seat}-${pick.reviewerId}`} className="rounded-xl border bg-background p-4">
              <p className="text-sm font-medium">Seat {pick.seat}</p>
              <p className="mt-1 truncate text-sm">{reviewer?.username ?? pick.reviewerId ?? 'No reviewer'}</p>
              <p className="mt-2 text-xs text-muted-foreground">{pick.label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CandidateCard({
  candidate,
  mode,
  index
}: {
  candidate: SelectionReplayCandidate
  mode: ReviewerAssignmentSelectionMode
  index: number
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${candidate.selected ? 'bg-muted/40' : 'bg-muted/20'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {mode === 'baseline'
              ? `#${candidate.priority} ${candidate.username}`
              : mode === 'a3_reassignment'
                ? `Tier item ${index + 1}: ${candidate.username}`
                : mode === 'generic_fairness'
                  ? `Pool item ${index + 1}: ${candidate.username}`
                  : candidate.username}
          </p>
          <p className="text-xs text-muted-foreground">
            Reliability {formatReliabilityPercent(candidate.reliabilityScore)} · XP {candidate.totalXp}
          </p>
          {mode === 'a3_reassignment' && (
            <p className="text-xs text-muted-foreground">
              Recent assignments: {candidate.recentAssignmentsBefore ?? '-'}
            </p>
          )}
        </div>
        {candidate.selected && <Badge variant="secondary">Selected</Badge>}
      </div>
    </div>
  )
}

function BaselinePoolBuckets({ event }: { event: SelectionReplayEvent }) {
  const buckets = useMemo(() => {
    const poolCandidates = getBaselineOrderedPool(event)
    const bucketMap = poolCandidates.reduce((acc, candidate) => {
      const key = String(candidate.activeAssignmentsBefore)
      const entry = acc.get(key) ?? []
      entry.push(candidate)
      acc.set(key, entry)
      return acc
    }, new Map<string, SelectionReplayCandidate[]>())

    return Array.from(bucketMap.entries())
      .map(([activeAssignmentsBefore, candidates]) => ({
        activeAssignmentsBefore: Number(activeAssignmentsBefore),
        candidates
      }))
      .sort((a, b) => a.activeAssignmentsBefore - b.activeAssignmentsBefore)
  }, [event])

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Pool buckets at selection time</p>
        <p className="text-xs text-muted-foreground">
          Reviewers are grouped by active workload first. Inside each bucket, higher reliability wins, then XP.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {buckets.map(bucket => (
          <div key={bucket.activeAssignmentsBefore} className="rounded-xl border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {bucket.activeAssignmentsBefore === 0 ? '0 Active · Front of queue' : `${bucket.activeAssignmentsBefore} Active`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bucket.candidates.length} eligible reviewer{bucket.candidates.length === 1 ? '' : 's'}
                </p>
              </div>
              {bucket.activeAssignmentsBefore === 0 && (
                <Badge variant="secondary">First gate</Badge>
              )}
            </div>

            <div className="space-y-3">
              {bucket.candidates.slice(0, 6).map((candidate, index) => (
                <CandidateCard key={candidate.id} candidate={candidate} mode="baseline" index={index} />
              ))}

              {bucket.candidates.length > 6 && (
                <p className="text-xs text-muted-foreground">
                  +{bucket.candidates.length - 6} more in this bucket
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BandList({
  bands,
  mode
}: {
  bands: ReplayBand<SelectionReplayCandidate>[]
  mode: Exclude<ReviewerAssignmentSelectionMode, 'baseline'>
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
      {bands.map(band => (
        <div key={band.key} className="rounded-xl border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">{band.label}</p>
              <p className="text-xs text-muted-foreground">{band.description}</p>
            </div>
            <Badge variant="secondary">{band.candidates.length}</Badge>
          </div>

          <div className="space-y-3">
            {band.candidates.slice(0, 8).map((candidate, index) => (
              <CandidateCard key={candidate.id} candidate={candidate} mode={mode} index={index} />
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
  )
}

function GenericPoolGroups({ event }: { event: SelectionReplayEvent }) {
  const groups = useMemo(
    () => buildGenericPoolGroups(getBaselineOrderedPool(event).map(candidate => ({
      ...candidate,
      activeAssignments: candidate.activeAssignmentsBefore
    }))),
    [event]
  )

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Eligible pool by workload</p>
        <p className="text-xs text-muted-foreground">
          This assignment used the active fairness selector. Queue-style rank is not shown because this algorithm is not a strict ordered queue.
        </p>
      </div>
      <BandList bands={groups} mode="generic_fairness" />
    </div>
  )
}

function ReplayLimitations({ event }: { event: SelectionReplayEvent }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Replay limitations</p>
      <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
        {event.limitations.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export default function SelectionReplayPanel({ replay }: SelectionReplayPanelProps) {
  const initialEventKey = replay?.events[0]?.key ?? null
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(initialEventKey)
  const selectedEventKeyForRender = replay?.events.some(event => event.key === selectedEventKey) ? selectedEventKey : replay?.events[0]?.key ?? null

  const selectedEvent = useMemo(() => {
    if (!replay?.events.length) {
      return null
    }

    return replay.events.find(event => event.key === selectedEventKeyForRender) ?? replay.events[0]
  }, [replay, selectedEventKeyForRender])

  if (!replay || replay.events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Selection Replay</CardTitle>
          <CardDescription>No assignment events are available for replay on this submission yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Selection Replay</CardTitle>
        <CardDescription>{replay.selectionLogic}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {replay.events.map((event, index) => (
            <Button
              key={event.key}
              variant={selectedEvent?.key === event.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedEventKey(event.key)}
            >
              Snapshot {index + 1} · {new Date(event.assignedAt).toLocaleDateString()}
            </Button>
          ))}
        </div>

        {selectedEvent && (() => {
          const mode = getSelectionMode(selectedEvent)

          return (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Assignment time</p>
                  <p className="mt-1 font-medium">{formatReplayTimestamp(selectedEvent.assignedAt)}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Algorithm</p>
                  <p className="mt-1 font-medium">{selectedEvent.algorithmId ?? 'unknown'}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Selection mode</p>
                  <div className="mt-1">
                    <SelectionModeBadge mode={mode} />
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Eligible pool size</p>
                  <p className="mt-1 font-medium">{selectedEvent.poolSize}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Chosen reviewers</p>
                  <p className="text-xs text-muted-foreground">These assignments were created in this exact run.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {selectedEvent.selectedAssignments.map(selection => (
                    <SelectedReviewerCard key={selection.assignmentId} event={selectedEvent} selection={selection} mode={mode} />
                  ))}
                </div>
              </div>

              {mode === 'o3_initial' && (
                <O3SeatPicksSection event={selectedEvent} />
              )}

              {mode === 'baseline' && (
                <BaselinePoolBuckets event={selectedEvent} />
              )}

              {mode === 'o3_initial' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">O3 selection bands</p>
                    <p className="text-xs text-muted-foreground">
                      Eligible reviewers are first ordered by workload, reliability, and XP, then selected using O3 fairness bands.
                    </p>
                  </div>
                  <BandList bands={selectedEvent.bands ?? buildO3ReplayBands(getBaselineOrderedPool(selectedEvent))} mode="o3_initial" />
                </div>
              )}

              {mode === 'a3_reassignment' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">3A reassignment tiers</p>
                    <p className="text-xs text-muted-foreground">
                      Within the same active workload tier, reviewers with fewer recent assignments are preferred before reliability and XP tie-breakers.
                    </p>
                  </div>
                  <BandList bands={selectedEvent.bands ?? []} mode="a3_reassignment" />
                </div>
              )}

              {mode === 'generic_fairness' && (
                <GenericPoolGroups event={selectedEvent} />
              )}

              <ReplayLimitations event={selectedEvent} />
            </>
          )
        })()}
      </CardContent>
    </Card>
  )
}

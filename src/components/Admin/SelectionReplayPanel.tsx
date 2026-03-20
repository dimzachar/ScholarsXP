import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatReliabilityPercent } from '@/lib/reviewer-ranking'

interface SelectionReplayCandidate {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  reliabilityScore: number
  activeAssignmentsBefore: number
  currentAssignmentStatus?: string
  selected: boolean
  inPool: boolean
  priority?: number
  reasons: string[]
}

interface SelectionReplayEvent {
  key: string
  assignedAt: string
  selectedCount: number
  selectedAssignments: Array<{
    assignmentId: string
    reviewerId: string
    reviewerName: string
    status: string
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

export default function SelectionReplayPanel({ replay }: SelectionReplayPanelProps) {
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(replay?.events[0]?.key ?? null)

  useEffect(() => {
    if (replay?.events[0]?.key) {
      setSelectedEventKey(current => {
        if (!current) {
          return replay.events[0].key
        }

        return replay.events.some(event => event.key === current)
          ? current
          : replay.events[0].key
      })
    }
  }, [replay])

  const selectedEvent = useMemo(() => {
    if (!replay?.events.length) {
      return null
    }

    return replay.events.find(event => event.key === selectedEventKey) ?? replay.events[0]
  }, [replay, selectedEventKey])

  const buckets = useMemo(() => {
    if (!selectedEvent) {
      return []
    }

    const poolCandidates = selectedEvent.candidates.filter(candidate => candidate.inPool)
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
  }, [selectedEvent])

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

        {selectedEvent && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Assignment time</p>
                <p className="mt-1 font-medium">{formatReplayTimestamp(selectedEvent.assignedAt)}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Eligible pool size</p>
                <p className="mt-1 font-medium">{selectedEvent.poolSize}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Selected in this run</p>
                <p className="mt-1 font-medium">{selectedEvent.selectedCount}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Chosen reviewers</p>
                <p className="text-xs text-muted-foreground">These assignments were created in this exact run.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {selectedEvent.selectedAssignments.map(selection => {
                  const details = selectedEvent.candidates.find(item => item.id === selection.reviewerId)

                  return (
                    <div key={selection.assignmentId} className="rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{selection.reviewerName}</p>
                        <Badge variant="secondary">
                          #{details?.priority ?? '-'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reliability {formatReliabilityPercent(details?.reliabilityScore)} · XP {details?.totalXp ?? '-'} · Active {details?.activeAssignmentsBefore ?? '-'}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Current assignment status: {selection.status}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Pool buckets at selection time</p>
                <p className="text-xs text-muted-foreground">
                  Reviewers are grouped by active workload first. Inside each bucket, higher reliability wins, then XP.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
                {buckets.map(bucket => (
                  <div
                    key={bucket.activeAssignmentsBefore}
                    className="rounded-xl border bg-background p-4"
                  >
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
                      {bucket.candidates.slice(0, 6).map(candidate => (
                        <div
                          key={candidate.id}
                          className={`rounded-lg border px-3 py-2 ${candidate.selected ? 'bg-muted/40' : 'bg-muted/20'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                #{candidate.priority} {candidate.username}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Reliability {formatReliabilityPercent(candidate.reliabilityScore)} · XP {candidate.totalXp}
                              </p>
                            </div>
                            {candidate.selected && <Badge variant="secondary">Selected</Badge>}
                          </div>
                        </div>
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

            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-medium">Replay limitations</p>
              <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                {selectedEvent.limitations.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

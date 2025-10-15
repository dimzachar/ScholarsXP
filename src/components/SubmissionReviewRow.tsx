"use client"

import { useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Twitter,
  Users
} from "lucide-react"
import PeerReviewCard from "@/components/PeerReviewCard"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Submission {
  id: string
  url: string
  platform: string
  taskTypes: string[]
  aiXp: number
  originalityScore?: number
  user: {
    username: string
  }
  createdAt: string
  assignedReviewers?: Array<{
    id: string
    username?: string | null
    email?: string | null
  }>
}

interface ReviewCriteria {
  originality: number
  quality: number
  relevance: number
  educational: number
}

interface AssignmentMeta {
  id: string
  deadline: string
  timeRemaining?: { hours: number; minutes: number }
  isOverdue?: boolean
  weekendExtension?: boolean
  status?: "PENDING" | "IN_PROGRESS" | "MISSED" | "COMPLETED"
}

interface ReviewSubmissionPayload {
  xpScore: number
  comments: string
  criteria: ReviewCriteria
  timeSpent: number
  qualityRating: number
  category?: "strategy" | "guide" | "technical"
  tier?: "basic" | "average" | "awesome"
  isRejected?: boolean
}

export interface SubmissionReviewRowProps {
  submission: Submission
  assignment?: AssignmentMeta
  open?: boolean
  onOpenChange?: (open: boolean) => void
  readOnly?: boolean
  onReviewSubmit: (submissionId: string, reviewData: ReviewSubmissionPayload) => void
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "Twitter") return <Twitter className="h-3.5 w-3.5" aria-hidden="true" />
  if (platform === "Medium") return <FileText className="h-3.5 w-3.5" aria-hidden="true" />
  return <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
}

const shortenString = (value: string, max = 48) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value

function formatDisplayUrl(rawUrl: string) {
  if (!rawUrl) return ""

  const ensureProtocol = (value: string) =>
    value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`

  try {
    const parsed = new URL(ensureProtocol(rawUrl))
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/$/, "") : ""
    const suffix = parsed.search || parsed.hash ? "…" : ""
    const combined = `${parsed.hostname}${path}${suffix}`
    return shortenString(combined)
  } catch (error) {
    return shortenString(rawUrl)
  }
}

const getInitials = (value: string) => {
  const segments = value
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
  if (segments.length === 0) return "?"
  return segments
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("")
}

const reviewerPillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-[12px] font-medium text-foreground/80 shadow-sm"

export default function SubmissionReviewRow({
  submission,
  assignment,
  open,
  onOpenChange,
  readOnly,
  onReviewSubmit
}: SubmissionReviewRowProps) {
  const deadlineLabel = useMemo(() => {
    if (!assignment) return null
    if (assignment.status === "MISSED") {
      return { text: "Missed deadline", tone: "destructive" as const, isMissed: true as const }
    }
    if (assignment.isOverdue) {
      return { text: "Overdue", tone: "destructive" as const }
    }
    if (assignment.timeRemaining) {
      const { hours, minutes } = assignment.timeRemaining
      const weekendSuffix = assignment.weekendExtension ? " (due to weekend)" : ""
      return { text: `${hours}h ${minutes}m left${weekendSuffix}`, tone: hours < 6 ? ("warning" as const) : ("secondary" as const) }
    }
    return null
  }, [assignment])

  const displayUrl = useMemo(() => formatDisplayUrl(submission.url), [submission.url])
  const assignedReviewers = useMemo(
    () =>
      (submission.assignedReviewers || [])
        .slice(0, 3)
        .map((reviewer, index) => {
          const displayName = (reviewer?.username || reviewer?.email || "Unknown reviewer").trim()
          const shortLabel = shortenString(displayName, 14)
          const initials = getInitials(displayName)

          return {
            id: reviewer?.id || `${displayName}-${index}`,
            displayName,
            shortLabel,
            initials
          }
        }),
    [submission.assignedReviewers]
  )

  const isMissedAssignment = assignment?.status === "MISSED"
  const DeadlineIcon = deadlineLabel?.isMissed ? AlertTriangle : Clock

  return (
    <Card className={cn("border-0 shadow-sm", isMissedAssignment && "ring-1 ring-destructive/40 bg-destructive/5")}>
      <CardContent className="p-0">
        {/* Row summary */}
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
            isMissedAssignment ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/50"
          )}
          aria-expanded={open}
          onClick={() => onOpenChange?.(!open)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Badge variant="outline" className="shrink-0 flex items-center gap-1">
              <PlatformIcon platform={submission.platform} />
              {submission.platform}
            </Badge>
            <div className="hidden sm:flex items-center gap-2">
              {submission.taskTypes?.slice(0, 3).map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
              {submission.taskTypes?.length > 3 && (
                <Badge variant="secondary">+{submission.taskTypes.length - 3}</Badge>
              )}
            </div>
            <div className="min-w-0 flex flex-col">
              <span
                className="truncate text-sm text-primary max-w-[220px] sm:max-w-[280px]"
                title={submission.url}
              >
                {displayUrl}
              </span>
              {isMissedAssignment && (
                <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Missed
                </span>
              )}
              {assignedReviewers.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground sm:hidden">
                  <Users className="h-3 w-3 text-muted-foreground/80" aria-hidden="true" />
                  <span className="uppercase tracking-wide text-[10px] font-semibold text-muted-foreground/80">
                    Reviewers
                  </span>
                  {assignedReviewers.map((reviewer) => (
                    <span
                      key={reviewer.id}
                      className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/90"
                      title={reviewer.displayName}
                    >
                      {reviewer.shortLabel}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {(readOnly || assignedReviewers.length > 0) && (
            <TooltipProvider>
              <div className="hidden md:flex min-w-[240px] max-w-[360px] items-center justify-end gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1 text-muted-foreground/70 whitespace-nowrap">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                    Reviewers
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {assignedReviewers.length > 0 ? (
                    assignedReviewers.map((reviewer) => (
                      <Tooltip key={reviewer.id}>
                        <TooltipTrigger asChild>
                          <span className={reviewerPillClass}>
                            <Avatar className="h-6 w-6 border border-border/60 bg-background">
                              <AvatarFallback className="text-[11px] font-semibold text-foreground/80">
                                {reviewer.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate max-w-[120px]" aria-hidden="true">
                              {reviewer.shortLabel}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start">
                          {reviewer.displayName}
                        </TooltipContent>
                      </Tooltip>
                    ))
                  ) : (
                    <Badge
                      variant="outline"
                      className="px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 border-dashed"
                    >
                      Unassigned
                    </Badge>
                  )}
                </div>
              </div>
            </TooltipProvider>
          )}
          <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate max-w-[140px]">{submission.user.username}</span>
            <span>•</span>
            <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
            {deadlineLabel && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded border",
                deadlineLabel.tone === "destructive" && "text-destructive border-destructive/30",
                deadlineLabel.tone === "warning" && "text-warning border-warning/30",
                deadlineLabel.tone === "secondary" && "text-foreground/70 border-border/60"
              )}>
                <DeadlineIcon className="h-3 w-3" aria-hidden="true" /> {deadlineLabel.text}
              </span>
            )}
          </div>
          <span
            aria-hidden
            className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {/* Expanded content: lazy mount */}
        {open && (
          <div className="px-4 pb-4">
            <PeerReviewCard
              submission={submission}
              assignment={assignment}
              readOnly={readOnly}
              onReviewSubmit={onReviewSubmit}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

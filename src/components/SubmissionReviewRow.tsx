"use client"

import { useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronRight, Clock, ExternalLink, FileText, Twitter } from "lucide-react"
import PeerReviewCard from "@/components/PeerReviewCard"
import { cn } from "@/lib/utils"

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
    if (assignment.isOverdue) return { text: "Overdue", tone: "destructive" as const }
    if (assignment.timeRemaining) {
      const { hours, minutes } = assignment.timeRemaining
      const weekendSuffix = assignment.weekendExtension ? " (due to weekend)" : ""
      return { text: `${hours}h ${minutes}m left${weekendSuffix}`, tone: hours < 6 ? ("warning" as const) : ("secondary" as const) }
    }
    return null
  }, [assignment])

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        {/* Row summary */}
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 text-left",
            "hover:bg-muted/50 transition-colors"
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
            <span className="truncate text-sm text-primary">
              {submission.url}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate max-w-[160px]">{submission.user.username}</span>
            <span>·</span>
            <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
            {deadlineLabel && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded border",
                deadlineLabel.tone === "destructive" && "text-destructive border-destructive/30",
                deadlineLabel.tone === "warning" && "text-warning border-warning/30",
                deadlineLabel.tone === "secondary" && "text-foreground/70 border-border/60"
              )}>
                <Clock className="h-3 w-3" aria-hidden="true" /> {deadlineLabel.text}
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

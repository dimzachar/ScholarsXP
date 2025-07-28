'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  Edit, 
  User, 
  Clock, 
  Star,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Users
} from 'lucide-react'
import ReviewerScoreEditor from './ReviewerScoreEditor'

interface PeerReview {
  id: string
  reviewerId: string
  xpScore: number
  comments: string | null
  timeSpent: number | null
  qualityRating: number | null
  isLate: boolean
  createdAt: string
  reviewer: {
    username: string
    email: string
  }
}

interface PeerReviewsSectionProps {
  submissionId: string
  peerReviews: PeerReview[]
  onUpdate: () => void
}

export default function PeerReviewsSection({ 
  submissionId, 
  peerReviews, 
  onUpdate 
}: PeerReviewsSectionProps) {
  const [editingReview, setEditingReview] = useState<PeerReview | null>(null)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-blue-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>
    if (score >= 60) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>
    if (score >= 40) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>
  }

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground text-sm">Not rated</span>
    
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-sm text-muted-foreground">({rating}/5)</span>
      </div>
    )
  }

  const averageScore = peerReviews.length > 0 
    ? Math.round(peerReviews.reduce((sum, review) => sum + review.xpScore, 0) / peerReviews.length)
    : 0

  const averageQuality = peerReviews.filter(r => r.qualityRating).length > 0
    ? peerReviews
        .filter(r => r.qualityRating)
        .reduce((sum, review) => sum + (review.qualityRating || 0), 0) / 
      peerReviews.filter(r => r.qualityRating).length
    : null

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Peer Reviews ({peerReviews.length})
              </CardTitle>
              <CardDescription>
                Individual reviewer scores with edit capabilities
              </CardDescription>
            </div>
            {peerReviews.length > 0 && (
              <div className="text-right">
                <div className={`text-2xl font-bold ${getScoreColor(averageScore)}`}>
                  {averageScore}
                </div>
                <div className="text-sm text-muted-foreground">Average Score</div>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {peerReviews.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div className="text-lg font-medium mb-2">No Peer Reviews Yet</div>
              <div className="text-sm">
                This submission is waiting for peer review assignments and completions.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              {peerReviews.length > 1 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg mb-6">
                  <div className="text-center">
                    <div className="text-lg font-bold">{averageScore}</div>
                    <div className="text-sm text-muted-foreground">Avg Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold">
                      {averageQuality ? averageQuality.toFixed(1) : 'N/A'}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Quality</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-600">
                      {peerReviews.filter(r => r.isLate).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Late</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {peerReviews.filter(r => r.comments).length}
                    </div>
                    <div className="text-sm text-muted-foreground">With Comments</div>
                  </div>
                </div>
              )}

              {/* Individual Reviews */}
              {peerReviews.map((review) => (
                <div key={review.id} className="p-4 border rounded-lg hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {review.reviewer.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{review.reviewer.username}</div>
                        <div className="text-sm text-muted-foreground">
                          {review.reviewer.email}
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditingReview(review)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                    {/* XP Score */}
                    <div className="text-center p-3 bg-muted/50 rounded">
                      <div className={`text-2xl font-bold ${getScoreColor(review.xpScore)}`}>
                        {review.xpScore}
                      </div>
                      <div className="text-sm text-muted-foreground">XP Score</div>
                      {getScoreBadge(review.xpScore)}
                    </div>

                    {/* Quality Rating */}
                    <div className="text-center p-3 bg-muted/50 rounded">
                      <div className="mb-2">
                        {renderStars(review.qualityRating)}
                      </div>
                      <div className="text-sm text-muted-foreground">Quality</div>
                    </div>

                    {/* Time Spent */}
                    <div className="text-center p-3 bg-muted/50 rounded">
                      <div className="text-lg font-medium">
                        {review.timeSpent ? `${review.timeSpent}m` : 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">Time Spent</div>
                    </div>
                  </div>

                  {/* Comments */}
                  {review.comments && (
                    <div className="mb-3 p-3 bg-blue-50 rounded border-l-4 border-blue-200">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div>
                          <div className="text-sm font-medium text-blue-800 mb-1">Comments</div>
                          <div className="text-sm text-blue-700">{review.comments}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(review.createdAt)}
                      </div>
                      {review.isLate && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Late
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      Completed
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Editor Dialog */}
      {editingReview && (
        <ReviewerScoreEditor
          open={!!editingReview}
          onOpenChange={(open) => !open && setEditingReview(null)}
          review={editingReview}
          submissionId={submissionId}
          onSuccess={() => {
            onUpdate()
            setEditingReview(null)
          }}
        />
      )}
    </>
  )
}

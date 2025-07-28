'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, User, RefreshCw, Star } from 'lucide-react'

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

interface ReviewerScoreEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  review: PeerReview
  submissionId: string
  onSuccess: () => void
}

export default function ReviewerScoreEditor({
  open,
  onOpenChange,
  review,
  submissionId,
  onSuccess
}: ReviewerScoreEditorProps) {
  const [newScore, setNewScore] = useState(review.xpScore.toString())
  const [newComments, setNewComments] = useState(review.comments || '')
  const [newQualityRating, setNewQualityRating] = useState(review.qualityRating?.toString() || '')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const validateInput = () => {
    const errors: string[] = []
    const scoreValue = parseInt(newScore)
    const qualityValue = newQualityRating ? parseInt(newQualityRating) : null

    // Validate XP score
    if (isNaN(scoreValue)) {
      errors.push('XP score must be a valid number')
    } else {
      if (scoreValue < 0) {
        errors.push('XP score cannot be negative')
      }
      if (scoreValue > 100) {
        errors.push('XP score cannot exceed 100 points')
      }
    }

    // Validate quality rating if provided
    if (qualityValue !== null) {
      if (isNaN(qualityValue) || qualityValue < 1 || qualityValue > 5) {
        errors.push('Quality rating must be between 1 and 5')
      }
    }

    // Validate reason
    if (!reason.trim()) {
      errors.push('Reason for modification is required')
    } else if (reason.trim().length < 5) {
      errors.push('Reason must be at least 5 characters long')
    }

    setValidationErrors(errors)
    return errors.length === 0
  }

  const handleSubmit = async () => {
    if (!validateInput()) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const scoreValue = parseInt(newScore)
      const qualityValue = newQualityRating ? parseInt(newQualityRating) : null

      const requestBody = {
        xpScore: scoreValue,
        comments: newComments.trim() || null,
        qualityRating: qualityValue,
        reason: reason.trim()
      }

      const response = await fetch(`/api/admin/submissions/${submissionId}/peer-reviews/${review.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update peer review')
      }

      // Success
      onSuccess()
      onOpenChange(false)
      resetForm()

    } catch (error) {
      console.error('Error updating peer review:', error)
      setError(error instanceof Error ? error.message : 'Failed to update peer review')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setNewScore(review.xpScore.toString())
    setNewComments(review.comments || '')
    setNewQualityRating(review.qualityRating?.toString() || '')
    setReason('')
    setError(null)
    setValidationErrors([])
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  const scoreDifference = parseInt(newScore) - review.xpScore
  const isScoreIncrease = scoreDifference > 0
  const hasChanges = scoreDifference !== 0 || 
                    newComments !== (review.comments || '') ||
                    (newQualityRating ? parseInt(newQualityRating) : null) !== review.qualityRating

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground">Not rated</span>
    
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
        <span className="ml-1 text-sm">({rating}/5)</span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Edit Peer Review
          </DialogTitle>
          <DialogDescription>
            Modify the peer review score and details from {review.reviewer.username}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Reviewer Info */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">{review.reviewer.username}</div>
                <div className="text-sm text-muted-foreground">{review.reviewer.email}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Submitted</div>
                <div className="text-sm">{formatDate(review.createdAt)}</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {review.isLate && (
                <Badge variant="destructive">Late Submission</Badge>
              )}
              {review.timeSpent && (
                <Badge variant="outline">{review.timeSpent} min</Badge>
              )}
            </div>
          </div>

          {/* Current vs New Score */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Current Score</div>
              <div className="text-2xl font-bold">{review.xpScore}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">New Score</div>
              <div className={`text-2xl font-bold ${
                isNaN(parseInt(newScore)) ? 'text-muted-foreground' : 
                isScoreIncrease ? 'text-green-600' : 
                scoreDifference < 0 ? 'text-red-600' : 'text-blue-600'
              }`}>
                {isNaN(parseInt(newScore)) ? '—' : parseInt(newScore)}
              </div>
            </div>
          </div>

          {/* Score Difference Indicator */}
          {!isNaN(parseInt(newScore)) && scoreDifference !== 0 && (
            <div className={`text-center p-2 rounded-lg ${
              isScoreIncrease ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              <div className="font-medium">
                {isScoreIncrease ? '+' : ''}{scoreDifference} point change
              </div>
            </div>
          )}

          {/* XP Score Input */}
          <div className="space-y-2">
            <Label htmlFor="newScore">XP Score (0-100)</Label>
            <Input
              id="newScore"
              type="number"
              min="0"
              max="100"
              value={newScore}
              onChange={(e) => setNewScore(e.target.value)}
              placeholder="Enter new XP score"
            />
          </div>

          {/* Quality Rating */}
          <div className="space-y-2">
            <Label htmlFor="qualityRating">Quality Rating (1-5)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="qualityRating"
                type="number"
                min="1"
                max="5"
                value={newQualityRating}
                onChange={(e) => setNewQualityRating(e.target.value)}
                placeholder="1-5"
                className="w-20"
              />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">Current:</div>
                {renderStars(review.qualityRating)}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label htmlFor="comments">Review Comments</Label>
            <Textarea
              id="comments"
              value={newComments}
              onChange={(e) => setNewComments(e.target.value)}
              placeholder="Update review comments..."
              rows={4}
            />
            {review.comments && (
              <div className="text-sm text-muted-foreground">
                <strong>Original:</strong> {review.comments}
              </div>
            )}
          </div>

          {/* Reason for Change */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Modification *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this peer review is being modified..."
              rows={3}
            />
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !hasChanges || validationErrors.length > 0}
          >
            {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Update Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import PeerReviewCard from '@/components/PeerReviewCard'
import AuthGuard from '@/components/Auth/AuthGuard'
import { ReviewerGuard } from '@/components/Auth/RoleGuard'
import { api, handleApiError } from '@/lib/api-client'
import { 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Star,
  TrendingUp,
  Award
} from 'lucide-react'

interface Submission {
  id: string
  url: string
  platform: string
  taskTypes: string[]
  aiXp: number
  user: {
    username: string
  }
  createdAt: string
}

export default function ReviewPage() {
  const [pendingReviews, setPendingReviews] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchPendingReviews()
  }, [])

  const fetchPendingReviews = async () => {
    try {
      const data = await api.get('/api/peer-reviews/pending')
      setPendingReviews(data.submissions || [])
    } catch (error) {
      console.error('Error fetching pending reviews:', error)
      setMessage(handleApiError(error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleReviewSubmit = async (submissionId: string, xpScore: number, comments: string) => {
    try {
      await api.post('/api/peer-reviews', {
        submissionId,
        xpScore,
        comments,
      })

      setMessage('Review submitted successfully! +5 XP earned')
      // Remove the reviewed submission from the list
      setPendingReviews(prev => prev.filter(sub => sub.id !== submissionId))
    } catch (error) {
      console.error('Error submitting review:', error)
      setMessage(handleApiError(error).message)
    }
  }

  if (loading) {
    return (
      <AuthGuard>
        <ReviewerGuard>
          <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Users className="h-4 w-4" />
                  <span>Loading Reviews</span>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-4">Peer Review Dashboard</h1>
                <p className="text-muted-foreground">Loading pending reviews...</p>
              </div>
            </div>
          </div>
        </ReviewerGuard>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <ReviewerGuard>
        <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Users className="h-4 w-4" />
            <span>Community Reviews</span>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Peer Review Dashboard{' '}
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Help validate submissions from fellow scholars and earn XP for your contributions
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-primary/20 rounded-lg">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pendingReviews.length}</p>
                  <p className="text-muted-foreground">Pending Reviews</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-success/20 rounded-lg">
                  <Star className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">+5</p>
                  <p className="text-muted-foreground">XP per Review</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-destructive/20 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">72h</p>
                  <p className="text-muted-foreground">Deadline</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg border flex items-center gap-3 ${
            message.includes('successfully') 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {message.includes('successfully') ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            <p className="font-medium">{message}</p>
          </div>
        )}

        {pendingReviews.length === 0 ? (
          <div className="text-center py-16">
            <Card className="border-0 shadow-xl max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">No Pending Reviews</h2>
                <p className="text-muted-foreground mb-6">
                  Great job! You're all caught up. Check back later for new submissions to review.
                </p>
                <div className="space-y-2">
                  <Badge variant="outline" className="mr-2">
                    <Award className="h-3 w-3 mr-1" />
                    All Reviews Complete
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Review Instructions */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-muted/50 to-muted">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Review Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Quality Assessment</p>
                      <p className="text-muted-foreground">Evaluate content depth and educational value</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Originality Check</p>
                      <p className="text-muted-foreground">Ensure content is original and not AI-generated</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                    <div>
                      <p className="font-medium">Fair Scoring</p>
                      <p className="text-muted-foreground">Rate based on effort and community value</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Review Cards */}
            {pendingReviews.map((submission) => (
              <PeerReviewCard
                key={submission.id}
                submission={submission}
                onReviewSubmit={handleReviewSubmit}
              />
            ))}
          </div>
        )}
        </div>
        </div>
      </ReviewerGuard>
    </AuthGuard>
  )
}


'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { detectPlatform } from '@/lib/utils'
import { apiPost } from '@/lib/api-client'
import {
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Twitter,
  FileText
} from 'lucide-react'

export default function SubmissionForm() {
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)

  const platform = detectPlatform(url)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    setProgress(0)

    // Basic validation
    if (!url) {
      setMessage('Please enter a URL')
      setIsSubmitting(false)
      return
    }

    if (!platform) {
      setMessage('Only Twitter/X and Medium links are supported')
      setIsSubmitting(false)
      return
    }

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 10
      })
    }, 200)

    try {
      const result = await apiPost('/api/submissions', { url })

      clearInterval(progressInterval)
      setProgress(100)

      setMessage('Content submitted successfully! Your submission is being reviewed.')
      setUrl('')

      // Reset progress after success
      setTimeout(() => setProgress(0), 2000)
    } catch (error: any) {
      clearInterval(progressInterval)
      setProgress(0)
      setMessage(error.message || 'An error occurred while submitting')
    }

    setIsSubmitting(false)
  }

  const getPlatformIcon = () => {
    if (platform === 'Twitter') return <Twitter className="h-4 w-4" />
    if (platform === 'Medium') return <FileText className="h-4 w-4" />
    return <ExternalLink className="h-4 w-4" />
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground block">
            Content URL
          </label>
          <div className="relative">
            <Input
              type="url"
              placeholder="https://twitter.com/... or https://medium.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isSubmitting}
              className="pr-24 h-14 text-base border-2 border-input focus:border-ring rounded-xl shadow-sm"
            />
            {platform && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <Badge variant="outline" className="flex items-center gap-2 bg-background border-2 px-3 py-1">
                  {getPlatformIcon()}
                  <span className="font-medium">{platform}</span>
                </Badge>
              </div>
            )}
          </div>

          {url && !platform && (
            <div className="flex items-center gap-3 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Only Twitter/X and Medium links are supported</span>
            </div>
          )}
        </div>

        {isSubmitting && (
          <div className="space-y-3 bg-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm text-primary">
              <span className="font-medium">Processing submission...</span>
              <span className="font-bold">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3 bg-primary/20" />
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting || !platform}
          className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-3 h-5 w-5" />
              Submit Content
            </>
          )}
        </Button>
      </form>

      {message && (
        <div className={`flex items-center gap-4 p-5 rounded-xl border-2 shadow-sm ${
          message.includes('successfully')
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-destructive/10 border-destructive/30 text-destructive'
        }`}>
          {message.includes('successfully') ? (
            <div className="p-2 bg-primary rounded-full">
              <CheckCircle className="h-5 w-5 text-primary-foreground" />
            </div>
          ) : (
            <div className="p-2 bg-destructive rounded-full">
              <AlertCircle className="h-5 w-5 text-destructive-foreground" />
            </div>
          )}
          <p className="text-base font-semibold">{message}</p>
        </div>
      )}

      {/* Quick Tips */}
      <div className="bg-gradient-to-r from-muted/50 to-muted border-2 border-border rounded-xl p-6 shadow-sm">
        <h4 className="font-bold text-foreground mb-4 flex items-center gap-3 text-lg">
          <div className="p-2 bg-primary rounded-lg">
            <CheckCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          Quick Tips
        </h4>
        <ul className="text-base text-foreground space-y-3">
          <li className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <span>Include the <code className="bg-muted px-2 py-1 rounded font-mono text-sm">#ScholarXP</code> hashtag in your content</span>
          </li>
          <li className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <span>Ensure your content is original and educational</span>
          </li>
          <li className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <span>Higher quality content earns more XP</span>
          </li>
        </ul>
      </div>
    </div>
  )
}


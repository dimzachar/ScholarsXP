'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { MobileInput, MobileForm } from '@/components/ui/mobile-input'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { detectPlatform } from '@/lib/utils'
import { apiPost } from '@/lib/api-client'
import {
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Twitter,
  FileText,
  MessageSquare,
  Briefcase,
  Zap,
  Clock,
  Users,
  Star,
  Info,
  TrendingUp
} from 'lucide-react'

// Task type configurations matching /review page design
const TASK_TYPES = {
  A: {
    name: 'Twitter',
    description: '5+ tweets in a thread OR a Twitter Article',
    xpRange: '30-150 XP',
    icon: Twitter,
    bgClass: 'bg-primary/10',
    textClass: 'text-primary'
  },
  B: {
    name: 'Reddit / Notion / Medium',
    description: '2000+ characters of quality content',
    xpRange: '60-250 XP',
    icon: FileText,
    bgClass: 'bg-secondary/10',
    textClass: 'text-secondary-foreground'
  }
}

export default function SubmissionForm() {
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const { isMobile } = useResponsiveLayout()

  const platform = detectPlatform(url)
  const detectedTask = platform ? (
    ['Twitter', 'X'].includes(platform) ? 'A' : 
    ['Medium', 'Reddit', 'Notion'].includes(platform) ? 'B' : null
  ) : null

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
      setMessage('Only Twitter/X, Medium, Reddit, Notion, and LinkedIn links are supported')
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
      await apiPost('/api/submissions', { url })

      clearInterval(progressInterval)
      setProgress(100)

      setMessage('Content submitted successfully! Your submission is being reviewed.')
      setUrl('')

      // Reset progress after success
      setTimeout(() => setProgress(0), 2000)
    } catch (error: unknown) {
      clearInterval(progressInterval)
      setProgress(0)
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while submitting'
      setMessage(errorMessage)
    }

    setIsSubmitting(false)
  }

  return (
    <div className={isMobile ? "space-y-6" : "space-y-8"}>
      {/* Task Types - matching /review page design */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {Object.entries(TASK_TYPES).map(([taskId, task]) => {
          const isActive = detectedTask === taskId
          const TaskIcon = task.icon
          return (
            <div
              key={taskId}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                isActive ? "border-primary bg-primary/5" : "border-transparent"
              }`}
            >
              <div className={`mt-0.5 rounded-md p-2 ${task.bgClass} ${task.textClass}`}>
                <TaskIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  Task {taskId} — {task.name}
                  {isActive && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">Detected</Badge>
                  )}
                </div>
                <p className="text-muted-foreground">{task.description}</p>
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  {task.xpRange}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>

      {/* Content Categories Info */}
      <div className={`bg-muted/50 rounded-xl border border-border ${isMobile ? 'p-4' : 'p-4'}`}>
        <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" />
          Content Categories
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="flex items-start gap-2 text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">Strategy</span>
              <p className="text-muted-foreground leading-tight">Trading, DeFi strategies, market analysis</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">Guide</span>
              <p className="text-muted-foreground leading-tight">How-to tutorials, walkthroughs, setup guides</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <Zap className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">Technical</span>
              <p className="text-muted-foreground leading-tight">Protocol deep-dives, smart contract analysis</p>
            </div>
          </div>
        </div>
      </div>

      <MobileForm onSubmit={handleSubmit}>
        <MobileInput
          type="url"
          label="Content URL"
          placeholder="https://twitter.com/... or https://reddit.com/... or https://medium.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isSubmitting}
          error={url && !platform ? "Only Twitter/X, Medium, Reddit, Notion, and LinkedIn links are supported" : undefined}
          badge={platform ? {
            text: platform,
            icon: platform === 'Twitter' ? Twitter :
                  platform === 'Medium' ? FileText :
                  platform === 'Reddit' ? MessageSquare :
                  platform === 'Notion' ? FileText :
                  platform === 'LinkedIn' ? Briefcase : ExternalLink,
            variant: 'outline'
          } : undefined}
          mobileOptimized={true}
        />

        {isSubmitting && (
          <div className={`space-y-3 bg-primary/10 border border-primary/20 rounded-lg ${isMobile ? 'p-3' : 'p-4'}`}>
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
          className={`w-full ${isMobile ? 'h-12' : 'h-14'} ${isMobile ? 'text-base' : 'text-lg'} font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl`}
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className={`mr-3 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'} animate-spin`} />
              Submitting...
            </>
          ) : (
            <>
              <Send className={`mr-3 ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
              Submit Content
            </>
          )}
        </Button>
      </MobileForm>

      {message && (
        <div className={`flex items-center gap-4 ${isMobile ? 'p-4' : 'p-5'} rounded-xl border-2 shadow-sm ${
          message.includes('successfully')
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-red-50 border-red-300 text-red-800 dark:bg-destructive/10 dark:border-destructive/30 dark:text-destructive'
        }`}>
          {message.includes('successfully') ? (
            <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-primary rounded-full`}>
              <CheckCircle className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} text-primary-foreground`} />
            </div>
          ) : (
            <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-red-600 dark:bg-destructive rounded-full`}>
              <AlertCircle className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} text-white dark:text-destructive-foreground`} />
            </div>
          )}
          <p className={`${isMobile ? 'text-sm' : 'text-base'} font-semibold`}>{message}</p>
        </div>
      )}

      {/* Quick Tips */}
      <div className={`bg-gradient-to-r from-muted/50 to-muted border-2 border-border rounded-xl ${isMobile ? 'p-4' : 'p-6'} shadow-sm`}>
        <h4 className={`font-bold text-foreground mb-4 flex items-center gap-3 ${isMobile ? 'text-base' : 'text-lg'}`}>
          <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-primary rounded-lg`}>
            <Star className="h-4 w-4 text-primary-foreground" />
          </div>
          How It Works
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</div>
            <div className="text-xs">
              <p className="font-medium text-foreground">Submit</p>
              <p className="text-muted-foreground">Paste your content URL</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</div>
            <div className="text-xs">
              <p className="font-medium text-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Peer Review
              </p>
              <p className="text-muted-foreground">3 reviewers evaluate within 48h</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</div>
            <div className="text-xs">
              <p className="font-medium text-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" /> Earn XP
              </p>
              <p className="text-muted-foreground">Quality determines your reward</p>
            </div>
          </div>
        </div>
        <div className={`${isMobile ? 'text-sm' : 'text-base'} text-muted-foreground space-y-2 border-t border-border pt-3`}>
          <p className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
            <span>Original, educational content earns higher XP</span>
          </p>
          <p className="flex items-center gap-2">
            <Clock className="h-3 w-3 text-amber-500 shrink-0" />
            <span>Max 5 submissions per week</span>
          </p>
        </div>
      </div>
    </div>
  )
}


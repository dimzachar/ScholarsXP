'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Zap, BookOpen, Users, Trophy, ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import { usePrivyAuth } from '@/hooks/usePrivyAuth'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'

export default function LandingPage() {
  const { login, isAuthenticated, isLoading: privyLoading, isReady } = usePrivyAuth()
  const { user, isLoading: syncLoading } = usePrivyAuthSync()
  const router = useRouter()

  // Redirect authenticated users to dashboard
  useEffect(() => {
    // Redirect if authenticated via Privy (user sync will happen in background)
    if (isAuthenticated && !privyLoading && !syncLoading) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, privyLoading, syncLoading, router])

  const handleSignIn = () => {
    if (!isReady || privyLoading) return
    login()
  }

  const isLoading = privyLoading || syncLoading

  // If user is authenticated, show redirecting state (ConditionalLayout will show the main nav)
  if (isAuthenticated || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl text-primary">
              ScholarXP
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <Button onClick={handleSignIn} disabled={!isReady || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            <span>Gamified Content Recognition</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Submit Your Content,{' '}
            <span className="text-primary">
              Earn XP
            </span>
          </h1>

          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Turn your published content into XP rewards. Submit links to your Twitter threads, Medium articles,
            and Reddit posts to earn points based on quality and build your scholar reputation.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8 py-3" onClick={handleSignIn} disabled={!isReady || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8 py-3">
              Learn More
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Quality-Based Scoring</CardTitle>
              <CardDescription>
                Submit your published content and receive XP scores based on quality, depth, and educational value
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Peer Review Network</CardTitle>
              <CardDescription>
                Join a community of reviewers who evaluate submissions and help maintain quality standards
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="h-6 w-6 text-purple-600" />
              </div>
              <CardTitle>Gamified Progress</CardTitle>
              <CardDescription>
                Build weekly streaks, climb leaderboards, and unlock achievements as you submit quality content
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* How It Works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-foreground mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Submit Your Links</h3>
              <p className="text-muted-foreground">Paste URLs of your published content from Twitter, Medium, Reddit, or Notion</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Get Evaluated</h3>
              <p className="text-muted-foreground">Your content gets reviewed and scored based on quality, originality, and task type</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Earn XP & Compete</h3>
              <p className="text-muted-foreground">Receive XP points, build streaks, and climb the leaderboard with quality submissions</p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <Card className="border-0 shadow-lg mb-16">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Key Features</CardTitle>
            <CardDescription>Turn your existing content into measurable achievements and recognition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Content Portfolio</h4>
                  <p className="text-sm text-muted-foreground">Showcase your published work and get recognition for quality content</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Quality Scoring</h4>
                  <p className="text-sm text-muted-foreground">Receive objective scores based on content depth, originality, and educational value</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Progress Tracking</h4>
                  <p className="text-sm text-muted-foreground">Monitor your XP growth, weekly performance, and content improvement over time</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Competitive Recognition</h4>
                  <p className="text-sm text-muted-foreground">Build streaks, earn achievements, and compete on leaderboards with fellow creators</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center bg-primary rounded-2xl p-12 text-primary-foreground">
          <h2 className="text-3xl font-bold mb-4">Ready to Gamify Your Content?</h2>
          <p className="text-xl mb-8 opacity-90">Start submitting your published work and earning XP for quality content!</p>
          <Button size="lg" variant="secondary" className="text-lg px-8 py-3" onClick={handleSignIn} disabled={!isReady || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                Start Earning XP - It&apos;s Free!
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-background/80 backdrop-blur-sm mt-16">
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
          <p>&copy; 2025 ScholarXP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

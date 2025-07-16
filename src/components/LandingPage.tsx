'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Zap, BookOpen, Users, Trophy, Star, ArrowRight, CheckCircle } from 'lucide-react'

export default function LandingPage() {
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
            <Link href="/login">
              <Button>
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="h-4 w-4" />
            <span>Powered by AI & Community</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Submit Content,{' '}
            <span className="text-primary">
              Earn XP
            </span>
          </h1>

          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Get your academic work evaluated by AI and peers. Track your progress,
            build streaks, and climb the leaderboard while improving your skills.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="text-lg px-8 py-3">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
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
              <CardTitle>AI-Powered Evaluation</CardTitle>
              <CardDescription>
                Get instant, detailed feedback on your submissions using advanced AI analysis
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Peer Review System</CardTitle>
              <CardDescription>
                Review others' work and get reviewed by your peers for comprehensive feedback
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="h-6 w-6 text-purple-600" />
              </div>
              <CardTitle>XP & Leaderboards</CardTitle>
              <CardDescription>
                Earn experience points, build streaks, and compete with others to stay motivated
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
              <h3 className="text-xl font-semibold mb-2">Submit Your Work</h3>
              <p className="text-muted-foreground">Upload your academic content, essays, or projects for evaluation</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Get Feedback</h3>
              <p className="text-muted-foreground">Receive detailed AI analysis and peer reviews on your submission</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Earn XP & Improve</h3>
              <p className="text-muted-foreground">Gain experience points, track progress, and continuously improve</p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <Card className="border-0 shadow-lg mb-16">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Why Choose ScholarXP?</CardTitle>
            <CardDescription>Join thousands of learners improving their academic skills</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Instant Feedback</h4>
                  <p className="text-sm text-muted-foreground">Get immediate AI-powered analysis of your work</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Community Learning</h4>
                  <p className="text-sm text-muted-foreground">Learn from peers through collaborative review</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Progress Tracking</h4>
                  <p className="text-sm text-muted-foreground">Monitor your improvement with detailed analytics</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold">Gamified Experience</h4>
                  <p className="text-sm text-muted-foreground">Stay motivated with XP, streaks, and leaderboards</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA Section */}
        <div className="text-center bg-primary rounded-2xl p-12 text-primary-foreground">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Your Learning Journey?</h2>
          <p className="text-xl mb-8 opacity-90">Join our community and start earning XP today!</p>
          <Link href="/login">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-3">
              Sign Up Now - It's Free!
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-background/80 backdrop-blur-sm mt-16">
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
          <p>&copy; 2024 ScholarXP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

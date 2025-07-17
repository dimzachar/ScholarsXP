'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Award,
  Trophy,
  Star,
  Target,
  Zap,
  Users,
  BookOpen,
  Flame,
  Crown,
  ArrowLeft,
  RefreshCw,
  Filter,
  Calendar,
  TrendingUp
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Achievement {
  id: string
  name: string
  description: string
  category: string
  iconUrl?: string
  xpReward: number
  isActive: boolean
}

interface AchievementProgress {
  achievement: Achievement
  progress: number
  target: number
  percentage: number
  isCompleted: boolean
  earnedAt?: string
}

export default function AchievementsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [achievementsData, setAchievementsData] = useState<any>(null)
  const [loadingAchievements, setLoadingAchievements] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

  useEffect(() => {
    if (user) {
      fetchAchievementsData()
    }
  }, [user, selectedCategory, selectedStatus])

  const fetchAchievementsData = async () => {
    try {
      setLoadingAchievements(true)
      
      const params = new URLSearchParams()
      if (selectedCategory !== 'all') params.append('category', selectedCategory)
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      
      const response = await fetch(`/api/user/achievements?${params.toString()}`)
      
      if (response.ok) {
        const data = await response.json()
        setAchievementsData(data)
      }
    } catch (error) {
      console.error('Error fetching achievements data:', error)
    } finally {
      setLoadingAchievements(false)
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'SUBMISSION': return <BookOpen className="h-5 w-5" />
      case 'REVIEW': return <Users className="h-5 w-5" />
      case 'STREAK': return <Flame className="h-5 w-5" />
      case 'MILESTONE': return <Target className="h-5 w-5" />
      case 'SPECIAL': return <Crown className="h-5 w-5" />
      default: return <Award className="h-5 w-5" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'SUBMISSION': return 'text-info bg-info/10 border-info/20'
      case 'REVIEW': return 'text-success bg-success/10 border-success/20'
      case 'STREAK': return 'text-warning bg-warning/10 border-warning/20'
      case 'MILESTONE': return 'text-purple bg-purple/10 border-purple/20'
      case 'SPECIAL': return 'text-warning bg-warning/10 border-warning/20'
      default: return 'text-muted-foreground bg-muted border-border'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    router.push('/auth')
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Trophy className="h-8 w-8 text-yellow-600" />
                Achievements
              </h1>
              <p className="text-muted-foreground">
                Track your progress and unlock badges for your accomplishments
              </p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={fetchAchievementsData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Overview */}
        {achievementsData?.stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
              <CardContent className="p-4 text-center">
                <Trophy className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-yellow-700">
                  {achievementsData.stats.earned}
                </div>
                <div className="text-sm text-yellow-600">Earned</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <Target className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">
                  {achievementsData.stats.inProgress}
                </div>
                <div className="text-sm text-blue-600">In Progress</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <CardContent className="p-4 text-center">
                <Zap className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-green-700">
                  {achievementsData.stats.totalXpFromAchievements}
                </div>
                <div className="text-sm text-green-600">XP from Achievements</div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <CardContent className="p-4 text-center">
                <Star className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-purple-700">
                  {Math.round((achievementsData.stats.earned / achievementsData.stats.total) * 100)}%
                </div>
                <div className="text-sm text-purple-600">Completion Rate</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Category:</span>
            {['all', 'SUBMISSION', 'REVIEW', 'STREAK', 'MILESTONE', 'SPECIAL'].map(category => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
              >
                {category === 'all' ? 'All' : category.charAt(0) + category.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            {['all', 'earned', 'in_progress', 'available'].map(status => (
              <Button
                key={status}
                variant={selectedStatus === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedStatus(status)}
              >
                {status === 'all' ? 'All' : 
                 status === 'in_progress' ? 'In Progress' :
                 status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {loadingAchievements ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-2 bg-gray-200 rounded w-full"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Tabs defaultValue="gallery" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
              <TabsTrigger value="progress">Progress</TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>

            {/* Gallery Tab */}
            <TabsContent value="gallery" className="mt-6">
              {achievementsData?.achievements && achievementsData.achievements.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {achievementsData.achievements.map((achievementProgress: AchievementProgress) => (
                    <Card 
                      key={achievementProgress.achievement.id}
                      className={`transition-all duration-300 hover:shadow-lg ${
                        achievementProgress.isCompleted 
                          ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200' 
                          : 'hover:shadow-md'
                      }`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className={`h-16 w-16 rounded-full flex items-center justify-center ${
                            achievementProgress.isCompleted 
                              ? 'bg-yellow-100 text-yellow-600' 
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {getCategoryIcon(achievementProgress.achievement.category)}
                          </div>
                          
                          <div className="flex-1 space-y-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold">{achievementProgress.achievement.name}</h3>
                                {achievementProgress.isCompleted && (
                                  <Badge className="bg-yellow-100 text-yellow-800">
                                    Earned!
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {achievementProgress.achievement.description}
                              </p>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Progress</span>
                                <span>
                                  {achievementProgress.progress}/{achievementProgress.target}
                                </span>
                              </div>
                              <Progress 
                                value={achievementProgress.percentage} 
                                className="h-2"
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <Badge 
                                variant="outline" 
                                className={getCategoryColor(achievementProgress.achievement.category)}
                              >
                                {achievementProgress.achievement.category}
                              </Badge>
                              <Badge variant="outline" className="text-green-600">
                                +{achievementProgress.achievement.xpReward} XP
                              </Badge>
                            </div>
                            
                            {achievementProgress.earnedAt && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Earned {new Date(achievementProgress.earnedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      No achievements found for the selected filters.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Progress Tab */}
            <TabsContent value="progress" className="mt-6">
              {achievementsData?.nextToEarn && achievementsData.nextToEarn.length > 0 ? (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Next to Earn
                      </CardTitle>
                      <CardDescription>
                        Achievements you're closest to completing
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {achievementsData.nextToEarn.map((achievement: AchievementProgress) => (
                          <div key={achievement.achievement.id} className="p-4 border rounded-lg">
                            <div className="flex items-center gap-4 mb-3">
                              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                                {getCategoryIcon(achievement.achievement.category)}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium">{achievement.achievement.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {achievement.achievement.description}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-blue-600">
                                {achievement.percentage}%
                              </Badge>
                            </div>
                            <Progress value={achievement.percentage} className="h-3" />
                            <div className="flex justify-between text-xs text-muted-foreground mt-2">
                              <span>{achievement.progress} / {achievement.target}</span>
                              <span>+{achievement.achievement.xpReward} XP when earned</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category Progress */}
                  {achievementsData?.categoryStats && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Progress by Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {achievementsData.categoryStats.map((category: any) => (
                            <div key={category.category} className="space-y-2">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  {getCategoryIcon(category.category)}
                                  <span className="font-medium">{category.category}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {category.earned}/{category.total} ({category.percentage}%)
                                </div>
                              </div>
                              <Progress value={category.percentage} className="h-2" />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Target className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      All available achievements have been earned!
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Recent Tab */}
            <TabsContent value="recent" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Recently Earned
                  </CardTitle>
                  <CardDescription>
                    Your latest achievement unlocks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {achievementsData?.recentlyEarned && achievementsData.recentlyEarned.length > 0 ? (
                    <div className="space-y-4">
                      {achievementsData.recentlyEarned.map((achievement: any) => (
                        <div key={achievement.id} className="flex items-center gap-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center">
                            <Award className="h-6 w-6 text-yellow-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{achievement.achievement.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {achievement.achievement.description}
                            </p>
                            <p className="text-xs text-yellow-600 mt-1">
                              Earned {new Date(achievement.earnedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge className="bg-yellow-100 text-yellow-800">
                            +{achievement.achievement.xpReward} XP
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No recent achievements. Keep working to unlock more!
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Insights Tab */}
            <TabsContent value="insights" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Achievement Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {achievementsData?.insights ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <div className="text-lg font-bold text-blue-600">
                              {achievementsData.insights.achievementVelocity}
                            </div>
                            <div className="text-xs text-blue-600">Per Week</div>
                          </div>
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <div className="text-lg font-bold text-green-600">
                              {achievementsData.insights.averageXpPerAchievement}
                            </div>
                            <div className="text-xs text-green-600">Avg XP</div>
                          </div>
                        </div>
                        
                        {achievementsData.insights.daysToNextAchievement && (
                          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                            <h4 className="font-medium text-purple-900 mb-1">Next Achievement</h4>
                            <p className="text-sm text-purple-700">
                              Estimated {achievementsData.insights.daysToNextAchievement} days to your next achievement
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No insights available yet</p>
                    )}
                  </CardContent>
                </Card>

                {/* Milestones */}
                <Card>
                  <CardHeader>
                    <CardTitle>Milestones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {achievementsData?.milestones ? (
                      <div className="space-y-4">
                        {achievementsData.milestones.firstAchievement && (
                          <div className="p-3 bg-green-50 rounded-lg">
                            <h4 className="font-medium text-green-900">First Achievement</h4>
                            <p className="text-sm text-green-700">
                              {achievementsData.milestones.firstAchievement.achievement.name}
                            </p>
                            <p className="text-xs text-green-600">
                              {new Date(achievementsData.milestones.firstAchievement.earnedAt).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                        
                        {achievementsData.milestones.mostValuableAchievement && (
                          <div className="p-3 bg-yellow-50 rounded-lg">
                            <h4 className="font-medium text-yellow-900">Most Valuable</h4>
                            <p className="text-sm text-yellow-700">
                              {achievementsData.milestones.mostValuableAchievement.achievement.name}
                            </p>
                            <p className="text-xs text-yellow-600">
                              +{achievementsData.milestones.mostValuableAchievement.achievement.xpReward} XP
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No milestones yet</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

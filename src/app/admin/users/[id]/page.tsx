'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { MobileLayout, MobileSection, MobileCardGrid } from '@/components/layout/MobileLayout'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { toast } from 'sonner'
import {
  ArrowLeft,
  User,
  Mail,
  Calendar,
  Activity,
  Trophy,
  FileText,
  MessageSquare,
  Shield,
  Crown,
  
  Edit,
  UserX,
  UserCheck
} from 'lucide-react'

interface UserProfileData {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  currentWeekXp: number
  streakWeeks: number
  createdAt: string
  lastActiveAt: string | null
  profileImageUrl?: string
  bio?: string
  metrics: {
    weeklyXp: number
    submissionSuccessRate: number
    avgReviewScore: number
    daysSinceLastActive: number | null
    activityStatus: string
    totalSubmissions: number
    totalReviews: number
    totalAchievements: number
  }
  recentSubmissions: Array<{
    id: string
    title: string
    status: string
    finalXp: number
    createdAt: string
    isLegacy?: boolean
  }>
  recentReviews: Array<{
    id: string
    submissionTitle: string
    xpScore: number
    createdAt: string
  }>
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string
  const { isMobile, isTablet: _isTablet } = useResponsiveLayout()
  const { authenticatedFetch } = useAuthenticatedFetch()

  const [user, setUser] = useState<UserProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [editRoleDialog, setEditRoleDialog] = useState(false)
  const [deactivateDialog, setDeactivateDialog] = useState(false)
  const [newRole, setNewRole] = useState<string>('')
  const [updating, setUpdating] = useState(false)

  const fetchUserProfile = useCallback(async () => {
    try {
      setLoading(true)
      const response = await authenticatedFetch(`/api/admin/users/${userId}`)

      if (!response.ok) {
        if (response.status === 404) {
          setError('User not found')
        } else {
          setError('Failed to load user profile')
        }
        return
      }

      const userData = await response.json()
      setUser(userData)
    } catch (error) {
      console.error('Error fetching user profile:', error)
      setError('Network error occurred')
    } finally {
      setLoading(false)
    }
  }, [userId, authenticatedFetch])

  useEffect(() => {
    fetchUserProfile()
  }, [fetchUserProfile])

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Crown className="h-3 w-3" />
      case 'REVIEWER': return <Shield className="h-3 w-3" />
      default: return <User className="h-3 w-3" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'REVIEWER': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getActivityColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success/10 text-success'
      case 'recent': return 'bg-warning/10 text-warning'
      case 'inactive': return 'bg-destructive/10 text-destructive'
      case 'deactivated': return 'bg-red-100 text-red-800 border border-red-200'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'PROCESSING': return 'bg-blue-100 text-blue-800'
      case 'FLAGGED': return 'bg-red-100 text-red-800'
      case 'REJECTED': return 'bg-gray-100 text-gray-800'
      case 'LEGACY_IMPORTED': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleEditRole = () => {
    if (user) {
      setNewRole(user.role)
      setEditRoleDialog(true)
    }
  }

  const handleToggleStatus = () => {
    setDeactivateDialog(true)
  }

  const confirmRoleChange = async () => {
    if (!user || !newRole || updating) return

    try {
      setUpdating(true)
      const response = await authenticatedFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole })
      })

      if (!response.ok) {
        throw new Error('Failed to update user role')
      }

      // Update local state
      setUser(prev => prev ? { ...prev, role: newRole } : null)
      setEditRoleDialog(false)

      // Show success message
      toast.success(`User role updated to ${newRole}`)
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error('Failed to update user role')
    } finally {
      setUpdating(false)
    }
  }

  const confirmStatusToggle = async () => {
    if (!user || updating) return

    try {
      setUpdating(true)
      const isDeactivating = user.metrics.activityStatus !== 'deactivated'

      const response = await authenticatedFetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: isDeactivating ? 'deactivate' : 'reactivate'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update user status')
      }

      // Update local state
      setUser(prev => prev ? {
        ...prev,
        metrics: {
          ...prev.metrics,
          activityStatus: isDeactivating ? 'deactivated' : 'active'
        }
      } : null)
      setDeactivateDialog(false)

      // Show success message
      const action = isDeactivating ? 'deactivated' : 'reactivated'
      toast.success(`User ${action} successfully`)
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Failed to update user status')
    } finally {
      setUpdating(false)
    }
  }

  const handleViewSubmissions = () => {
    router.push(`/admin/submissions?userId=${userId}`)
  }

  if (loading) {
    return (
      <MobileLayout>
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className={isMobile ? "min-h-11 px-3" : ""}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="space-y-6">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </MobileLayout>
    )
  }

  if (error || !user) {
    return (
      <MobileLayout>
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className={isMobile ? "min-h-11 px-3" : ""}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className={isMobile ? "p-4 text-center" : "p-6 text-center"}>
            <h2 className={isMobile ? "text-lg font-semibold mb-2" : "text-xl font-semibold mb-2"}>
              User Not Found
            </h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button
              onClick={() => router.push('/admin/users')}
              className={isMobile ? "min-h-11" : ""}
            >
              Return to User Management
            </Button>
          </CardContent>
        </Card>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      {/* Header */}
      <MobileSection spacing="tight">
        <div className={isMobile ? "space-y-4" : "flex items-center justify-between"}>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className={isMobile ? "min-h-11 px-3" : ""}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className={isMobile ? "text-xl font-bold" : "text-2xl font-bold"}>
                User Profile
              </h1>
              <p className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                Detailed user information and activity
              </p>
            </div>
          </div>
          <div className={isMobile ? "flex gap-2 w-full" : "flex gap-2"}>
            <Button
              variant="outline"
              onClick={handleEditRole}
              className={isMobile ? "min-h-11 flex-1" : ""}
            >
              <Edit className="h-4 w-4 mr-2" />
              {isMobile ? "Edit" : "Edit Role"}
            </Button>
            <Button
              variant="outline"
              onClick={handleToggleStatus}
              className={`${isMobile ? "min-h-11 flex-1" : ""} ${
                user.metrics.activityStatus === 'deactivated' ? "text-green-600" : "text-orange-600"
              }`}
            >
              {user.metrics.activityStatus === 'deactivated' ? (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  {isMobile ? "Activate" : "Reactivate"}
                </>
              ) : (
                <>
                  <UserX className="h-4 w-4 mr-2" />
                  Deactivate
                </>
              )}
            </Button>
          </div>
        </div>
      </MobileSection>

      {/* User Overview Card */}
      <MobileSection spacing="normal">
        <Card>
          <CardContent className={isMobile ? "p-4" : "p-6"}>
            <div className={isMobile ? "space-y-4" : "flex items-start gap-6"}>
              <Avatar className={isMobile ? "h-16 w-16 mx-auto" : "h-20 w-20"}>
                <AvatarImage src={user.profileImageUrl} />
                <AvatarFallback className={isMobile ? "text-base" : "text-lg"}>
                  {user.username?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-4">
                <div>
                  <div className={isMobile ? "text-center space-y-2 mb-3" : "flex items-center gap-3 mb-2"}>
                    <h2 className={isMobile ? "text-xl font-bold" : "text-2xl font-bold"}>
                      {user.username}
                    </h2>
                    <div className={isMobile ? "flex justify-center gap-2" : "flex gap-3"}>
                      <Badge className={getRoleColor(user.role)}>
                        <div className="flex items-center gap-1">
                          {getRoleIcon(user.role)}
                          {user.role}
                        </div>
                      </Badge>
                      <Badge className={getActivityColor(user.metrics.activityStatus)}>
                        {user.metrics.activityStatus}
                      </Badge>
                    </div>
                  </div>
                  <div className={isMobile ? "space-y-2 text-sm text-muted-foreground" : "flex items-center gap-4 text-sm text-muted-foreground"}>
                    <div className="flex items-center gap-1 justify-center sm:justify-start">
                      <Mail className="h-4 w-4" />
                      <span className="break-all">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-1 justify-center sm:justify-start">
                      <Calendar className="h-4 w-4" />
                      Joined {formatDate(user.createdAt)}
                    </div>
                    {user.lastActiveAt && (
                      <div className="flex items-center gap-1 justify-center sm:justify-start">
                        <Activity className="h-4 w-4" />
                        Last active {formatDate(user.lastActiveAt)}
                      </div>
                    )}
                  </div>
                </div>
                {user.bio && (
                  <p className={`text-muted-foreground ${isMobile ? "text-center text-sm" : ""}`}>
                    {user.bio}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </MobileSection>

      {/* Stats Cards */}
      <MobileSection title="Statistics" spacing="normal">
        <MobileCardGrid
          columns={{ mobile: 2, tablet: 2, desktop: 4 }}
          gap="md"
        >
          <Card>
            <CardContent className={isMobile ? "p-3" : "p-4"}>
              <div className="flex items-center gap-2">
                <Trophy className={isMobile ? "h-4 w-4 text-yellow-600" : "h-5 w-5 text-yellow-600"} />
                <div>
                  <p className="text-xs text-muted-foreground">Total XP</p>
                  <p className={isMobile ? "text-lg font-bold" : "text-2xl font-bold"}>
                    {user.totalXp.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className={isMobile ? "p-3" : "p-4"}>
              <div className="flex items-center gap-2">
                <FileText className={isMobile ? "h-4 w-4 text-blue-600" : "h-5 w-5 text-blue-600"} />
                <div>
                  <p className="text-xs text-muted-foreground">Submissions</p>
                  <p className={isMobile ? "text-lg font-bold" : "text-2xl font-bold"}>
                    {user.metrics.totalSubmissions}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className={isMobile ? "p-3" : "p-4"}>
              <div className="flex items-center gap-2">
                <MessageSquare className={isMobile ? "h-4 w-4 text-green-600" : "h-5 w-5 text-green-600"} />
                <div>
                  <p className="text-xs text-muted-foreground">Reviews</p>
                  <p className={isMobile ? "text-lg font-bold" : "text-2xl font-bold"}>
                    {user.metrics.totalReviews}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className={isMobile ? "p-3" : "p-4"}>
              <div className="flex items-center gap-2">
                <Trophy className={isMobile ? "h-4 w-4 text-purple-600" : "h-5 w-5 text-purple-600"} />
                <div>
                  <p className="text-xs text-muted-foreground">Achievements</p>
                  <p className={isMobile ? "text-lg font-bold" : "text-2xl font-bold"}>
                    {user.metrics.totalAchievements}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MobileCardGrid>
      </MobileSection>

      {/* Activity Tabs */}
      <MobileSection spacing="normal">
        <Tabs defaultValue="submissions" className="space-y-4">
          <TabsList className={isMobile ? "grid w-full grid-cols-3 h-auto p-1" : ""}>
            <TabsTrigger
              value="submissions"
              className={isMobile ? "min-h-11 text-sm px-3 py-2" : ""}
            >
              {isMobile ? "Submissions" : "Recent Submissions"}
            </TabsTrigger>
            <TabsTrigger
              value="reviews"
              className={isMobile ? "min-h-11 text-sm px-3 py-2" : ""}
            >
              {isMobile ? "Reviews" : "Recent Reviews"}
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className={isMobile ? "min-h-11 text-sm px-3 py-2" : ""}
            >
              Performance
            </TabsTrigger>
          </TabsList>

        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader className={isMobile ? "p-4" : ""}>
              <div className={isMobile ? "space-y-3" : "flex items-center justify-between"}>
                <div>
                  <CardTitle className={isMobile ? "text-lg" : ""}>Recent Submissions</CardTitle>
                  <CardDescription className={isMobile ? "text-sm" : ""}>
                    Latest submissions from this user (last 30 days)
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleViewSubmissions}
                  className={isMobile ? "min-h-11 w-full" : ""}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent className={isMobile ? "p-4 pt-0" : ""}>
              {user.recentSubmissions.length > 0 ? (
                <div className="space-y-3">
                  {user.recentSubmissions.map((submission) => (
                    <div
                      key={submission.id}
                      className={isMobile
                        ? "space-y-2 p-3 border rounded-lg"
                        : "flex items-center justify-between p-3 border rounded-lg"
                      }
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={isMobile ? "font-medium text-sm" : "font-medium"}>
                            {submission.title}
                          </h4>
                          {submission.isLegacy && (
                            <Badge variant="outline" className="text-xs">
                              Legacy
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(submission.createdAt)}
                        </p>
                      </div>
                      <div className={isMobile
                        ? "flex items-center justify-between"
                        : "flex items-center gap-3"
                      }>
                        <Badge className={getStatusColor(submission.status)}>
                          {submission.status === 'LEGACY_IMPORTED' ? 'LEGACY' : submission.status}
                        </Badge>
                        <div className="text-right">
                          <p className={isMobile ? "font-medium text-sm" : "font-medium"}>
                            {submission.finalXp.toLocaleString()} XP
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8 text-sm">
                  No submissions found
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader className={isMobile ? "p-4" : ""}>
              <CardTitle className={isMobile ? "text-lg" : ""}>Recent Reviews</CardTitle>
              <CardDescription className={isMobile ? "text-sm" : ""}>
                Latest peer reviews given by this user
              </CardDescription>
            </CardHeader>
            <CardContent className={isMobile ? "p-4 pt-0" : ""}>
              {user.recentReviews.length > 0 ? (
                <div className="space-y-3">
                  {user.recentReviews.map((review) => (
                    <div
                      key={review.id}
                      className={isMobile
                        ? "space-y-2 p-3 border rounded-lg"
                        : "flex items-center justify-between p-3 border rounded-lg"
                      }
                    >
                      <div className="flex-1">
                        <h4 className={isMobile ? "font-medium text-sm" : "font-medium"}>
                          {review.submissionTitle}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(review.createdAt)}
                        </p>
                      </div>
                      <div className={isMobile ? "flex justify-between items-center" : "text-right"}>
                        <p className={isMobile ? "font-medium text-sm" : "font-medium"}>
                          {review.xpScore.toLocaleString()} XP
                        </p>
                        <p className="text-xs text-muted-foreground">Review Score</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8 text-sm">
                  No reviews found
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <MobileCardGrid
            columns={{ mobile: 1, tablet: 2, desktop: 2 }}
            gap="md"
          >
            <Card>
              <CardHeader className={isMobile ? "p-4" : ""}>
                <CardTitle className={isMobile ? "text-lg" : ""}>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className={`space-y-4 ${isMobile ? "p-4 pt-0" : ""}`}>
                <div className="flex justify-between">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Submission Success Rate
                  </span>
                  <span className={isMobile ? "font-medium text-sm" : "font-medium"}>
                    {user.metrics.submissionSuccessRate}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Average Review Score
                  </span>
                  <span className={isMobile ? "font-medium text-sm" : "font-medium"}>
                    {user.metrics.avgReviewScore}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Weekly XP
                  </span>
                  <span className={isMobile ? "font-medium text-sm" : "font-medium"}>
                    {user.metrics.weeklyXp.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Current Streak
                  </span>
                  <span className={isMobile ? "font-medium text-sm" : "font-medium"}>
                    {user.streakWeeks} weeks
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={isMobile ? "p-4" : ""}>
                <CardTitle className={isMobile ? "text-lg" : ""}>Activity Summary</CardTitle>
              </CardHeader>
              <CardContent className={`space-y-4 ${isMobile ? "p-4 pt-0" : ""}`}>
                <div className="flex justify-between">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Total Contributions
                  </span>
                  <span className={isMobile ? "font-medium text-sm" : "font-medium"}>
                    {user.metrics.totalSubmissions + user.metrics.totalReviews}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Days Since Last Active
                  </span>
                  <span className={isMobile ? "font-medium text-sm" : "font-medium"}>
                    {user.metrics.daysSinceLastActive !== null
                      ? `${user.metrics.daysSinceLastActive} days`
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Account Status
                  </span>
                  <Badge className={getActivityColor(user.metrics.activityStatus)}>
                    {user.metrics.activityStatus}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </MobileCardGrid>
        </TabsContent>
      </Tabs>
      </MobileSection>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleDialog} onOpenChange={setEditRoleDialog}>
        <DialogContent className={isMobile ? "w-[95vw] max-w-md" : ""}>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change the role for {user?.username}. This will affect their permissions in the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="role">New Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className={isMobile ? "min-h-11" : ""}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="REVIEWER">REVIEWER</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className={isMobile ? "flex-col gap-2" : ""}>
            <Button
              variant="outline"
              onClick={() => setEditRoleDialog(false)}
              className={isMobile ? "min-h-11 w-full" : ""}
              disabled={updating}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRoleChange}
              className={isMobile ? "min-h-11 w-full" : ""}
              disabled={updating || !newRole || newRole === user?.role}
            >
              {updating ? 'Updating...' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Reactivate User Dialog */}
      <AlertDialog open={deactivateDialog} onOpenChange={setDeactivateDialog}>
        <AlertDialogContent className={isMobile ? "w-[95vw] max-w-md" : ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user?.metrics.activityStatus === 'deactivated' ? 'Reactivate User' : 'Deactivate User'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user?.metrics.activityStatus === 'deactivated' ? (
                <>
                  Are you sure you want to reactivate <strong>{user?.username}</strong>?
                  They will regain access to the system and be able to submit content and participate in reviews.
                </>
              ) : (
                <>
                  Are you sure you want to deactivate <strong>{user?.username}</strong>?
                  This will prevent them from accessing the system and participating in activities.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isMobile ? "flex-col gap-2" : ""}>
            <AlertDialogCancel
              className={isMobile ? "min-h-11 w-full" : ""}
              disabled={updating}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusToggle}
              className={`${isMobile ? "min-h-11 w-full" : ""} ${
                user?.metrics.activityStatus === 'deactivated'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              disabled={updating}
            >
              {updating ? 'Updating...' : (
                user?.metrics.activityStatus === 'deactivated' ? 'Reactivate' : 'Deactivate'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  )
}

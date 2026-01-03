'use client'

import React, { useState, useEffect } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  
  Shield,
  User,
  ArrowUpDown,
  Crown,
  Users,
  MoreHorizontal,
  Eye,
  FileText,
  UserCheck,
  UserX,
  Info
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Pagination } from '@/components/ui/pagination'

interface UserData {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  currentWeekXp: number
  streakWeeks: number
  createdAt: string
  lastActiveAt: string | null
  metrics: {
    weeklyXp: number
    submissionSuccessRate: number
    avgReviewScore: number
    daysSinceLastActive: number | null
    activityStatus: string
    totalSubmissions: number
    totalReviews: number
    totalAchievements: number
    transactionBreakdown?: Record<string, number>
    submissionsXp?: number
  }
}

export default function AdminUsersPage() {
  const { user: _user, isLoading: loading } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()
  const router = useRouter()
  const [users, setUsers] = useState<UserData[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [exportingData, setExportingData] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  })

  // Filter state
  const [filters, setFilters] = useState({
    role: 'all',
    search: '',
    xpMin: '',
    xpMax: '',
    lastActiveFrom: '',
    lastActiveTo: '',
    status: 'all'
  })

  // Sort state
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')

  // Stats state
  const [stats, setStats] = useState({
    roleCounts: {} as Record<string, number>,
    totalUsers: 0
  })

  // Dialog states
  const [roleChangeDialog, setRoleChangeDialog] = useState(false)
  const [xpAdjustDialog, setXpAdjustDialog] = useState(false)
  const [deactivationDialog, setDeactivationDialog] = useState(false)
  const [newRole, setNewRole] = useState('')
  const [xpAmount, setXpAmount] = useState('')
  const [reason, setReason] = useState('')
  const [deactivationReason, setDeactivationReason] = useState('')
  const [userToDeactivate, setUserToDeactivate] = useState<{id: string, username: string, action: 'deactivate' | 'reactivate'} | null>(null)

  const fetchUsers = React.useCallback(async () => {
    try {
      setLoadingUsers(true)
      
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder
      })

      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.append(key, value as string)
        }
      })

      const response = await authenticatedFetch(`/api/admin/users?${params.toString()}`)
      
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
        // Only update pagination if values changed to avoid re-render loops
        const incoming = data.pagination || {
          page: 1,
          limit: 20,
          totalCount: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
        setPagination(prev => {
          const same = prev.page === incoming.page &&
                       prev.limit === incoming.limit &&
                       prev.totalCount === incoming.totalCount &&
                       prev.totalPages === incoming.totalPages &&
                       prev.hasNextPage === incoming.hasNextPage &&
                       prev.hasPrevPage === incoming.hasPrevPage
          return same ? prev : incoming
        })
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }, [pagination.page, pagination.limit, filters, sortBy, sortOrder, authenticatedFetch])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 })) // Reset to first page
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const handleSelectUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(users.map(u => u.id))
    }
  }

  const handleBulkRoleChange = async () => {
    if (selectedUsers.length === 0 || !newRole) return

    try {
      const response = await authenticatedFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'updateRole',
          userIds: selectedUsers,
          data: { role: newRole, reason }
        })
      })

      if (response.ok) {
        fetchUsers()
        setSelectedUsers([])
        setRoleChangeDialog(false)
        setNewRole('')
        setReason('')
      }
    } catch (error) {
      console.error('Error updating user roles:', error)
    }
  }

  const handleBulkXpAdjust = async () => {
    if (selectedUsers.length === 0 || !xpAmount) return

    try {
      const response = await authenticatedFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'adjustXp',
          userIds: selectedUsers,
          data: { xpAmount: parseInt(xpAmount), reason }
        })
      })

      if (response.ok) {
        fetchUsers()
        setSelectedUsers([])
        setXpAdjustDialog(false)
        setXpAmount('')
        setReason('')
      }
    } catch (error) {
      console.error('Error adjusting user XP:', error)
    }
  }

  // Individual user action handlers
  const handleViewProfile = (userId: string) => {
    router.push(`/admin/users/${userId}`)
  }

  const handleViewSubmissions = (userId: string) => {
    router.push(`/admin/submissions?userId=${userId}`)
  }

  const handleEditRole = (user: UserData) => {
    setSelectedUsers([user.id])
    setNewRole(user.role)
    setRoleChangeDialog(true)
  }

  const handleToggleUserStatus = (userId: string, currentStatus: 'active' | 'inactive') => {
    const user = users.find(u => u.id === userId)
    if (!user) return

    const isDeactivating = currentStatus === 'active'
    const action = isDeactivating ? 'deactivate' : 'reactivate'



    setUserToDeactivate({
      id: userId,
      username: user.username,
      action
    })
    setDeactivationDialog(true)
  }

  const confirmUserDeactivation = async () => {
    if (!userToDeactivate) return

    try {
      const response = await authenticatedFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'toggleStatus',
          userIds: [userToDeactivate.id],
          data: {
            action: userToDeactivate.action,
            reason: deactivationReason || `Admin ${userToDeactivate.action}`
          }
        })
      })

      if (response.ok) {
        fetchUsers()
        setDeactivationDialog(false)
        setUserToDeactivate(null)
        setDeactivationReason('')
        // Show success message
        const message = userToDeactivate.action === 'deactivate'
          ? 'User has been deactivated successfully'
          : 'User has been reactivated successfully'
        alert(message)
      } else {
        const error = await response.json()
        alert(`Failed to ${userToDeactivate.action} user: ${error.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error(`Error ${userToDeactivate.action}ing user:`, error)
      alert(`Network error occurred while trying to ${userToDeactivate.action} user`)
    }
  }

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }))
  }

  const handleBulkDeactivation = () => {
    if (selectedUsers.length === 0) return

    setUserToDeactivate({
      id: 'bulk',
      username: `${selectedUsers.length} selected users`,
      action: 'deactivate'
    })
    setDeactivationDialog(true)
  }

  const handleExport = async () => {
    try {
      setExportingData(true)

      // Fetch all users for export using pagination to bypass API limits
      const allUsers: UserData[] = []
      let currentPage = 1
      let hasMorePages = true
      const pageSize = 100 // Use maximum allowed page size

      while (hasMorePages) {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: pageSize.toString(),
          sortBy,
          sortOrder
        })

        // Add filters
        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== 'all') {
            params.append(key, value as string)
          }
        })

        const response = await authenticatedFetch(`/api/admin/users?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`Failed to fetch users page ${currentPage} for export`)
        }

        const data = await response.json()
        const pageUsers = data.users || []

        // Add users from this page to our collection
        allUsers.push(...pageUsers)

        // Check if there are more pages
        const pagination = data.pagination
        hasMorePages = pagination?.hasNextPage || false

        // console.log(`Export page ${currentPage}: fetched ${pageUsers.length} users, hasNextPage: ${hasMorePages}, total so far: ${allUsers.length}`)

        currentPage++

        // Safety check to prevent infinite loops
        if (currentPage > 100) {
          // console.warn('Export stopped at page 100 to prevent infinite loop')
          break
        }
      }

      // console.log(`Export fetched ${allUsers.length} users across ${currentPage - 1} pages`)

      // Validate we got users
      if (allUsers.length === 0) {
        console.warn('No users found for export')
        return
      }

      // Create CSV content
      const headers = [
        'ID',
        'Username',
        'Email',
        'Role',
        'Total XP',
        'Current Week XP',
        'Streak Weeks',
        'Total Submissions',
        'Total Reviews',
        'Total Achievements',
        'Submission Success Rate (%)',
        'Average Review Score',
        'Activity Status',
        'Days Since Last Active',
        'Registration Date',
        'Last Active Date'
      ]

      // Helper function to escape CSV values
      const escapeCSV = (value: unknown): string => {
        if (value === null || value === undefined) return 'N/A'
        const str = String(value)
        // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const csvContent = [
        headers.join(','),
        ...allUsers.map((user: UserData) => [
          escapeCSV(user.id),
          escapeCSV(user.username),
          escapeCSV(user.email),
          escapeCSV(user.role),
          escapeCSV(user.totalXp),
          escapeCSV(user.currentWeekXp),
          escapeCSV(user.streakWeeks),
          escapeCSV(user.metrics.totalSubmissions),
          escapeCSV(user.metrics.totalReviews),
          escapeCSV(user.metrics.totalAchievements),
          escapeCSV(user.metrics.submissionSuccessRate),
          escapeCSV(user.metrics.avgReviewScore),
          escapeCSV(user.metrics.activityStatus),
          escapeCSV(user.metrics.daysSinceLastActive),
          escapeCSV(new Date(user.createdAt).toLocaleDateString()),
          escapeCSV(user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : 'Never')
        ].join(','))
      ].join('\n')

      // Add BOM for proper UTF-8 encoding in Excel
      const csvWithBOM = '\uFEFF' + csvContent

      // Download CSV
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename = `users-export-${new Date().toISOString().split('T')[0]}.csv`
      a.download = filename
      a.click()
      window.URL.revokeObjectURL(url)

      // console.log(`✅ Export completed: ${filename} with ${allUsers.length} users`)

    } catch (error) {
      console.error('Error exporting users:', error)
      // You could add a toast notification here for better UX
    } finally {
      setExportingData(false)
    }
  }

  const confirmBulkDeactivation = async () => {
    if (selectedUsers.length === 0) return

    try {
      const response = await authenticatedFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'toggleStatus',
          userIds: selectedUsers,
          data: {
            action: 'deactivate',
            reason: deactivationReason || 'Bulk admin deactivation'
          }
        })
      })

      if (response.ok) {
        fetchUsers()
        setSelectedUsers([])
        setDeactivationDialog(false)
        setUserToDeactivate(null)
        setDeactivationReason('')
        alert(`Successfully deactivated ${selectedUsers.length} users`)
      } else {
        const error = await response.json()
        alert(`Failed to deactivate users: ${error.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deactivating users:', error)
      alert('Network error occurred while trying to deactivate users')
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Crown className="h-4 w-4 text-warning" />
      case 'REVIEWER': return <Shield className="h-4 w-4 text-info" />
      case 'USER': return <User className="h-4 w-4 text-muted-foreground" />
      default: return <User className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-warning/10 text-warning'
      case 'REVIEWER': return 'bg-info/10 text-info'
      case 'USER': return 'bg-muted text-muted-foreground'
      default: return 'bg-muted text-muted-foreground'
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              User Management
            </h1>
            <p className="text-muted-foreground">
              Manage user accounts, roles, and permissions
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchUsers}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exportingData}
            >
              {exportingData ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-info">
                {stats.totalUsers}
              </div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </CardContent>
          </Card>
          {Object.entries(stats.roleCounts).map(([role, count]) => (
            <Card key={role}>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  {getRoleIcon(role)}
                  <div className="text-2xl font-bold">
                    {count}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{role}S</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search users..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="role">Role</Label>
                <Select value={filters.role} onValueChange={(value) => handleFilterChange('role', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="REVIEWER">Reviewer</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Activity</Label>
                <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All activity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All activity</SelectItem>
                    <SelectItem value="active">Active (7 days)</SelectItem>
                    <SelectItem value="recent">Recent (30 days)</SelectItem>
                    <SelectItem value="inactive">Inactive (30+ days)</SelectItem>
                    <SelectItem value="deactivated">Deactivated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="xpMin">Min XP</Label>
                <Input
                  id="xpMin"
                  type="number"
                  placeholder="0"
                  value={filters.xpMin}
                  onChange={(e) => handleFilterChange('xpMin', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="xpMax">Max XP</Label>
                <Input
                  id="xpMax"
                  type="number"
                  placeholder="1000"
                  value={filters.xpMax}
                  onChange={(e) => handleFilterChange('xpMax', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="lastActiveFrom">Last Active From</Label>
                <Input
                  id="lastActiveFrom"
                  type="date"
                  value={filters.lastActiveFrom}
                  onChange={(e) => handleFilterChange('lastActiveFrom', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedUsers.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedUsers.length} users selected
                </span>
                <div className="flex items-center gap-2">
                  <Dialog open={roleChangeDialog} onOpenChange={setRoleChangeDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Shield className="h-4 w-4 mr-2" />
                        Change Role
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Change User Roles</DialogTitle>
                        <DialogDescription>
                          Change the role for {selectedUsers.length} selected users.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="newRole">New Role</Label>
                          <Select value={newRole} onValueChange={setNewRole}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USER">User</SelectItem>
                              <SelectItem value="REVIEWER">Reviewer</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="reason">Reason</Label>
                          <Input
                            id="reason"
                            placeholder="Reason for role change..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRoleChangeDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleBulkRoleChange}>
                          Update Roles
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={xpAdjustDialog} onOpenChange={setXpAdjustDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Adjust XP
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Bulk XP Adjustment</DialogTitle>
                        <DialogDescription>
                          Apply a relative XP adjustment to {selectedUsers.length} selected users.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                          <p className="text-sm text-blue-800">
                            <strong>Note:</strong> This adds/subtracts XP from users’ current totals.
                            For setting absolute XP values (e.g., legacy data import), use the dedicated
                            <a href="/admin/xp-management" className="underline ml-1">XP Management page</a>.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="xpAmount">XP Adjustment (can be negative)</Label>
                          <Input
                            id="xpAmount"
                            type="number"
                            placeholder="e.g., +100 or -50"
                            value={xpAmount}
                            onChange={(e) => setXpAmount(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Positive values add XP, negative values subtract XP
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="reason">Reason</Label>
                          <Input
                            id="reason"
                            placeholder="e.g., Bonus for exceptional contribution"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setXpAdjustDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleBulkXpAdjust}>
                          Adjust XP
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDeactivation}
                    className="text-orange-600 hover:text-orange-800 border-orange-200 hover:border-orange-300"
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    Bulk Deactivate
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Deactivation Dialog */}
        <Dialog open={deactivationDialog} onOpenChange={setDeactivationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {userToDeactivate?.action === 'deactivate' ? 'Deactivate User' : 'Reactivate User'}
              </DialogTitle>
              <DialogDescription>
                {userToDeactivate?.action === 'deactivate' ? (
                  <>
                    Are you sure you want to deactivate <strong>{userToDeactivate?.username}</strong>?
                  </>
                ) : (
                  <>
                    Are you sure you want to reactivate <strong>{userToDeactivate?.username}</strong>?
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {userToDeactivate?.action === 'deactivate' && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                  <h4 className="font-medium text-orange-900 mb-2">⚠️ This action will:</h4>
                  <ul className="text-sm text-orange-800 space-y-1">
                    <li>• Prevent {userToDeactivate.id === 'bulk' ? 'them' : 'the user'} from logging in</li>
                    <li>• Hide their submissions from public view</li>
                    <li>• Suspend their review assignments</li>
                    <li>• Mark their account as inactive</li>
                  </ul>
                  <p className="text-sm text-orange-700 mt-2 font-medium">
                    This action can be reversed by reactivating {userToDeactivate.id === 'bulk' ? 'the users' : 'the user'} later.
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="deactivationReason">
                  Reason {userToDeactivate?.action === 'deactivate' ? '(recommended)' : '(optional)'}
                </Label>
                <Input
                  id="deactivationReason"
                  placeholder={
                    userToDeactivate?.action === 'deactivate'
                      ? "e.g., Policy violation, spam, inappropriate behavior"
                      : "e.g., Appeal approved, issue resolved"
                  }
                  value={deactivationReason}
                  onChange={(e) => setDeactivationReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeactivationDialog(false)
                  setUserToDeactivate(null)
                  setDeactivationReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={userToDeactivate?.id === 'bulk' ? confirmBulkDeactivation : confirmUserDeactivation}
              >
                {userToDeactivate?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loadingUsers ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedUsers.length === users.length && users.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('username')}
                    >
                      <div className="flex items-center gap-1">
                        User
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('totalXp')}
                    >
                      <div className="flex items-center gap-1">
                        Total XP
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Weekly XP</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Reviews</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => handleSort('createdAt')}
                    >
                      <div className="flex items-center gap-1">
                        Joined
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((userData) => (
                    <TableRow key={userData.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedUsers.includes(userData.id)}
                          onCheckedChange={() => handleSelectUser(userData.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{userData.username}</div>
                        <div className="text-sm text-muted-foreground">{userData.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleColor(userData.role)}>
                          <div className="flex items-center gap-1">
                            {getRoleIcon(userData.role)}
                            {userData.role}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {userData.totalXp.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{userData.metrics.weeklyXp.toLocaleString()}</span>
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="w-80 max-h-64 overflow-y-auto p-4">
                                  <div className="font-semibold mb-2">Weekly XP Breakdown</div>
                                  <div className="space-y-1">
                                    {/* Show detailed breakdown of all XP sources */}
                                    {userData.metrics.transactionBreakdown && Object.entries(userData.metrics.transactionBreakdown).map(([type, amount]) => {
                                      const typeLabels = {
                                        // Submission types
                                        'SUBMISSION_REWARD': 'Submission Reward',
                                        'SUBMISSION': 'Submission',
                                        'LEGACY_SUBMISSION': 'Legacy Submission',
                                        'SUBMISSION_IMPORT': 'Submission Import',
                                        
                                        // Review types
                                        'REVIEW_BASE_REWARD': 'Review Reward',
                                        'REVIEW_QUALITY_BONUS': 'Quality Bonus',
                                        'PEER_REVIEW': 'Peer Review',
                                        'REVIEW': 'Review',
                                        
                                        // Admin adjustment types
                                        'ADMIN_ADJUSTMENT': 'Admin Adjustment',
                                        'LEGACY_ADJUSTMENT': 'Legacy Adjustment',
                                        
                                        // Achievement types
                                        'ACHIEVEMENT_REWARD': 'Achievement Reward',
                                        'ACHIEVEMENT_BONUS': 'Achievement Bonus',
                                        'ACHIEVEMENT': 'Achievement',
                                        'MONTHLY_WINNER_BONUS': 'Monthly Winner Bonus',
                                        'MONTHLY_WINNER_BONUS_REVERSAL': 'Monthly Winner Bonus Reversal',
                                        
                                        // Other types
                                        'STREAK_BONUS': 'Streak Bonus',
                                        'PENALTY': 'Penalty',
                                        'LEGACY_IMPORTED': 'Legacy Import',
                                        'LEGACY_TRANSFER': 'Legacy Transfer'
                                      };
                                      
                                      const label = typeLabels[type as keyof typeof typeLabels] || type;
                                      const sign = amount >= 0 ? '+' : '';
                                      
                                      return (
                                        <div key={type} className="flex justify-between">
                                          <span className={amount < 0 ? "text-destructive" : "text-primary"}>
                                            {label}:
                                          </span>
                                          <span className={`font-medium ${amount < 0 ? "text-destructive" : "text-primary"}`}>
                                            {sign}{amount}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    
                                    <div className="border-t pt-1 text-xs text-muted-foreground mt-2">
                                      Total this week: {userData.metrics.weeklyXp.toLocaleString()}
                                    </div>
                                    
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getActivityColor(userData.metrics.activityStatus)}>
                          {userData.metrics.activityStatus}
                        </Badge>
                        {userData.metrics.daysSinceLastActive !== null && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {userData.metrics.daysSinceLastActive}d ago
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{userData.metrics.totalSubmissions}</div>
                        <div className="text-xs text-muted-foreground">
                          {userData.metrics.submissionSuccessRate}% success
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{userData.metrics.totalReviews}</div>
                        <div className="text-xs text-muted-foreground">
                          {userData.metrics.avgReviewScore} avg score
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(userData.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewProfile(userData.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewSubmissions(userData.id)}>
                              <FileText className="mr-2 h-4 w-4" />
                              View Submissions
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditRole(userData)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleToggleUserStatus(
                                userData.id,
                                userData.metrics.activityStatus === 'deactivated' ? 'inactive' : 'active'
                              )}
                              className={userData.metrics.activityStatus === 'deactivated' ? "text-green-600" : "text-orange-600"}
                            >
                              {userData.metrics.activityStatus === 'deactivated' ? (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Reactivate User
                                </>
                              ) : (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate User
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-6 pt-6 border-t">
            <Pagination
              pagination={pagination}
              onPageChange={handlePageChange}
              showPageSizeSelector={false}
              loading={loadingUsers}
            />
          </div>
        )}
      </div>
    </div>
  )
}

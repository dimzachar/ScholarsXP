'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  Search,
  Filter,
  Download,
  RefreshCw,
  Edit,
  Shield,
  User,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Crown,
  Users
} from 'lucide-react'
import { useRouter } from 'next/navigation'

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
  }
}

export default function AdminUsersPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<UserData[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
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
    role: '',
    search: '',
    xpMin: '',
    xpMax: '',
    lastActiveFrom: '',
    lastActiveTo: '',
    status: ''
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
  const [newRole, setNewRole] = useState('')
  const [xpAmount, setXpAmount] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [pagination.page, filters, sortBy, sortOrder])

  const fetchUsers = async () => {
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
        if (value) {
          params.append(key, value as string)
        }
      })

      const response = await fetch(`/api/admin/users?${params.toString()}`)
      
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
        setPagination(data.pagination)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleFilterChange = (key: string, value: any) => {
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
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
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
                    <SelectItem value="">All roles</SelectItem>
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
                    <SelectItem value="">All activity</SelectItem>
                    <SelectItem value="active">Active (7 days)</SelectItem>
                    <SelectItem value="recent">Recent (30 days)</SelectItem>
                    <SelectItem value="inactive">Inactive (30+ days)</SelectItem>
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
                        <DialogTitle>Adjust User XP</DialogTitle>
                        <DialogDescription>
                          Adjust XP for {selectedUsers.length} selected users.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="xpAmount">XP Amount (can be negative)</Label>
                          <Input
                            id="xpAmount"
                            type="number"
                            placeholder="100"
                            value={xpAmount}
                            onChange={(e) => setXpAmount(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="reason">Reason</Label>
                          <Input
                            id="reason"
                            placeholder="Reason for XP adjustment..."
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
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                        <div className="font-medium">{userData.metrics.weeklyXp}</div>
                        <div className="text-xs text-muted-foreground">
                          {userData.currentWeekXp} current
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
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} users
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={!pagination.hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={!pagination.hasNextPage}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { usePrivyAuthSync, UserRole, SyncedUser } from '@/contexts/PrivyAuthSyncContext'
import { supabase } from '@/lib/supabase-client'

type UserProfile = SyncedUser
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, Shield, Crown, User } from 'lucide-react'
import { toast } from 'sonner'
// import { api, handleApiError } from '@/lib/api-client'

type UserWithRole = UserProfile

export default function RoleManagement() {
  const { isAdmin, refreshUser } = usePrivyAuthSync()
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    }
  }, [isAdmin])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('User')
        .select('*')
        .order('createdAt', { ascending: false })

      if (error) {
        console.error('Error fetching users:', error)
        toast.error('Failed to fetch users')
        return
      }

      setUsers(data as UserWithRole[])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      setUpdating(userId)
      
      const { error } = await supabase
        .from('User')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) {
        console.error('Error updating user role:', error)
        toast.error('Failed to update user role')
        return
      }

      // Update local state
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ))

      // Refresh current user profile if they updated their own role
      await refreshUser()

      toast.success(`User role updated to ${newRole}`)
    } catch (error) {
      console.error('Error updating user role:', error)
      toast.error('Failed to update user role')
    } finally {
      setUpdating(null)
    }
  }

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return <Crown className="h-4 w-4" />
      case 'REVIEWER':
        return <Shield className="h-4 w-4" />
      case 'USER':
        return <User className="h-4 w-4" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return 'destructive'
      case 'REVIEWER':
        return 'secondary'
      case 'USER':
        return 'outline'
      default:
        return 'outline'
    }
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You need admin privileges to access role management.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Users className="h-5 w-5" />
          <span>Role Management</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {getRoleIcon(user.role)}
                  <div>
                    <p className="font-medium">
                      {user.username || user.email.split('@')[0]}
                    </p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Badge variant={getRoleBadgeVariant(user.role)}>
                  {user.role}
                </Badge>
              </div>

              <div className="flex items-center space-x-2">
                <Select
                  value={user.role}
                  onValueChange={(newRole: UserRole) => updateUserRole(user.id, newRole)}
                  disabled={updating === user.id}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">USER</SelectItem>
                    <SelectItem value="REVIEWER">REVIEWER</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
                
                {updating === user.id && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                )}
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No users found</p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t">
          <Button onClick={fetchUsers} variant="outline" size="sm">
            Refresh Users
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

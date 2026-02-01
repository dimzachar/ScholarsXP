'use client'

import { usePrivyAuthSync, UserRole } from '@/contexts/PrivyAuthSyncContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { isDeveloper, ADMIN_ROLES, REVIEWER_ROLES } from '@/lib/roles'

interface RoleGuardProps {
  children: React.ReactNode
  requiredRole?: UserRole
  requiredRoles?: UserRole[]
  fallback?: React.ReactNode
}

export default function RoleGuard({ 
  children, 
  requiredRole, 
  requiredRoles, 
  fallback 
}: RoleGuardProps) {
  const { user, isLoading: loading, isAdmin, isReviewer } = usePrivyAuthSync()
  const router = useRouter()

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    router.push('/login')
    return null
  }

  // Check role permissions
  const hasPermission = () => {
    if (requiredRole) {
      // Check for specific role
      if (requiredRole === 'ADMIN') return isAdmin
      if (requiredRole === 'REVIEWER') return isReviewer
      if (requiredRole === 'USER') return true // All authenticated users are at least USER
      if (requiredRole === 'DEVELOPER') return isDeveloper(user.role)
      return user.role === requiredRole
    }

    if (requiredRoles) {
      // Check if user has any of the required roles
      return requiredRoles.some(role => {
        if (role === 'ADMIN') return isAdmin
        if (role === 'REVIEWER') return isReviewer
        if (role === 'USER') return true
        if (role === 'DEVELOPER') return isDeveloper(user.role)
        return user.role === role
      })
    }

    // If no specific role required, just check if authenticated
    return true
  }

  // Show access denied if user doesn't have permission
  if (!hasPermission()) {
    if (fallback) {
      return <>{fallback}</>
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-full mb-4">
                <Shield className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground mb-4">
                You don’t have the required permissions to access this page.
              </p>
              <div className="bg-muted p-3 rounded-lg mb-4">
                <div className="flex items-center justify-center space-x-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span>Your role: <strong>{user.role}</strong></span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Required: {requiredRole || requiredRoles?.join(' or ')}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => router.push('/dashboard')}
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Button>
              <Button
                onClick={() => router.back()}
                variant="outline"
                className="w-full"
              >
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // User has permission, render children
  return <>{children}</>
}

// Convenience components for specific roles
export function AdminGuard({ children, fallback }: { children: React.ReactNode, fallback?: React.ReactNode }) {
  return (
    <RoleGuard requiredRoles={ADMIN_ROLES} fallback={fallback}>
      {children}
    </RoleGuard>
  )
}

export function DeveloperGuard({ children, fallback }: { children: React.ReactNode, fallback?: React.ReactNode }) {
  return (
    <RoleGuard requiredRole="DEVELOPER" fallback={fallback}>
      {children}
    </RoleGuard>
  )
}

export function ReviewerGuard({ children, fallback }: { children: React.ReactNode, fallback?: React.ReactNode }) {
  return (
    <RoleGuard requiredRoles={REVIEWER_ROLES} fallback={fallback}>
      {children}
    </RoleGuard>
  )
}

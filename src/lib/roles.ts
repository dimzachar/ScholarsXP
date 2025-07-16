export type UserRole = 'USER' | 'REVIEWER' | 'ADMIN'

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  USER: 1,
  REVIEWER: 2,
  ADMIN: 3,
}

export const ROLE_PERMISSIONS = {
  USER: [
    'submit_content',
    'view_leaderboard',
    'view_own_submissions',
  ],
  REVIEWER: [
    'submit_content',
    'view_leaderboard', 
    'view_own_submissions',
    'review_submissions',
    'view_review_dashboard',
  ],
  ADMIN: [
    'submit_content',
    'view_leaderboard',
    'view_own_submissions', 
    'review_submissions',
    'view_review_dashboard',
    'view_admin_dashboard',
    'manage_users',
    'manage_submissions',
    'system_operations',
  ],
} as const

export type Permission = typeof ROLE_PERMISSIONS[UserRole][number]

export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[userRole].includes(permission)
}

export function hasRoleOrHigher(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function canAccessRoute(userRole: UserRole, route: string): boolean {
  if (route.startsWith('/admin')) {
    return hasRoleOrHigher(userRole, 'ADMIN')
  }
  if (route.startsWith('/review')) {
    return hasRoleOrHigher(userRole, 'REVIEWER')
  }
  return true
}

export function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'REVIEWER':
      return 'bg-primary/10 text-primary border-primary/20'
    case 'USER':
      return 'bg-muted text-muted-foreground border-border'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}
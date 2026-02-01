/**
 * CENTRALIZED ROLE MANAGEMENT
 * 
 * This is the SINGLE SOURCE OF TRUTH for all roles and permissions.
 * When adding a new role, ONLY modify this file.
 * 
 * Usage:
 *   import { isAdmin, isReviewer, ADMIN_ROLES, UserRole } from '@/lib/roles'
 */

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

export type UserRole = 'USER' | 'REVIEWER' | 'ADMIN' | 'DEVELOPER'

/** All valid roles - use this for validation */
export const ALL_ROLES: UserRole[] = ['USER', 'REVIEWER', 'ADMIN', 'DEVELOPER']

/** Role hierarchy levels - higher number = more permissions */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  USER: 1,
  REVIEWER: 2,
  ADMIN: 3,
  DEVELOPER: 4,
}

// =============================================================================
// ROLE GROUPS (for checks and queries)
// =============================================================================

/** Roles that can access admin features */
export const ADMIN_ROLES: UserRole[] = ['ADMIN', 'DEVELOPER']

/** Roles that can review submissions */
export const REVIEWER_ROLES: UserRole[] = ['REVIEWER', 'ADMIN', 'DEVELOPER']

/** Roles that can access developer-only features */
export const DEVELOPER_ROLES: UserRole[] = ['DEVELOPER']

/** Roles excluded from public leaderboards */
export const LEADERBOARD_EXCLUDED_ROLES: UserRole[] = ['ADMIN', 'DEVELOPER']

// =============================================================================
// PERMISSION DEFINITIONS
// =============================================================================

export const ROLE_PERMISSIONS = {
  USER: [
    'authenticated',
    'submit_content',
    'view_leaderboard',
    'view_own_submissions',
  ],
  REVIEWER: [
    'authenticated',
    'submit_content',
    'view_leaderboard',
    'view_own_submissions',
    'review_content',
    'review_submissions',
    'view_review_dashboard',
  ],
  ADMIN: [
    'authenticated',
    'submit_content',
    'view_leaderboard',
    'view_own_submissions',
    'review_content',
    'review_submissions',
    'view_review_dashboard',
    'admin_access',
    'view_admin_dashboard',
    'manage_users',
    'manage_submissions',
    'system_operations',
    'view_analytics',
  ],
  DEVELOPER: [
    'authenticated',
    'submit_content',
    'view_leaderboard',
    'view_own_submissions',
    'review_content',
    'review_submissions',
    'view_review_dashboard',
    'admin_access',
    'view_admin_dashboard',
    'manage_users',
    'manage_submissions',
    'system_operations',
    'view_analytics',
    'view_reviews_management',
    'developer_tools',
  ],
} as const

export type Permission = typeof ROLE_PERMISSIONS[UserRole][number]

// =============================================================================
// ROLE CHECK FUNCTIONS (use these instead of inline checks)
// =============================================================================

/** Check if role is valid */
export function isValidRole(role: string): role is UserRole {
  return ALL_ROLES.includes(role as UserRole)
}

/** Normalize role string to valid UserRole (defaults to USER) */
export function normalizeRole(role: string | null | undefined): UserRole {
  const normalized = (role || 'USER').toUpperCase()
  return isValidRole(normalized) ? normalized : 'USER'
}

/** Check if user has admin-level access */
export function isAdmin(role: UserRole | string | null | undefined): boolean {
  return ADMIN_ROLES.includes(normalizeRole(role))
}

/** Check if user has reviewer-level access */
export function isReviewer(role: UserRole | string | null | undefined): boolean {
  return REVIEWER_ROLES.includes(normalizeRole(role))
}

/** Check if user is a developer */
export function isDeveloper(role: UserRole | string | null | undefined): boolean {
  return DEVELOPER_ROLES.includes(normalizeRole(role))
}

/** Check if user has specific permission */
export function hasPermission(userRole: UserRole | string | null | undefined, permission: Permission): boolean {
  const normalized = normalizeRole(userRole)
  return ROLE_PERMISSIONS[normalized]?.includes(permission) ?? false
}

/** Check if user has required role or higher in hierarchy */
export function hasRoleOrHigher(userRole: UserRole | string | null | undefined, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[normalizeRole(userRole)] >= ROLE_HIERARCHY[requiredRole]
}

/** Check if user can access admin routes */
export function canAccessAdmin(role: UserRole | string | null | undefined): boolean {
  return isAdmin(role)
}

/** Check if user can access reviewer routes */
export function canAccessReviewer(role: UserRole | string | null | undefined): boolean {
  return isReviewer(role)
}

/** Check if user should be excluded from leaderboards */
export function shouldExcludeFromLeaderboard(role: UserRole | string | null | undefined): boolean {
  return LEADERBOARD_EXCLUDED_ROLES.includes(normalizeRole(role))
}

/** Check if user can bypass reviewer requirements (XP minimums, etc.) */
export function canBypassRequirements(role: UserRole | string | null | undefined): boolean {
  return isAdmin(role)
}

// =============================================================================
// UI HELPERS
// =============================================================================

export function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case 'DEVELOPER':
      return 'bg-purple/10 text-purple border-purple/20'
    case 'ADMIN':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'REVIEWER':
      return 'bg-primary/10 text-primary border-primary/20'
    case 'USER':
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function getRoleIcon(role: UserRole): string {
  switch (role) {
    case 'DEVELOPER': return '🔧'
    case 'ADMIN': return '👑'
    case 'REVIEWER': return '🛡️'
    case 'USER': return '👤'
    default: return '👤'
  }
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case 'DEVELOPER': return 'Developer'
    case 'ADMIN': return 'Admin'
    case 'REVIEWER': return 'Reviewer'
    case 'USER': return 'User'
    default: return 'User'
  }
}

'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Edit, Save, X, Trophy, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { MobileCardGrid } from '@/components/layout/MobileLayout'
import { useResponsiveLayout, TOUCH_TARGET_SIZE } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'

interface User {
  id: string
  username: string
  discordHandle: string
  totalXp: number
  role: string
  email: string
}

interface XpUpdateResult {
  success: boolean
  message: string
  user?: User
}

interface SearchResult {
  users: User[]
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export default function XpManagementPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [newXp, setNewXp] = useState<number>(0)
  const [result, setResult] = useState<XpUpdateResult | null>(null)
  const [updating, setUpdating] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  })

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { isMobile, isTablet: _isTablet, currentBreakpoint: _currentBreakpoint } = useResponsiveLayout()

  const searchUsers = useCallback(async (query: string, page: number = 1) => {
    if (!query.trim()) {
      setUsers([])
      setHasSearched(false)
      setPagination({
        page: 1,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      })
      return
    }

    try {
      setLoading(true)
      const params = new URLSearchParams({
        search: query.trim(),
        page: page.toString(),
        limit: '20'
      })

      const response = await fetch(`/api/admin/users?${params}`, { credentials: 'include' })
      const data: SearchResult = await response.json()

      if (response.ok) {
        setUsers(data.users || [])
        setPagination({
          page: data.pagination.page,
          totalCount: data.pagination.totalCount,
          totalPages: data.pagination.totalPages,
          hasNextPage: data.pagination.hasNextPage,
          hasPrevPage: data.pagination.hasPrevPage
        })
        setHasSearched(true)
      } else {
        setResult({ success: false, message: 'Failed to search users' })
        setUsers([])
      }
    } catch {
      setResult({ success: false, message: 'Error searching users' })
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Set new timeout for search-as-you-type
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(value, 1)
    }, 300) // 300ms debounce
  }

  const handlePageChange = (newPage: number) => {
    if (searchTerm.trim()) {
      searchUsers(searchTerm, newPage)
    }
  }

  const updateUserXp = async (userId: string, xpAmount: number) => {
    try {
      setUpdating(true)
      setResult(null)

      const response = await fetch('/api/admin/update-xp', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          xpAmount,
          reason: 'Admin manual adjustment'
        })
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully updated XP for ${data.user.username}`,
          user: data.user
        })
        
        // Update local state
        setUsers(users.map(user => 
          user.id === userId 
            ? { ...user, totalXp: data.user.totalXp }
            : user
        ))
        
        setEditingUser(null)
        setNewXp(0)
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to update XP'
        })
      }
    } catch {
      setResult({
        success: false,
        message: 'Network error occurred'
      })
    } finally {
      setUpdating(false)
    }
  }



  const startEditing = (user: User) => {
    setEditingUser(user.id)
    setNewXp(user.totalXp)
    setResult(null)
  }

  const cancelEditing = () => {
    setEditingUser(null)
    setNewXp(0)
    setResult(null)
  }

  const handleSave = (userId: string) => {
    updateUserXp(userId, newXp)
  }

  // Mobile-optimized user card component
  const UserCard = ({ user }: { user: User }) => {
    const isEditing = editingUser === user.id

    return (
      <Card className={cn(
        "transition-all duration-200",
        isMobile ? "mx-2" : "",
        isEditing && "ring-2 ring-primary"
      )}>
        <CardContent className={cn(
          "p-4",
          isMobile ? "p-3" : "p-4"
        )}>
          <div className={cn(
            "flex items-center justify-between",
            isMobile ? "flex-col space-y-3" : "flex-row"
          )}>
            {/* User Info */}
            <div className={cn(
              "flex-1",
              isMobile ? "w-full" : ""
            )}>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-base">{user.username}</h3>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {user.role}
                </Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {user.discordHandle || 'N/A'}
                </Badge>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">XP:</span>
                  {isEditing ? (
                    <Input
                      type="number"
                      value={newXp}
                      onChange={(e) => setNewXp(Number(e.target.value))}
                      className={cn(
                        "w-20 text-sm",
                        isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px]` : "h-8"
                      )}
                      min="0"
                    />
                  ) : (
                    <span className="font-bold text-primary text-lg">{user.totalXp}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className={cn(
              "flex gap-2",
              isMobile ? "w-full justify-center" : ""
            )}>
              {isEditing ? (
                <>
                  <Button
                    size={isMobile ? "default" : "sm"}
                    onClick={() => handleSave(user.id)}
                    disabled={updating}
                    className={cn(
                      isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px] px-4` : "h-8 px-2"
                    )}
                  >
                    {updating ? (
                      <Loader2 className={cn(isMobile ? "h-4 w-4" : "h-3 w-3", "animate-spin")} />
                    ) : (
                      <Save className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
                    )}
                    {isMobile && <span className="ml-2">Save</span>}
                  </Button>
                  <Button
                    size={isMobile ? "default" : "sm"}
                    variant="outline"
                    onClick={cancelEditing}
                    disabled={updating}
                    className={cn(
                      isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px] px-4` : "h-8 px-2"
                    )}
                  >
                    <X className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
                    {isMobile && <span className="ml-2">Cancel</span>}
                  </Button>
                </>
              ) : (
                <Button
                  size={isMobile ? "default" : "sm"}
                  variant="outline"
                  onClick={() => startEditing(user)}
                  className={cn(
                    isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px] px-4` : "h-8 px-2"
                  )}
                >
                  <Edit className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
                  <span className="ml-2">Edit XP</span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className={cn(
        "container mx-auto",
        isMobile ? "px-4 py-4 pb-20" : "py-8 max-w-6xl"
      )}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              XP Management
            </CardTitle>
            <CardDescription>
              Set absolute XP values for individual users - primarily for legacy data sync and major corrections
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          {/* Search */}
          <div className={cn(
            "flex items-center gap-4 mb-6",
            isMobile ? "flex-col space-y-3" : "flex-row"
          )}>
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={isMobile ? "Search users..." : "Search by username, Discord handle, or email..."}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className={cn(
                  "pl-10",
                  isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px]` : ""
                )}
              />
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}
          </div>

          {/* Result Message */}
          {result && (
            <Alert className={cn(
              result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
              isMobile ? "mx-2" : ""
            )}>
              <AlertDescription className={result.success ? 'text-green-800' : 'text-red-800'}>
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Users Display */}
          {!hasSearched && !loading ? (
            <div className={cn(
              "text-center py-12",
              isMobile ? "py-8 px-4" : ""
            )}>
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">Search for Users</h3>
              <p className="text-sm text-muted-foreground">
                {isMobile
                  ? "Enter a username, Discord handle, or email to find users"
                  : "Enter a username, Discord handle, or email to find users and manage their XP"
                }
              </p>
            </div>
          ) : loading ? (
            <div className={cn(
              "text-center py-8",
              isMobile ? "py-6" : ""
            )}>
              <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">Searching users...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Results Summary */}
              {hasSearched && (
                <div className={cn(
                  "flex items-center justify-between text-sm text-muted-foreground",
                  isMobile ? "flex-col space-y-2 text-center" : "flex-row"
                )}>
                  <span>
                    Found {pagination.totalCount} user{pagination.totalCount !== 1 ? 's' : ''}
                    {searchTerm && ` matching "${searchTerm}"`}
                  </span>
                  {pagination.totalPages > 1 && (
                    <span>
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                  )}
                </div>
              )}

              {/* Desktop Table View */}
              {!isMobile ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-3 border-b">
                    <div className="grid grid-cols-12 gap-4 font-medium text-sm">
                      <div className="col-span-3">User</div>
                      <div className="col-span-2">Discord</div>
                      <div className="col-span-2">Role</div>
                      <div className="col-span-2">Current XP</div>
                      <div className="col-span-3">Actions</div>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {users.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No users found matching your search.
                      </div>
                    ) : (
                      users.map((user) => (
                    <div key={user.id} className="px-4 py-3 border-b hover:bg-muted/25 transition-colors">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3">
                          <div className="font-medium">{user.username}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        </div>

                        <div className="col-span-2">
                          <Badge variant="outline" className="text-xs">
                            {user.discordHandle || 'N/A'}
                          </Badge>
                        </div>

                        <div className="col-span-2">
                          <Badge variant="secondary" className="text-xs">
                            {user.role}
                          </Badge>
                        </div>

                        <div className="col-span-2">
                          {editingUser === user.id ? (
                            <Input
                              type="number"
                              value={newXp}
                              onChange={(e) => setNewXp(Number(e.target.value))}
                              className="w-20 h-8 text-sm"
                              min="0"
                            />
                          ) : (
                            <div className="font-bold text-primary">{user.totalXp}</div>
                          )}
                        </div>

                        <div className="col-span-3">
                          {editingUser === user.id ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSave(user.id)}
                                disabled={updating}
                                className="h-8 px-2"
                              >
                                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                                disabled={updating}
                                className="h-8 px-2"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(user)}
                              className="h-8 px-2"
                            >
                              <Edit className="h-3 w-3" />
                              Edit XP
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* Mobile Card Grid */
                <MobileCardGrid
                  columns={{ mobile: 1, tablet: 1, desktop: 2 }}
                  gap="md"
                  className="w-full"
                >
                  {users.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground col-span-full">
                      No users found matching your search.
                    </div>
                  ) : (
                    users.map((user) => (
                      <UserCard key={user.id} user={user} />
                    ))
                  )}
                </MobileCardGrid>
              )}

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className={cn(
                  "flex items-center justify-between",
                  isMobile ? "flex-col space-y-3" : "flex-row"
                )}>
                  <div className="text-sm text-muted-foreground text-center">
                    {isMobile ? (
                      `${pagination.totalCount} users found`
                    ) : (
                      `Showing ${((pagination.page - 1) * 20) + 1} to ${Math.min(pagination.page * 20, pagination.totalCount)} of ${pagination.totalCount} users`
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size={isMobile ? "default" : "sm"}
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={!pagination.hasPrevPage}
                      className={cn(
                        isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px] px-4` : ""
                      )}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {!isMobile && "Previous"}
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size={isMobile ? "default" : "sm"}
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={!pagination.hasNextPage}
                      className={cn(
                        isMobile ? `h-[${TOUCH_TARGET_SIZE.comfortable}px] px-4` : ""
                      )}
                    >
                      {!isMobile && "Next"}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className={cn(
            "bg-blue-50 p-4 rounded-lg border border-blue-200",
            isMobile ? "p-3" : ""
          )}>
            <h4 className="font-medium text-blue-900 mb-2">💡 XP Management vs. Bulk Adjustments:</h4>
            <div className="text-sm text-blue-800 space-y-2">
              <div>
                <strong>This page (XP Management):</strong>
                <ul className="ml-4 space-y-1">
                  <li>• Sets absolute XP values (replaces current total)</li>
                  <li>• Individual user editing with search functionality</li>
                  <li>• Ideal for legacy data import and major corrections</li>
                  <li>• Example: Set user XP to exactly 1,250 points</li>
                </ul>
              </div>
              <div>
                <strong>User Management Bulk Adjustments:</strong>
                <ul className="ml-4 space-y-1">
                  <li>• Adds/subtracts XP from current totals</li>
                  <li>• Multiple user selection for batch operations</li>
                  <li>• Ideal for bonuses, penalties, or quick corrections</li>
                  <li>• Example: Add 100 XP bonus to selected users</li>
                </ul>
              </div>
              <p className="mt-2 font-medium">
                All changes are logged as XP transactions for complete audit trail.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

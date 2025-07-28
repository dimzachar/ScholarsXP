'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Award,
  Bot,
  Users,
  ExternalLink,
  Trophy,
  TrendingUp,
  TrendingDown
} from 'lucide-react'
import Link from 'next/link'

interface DetailedSubmission {
  id: string
  title: string
  url: string
  platform: string
  taskTypes: string[]
  status: string
  aiXp: number
  peerXp: number | null
  finalXp: number | null
  originalityScore: number | null
  consensusScore: number | null
  reviewCount: number
  createdAt: string
  weekNumber: number
  user: {
    username: string
    email: string
    role: string
  }
  peerReviews: Array<{
    reviewerId: string
    xpScore: number
    reviewer: {
      username: string
    }
  }>
}

interface DetailedLeaderboardTableProps {
  submissions: DetailedSubmission[]
  userRole?: string
  onSort?: (field: string) => void
  sortField?: string
  sortDirection?: 'asc' | 'desc'
}

export default function DetailedLeaderboardTable({ 
  submissions, 
  userRole,
  onSort,
  sortField,
  sortDirection
}: DetailedLeaderboardTableProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINALIZED': return 'bg-green-100 text-green-800'
      case 'UNDER_PEER_REVIEW': return 'bg-blue-100 text-blue-800'
      case 'AI_REVIEWED': return 'bg-yellow-100 text-yellow-800'
      case 'PENDING': return 'bg-gray-100 text-gray-800'
      case 'FLAGGED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getXpColor = (xp: number | null) => {
    if (xp === null) return 'text-muted-foreground'
    if (xp >= 80) return 'text-green-600'
    if (xp >= 60) return 'text-blue-600'
    if (xp >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getXpTrend = (aiXp: number, peerXp: number | null, finalXp: number | null) => {
    if (!peerXp || !finalXp) return null
    
    const avgScore = (aiXp + peerXp) / 2
    const difference = finalXp - avgScore
    
    if (Math.abs(difference) < 5) return null
    
    return difference > 0 ? (
      <TrendingUp className="h-3 w-3 text-green-600" />
    ) : (
      <TrendingDown className="h-3 w-3 text-red-600" />
    )
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-800'
      case 'REVIEWER': return 'bg-blue-100 text-blue-800'
      case 'USER': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleSort = (field: string) => {
    if (onSort) {
      onSort(field)
    }
  }

  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead 
      className={onSort ? "cursor-pointer hover:bg-muted/50" : ""}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <div className="text-xs">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </div>
        )}
      </div>
    </TableHead>
  )

  if (submissions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <div className="text-xl font-medium mb-2">No Submissions Found</div>
        <div className="text-sm">
          Try adjusting your filters or check back later for new submissions.
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader field="user.username">User</SortableHeader>
            <SortableHeader field="title">Submission</SortableHeader>
            <SortableHeader field="platform">Platform</SortableHeader>
            <TableHead>Tasks</TableHead>
            <SortableHeader field="aiXp">
              <div className="flex items-center justify-center gap-1">
                <Bot className="h-4 w-4 text-blue-600" />
                AI XP
              </div>
            </SortableHeader>
            <SortableHeader field="peerXp">
              <div className="flex items-center justify-center gap-1">
                <Users className="h-4 w-4 text-green-600" />
                Peer XP
              </div>
            </SortableHeader>
            <SortableHeader field="finalXp">
              <div className="flex items-center justify-center gap-1">
                <Award className="h-4 w-4 text-purple-600" />
                Final XP
              </div>
            </SortableHeader>
            <SortableHeader field="reviewCount">Reviews</SortableHeader>
            <SortableHeader field="status">Status</SortableHeader>
            <SortableHeader field="weekNumber">Week</SortableHeader>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((submission, index) => (
            <TableRow key={submission.id} className="hover:bg-muted/30">
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium">{submission.user.username}</div>
                  <Badge variant="outline" className={`text-xs ${getRoleColor(submission.user.role)}`}>
                    {submission.user.role}
                  </Badge>
                </div>
              </TableCell>
              
              <TableCell className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-medium truncate" title={submission.title}>
                    {submission.title}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(submission.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                <Badge variant="secondary">{submission.platform}</Badge>
              </TableCell>
              
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {submission.taskTypes.map((type, typeIndex) => (
                    <Badge key={typeIndex} variant="outline" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              
              <TableCell className="text-center">
                <div className="space-y-1">
                  <div className={`font-bold ${getXpColor(submission.aiXp)}`}>
                    {submission.aiXp}
                  </div>
                  {submission.originalityScore && (
                    <div className="text-xs text-muted-foreground">
                      {(submission.originalityScore * 100).toFixed(0)}% orig
                    </div>
                  )}
                </div>
              </TableCell>
              
              <TableCell className="text-center">
                <div className="space-y-1">
                  <div className={`font-bold ${getXpColor(submission.peerXp)}`}>
                    {submission.peerXp || 'N/A'}
                  </div>
                  {submission.consensusScore && (
                    <div className="text-xs text-muted-foreground">
                      {(submission.consensusScore * 100).toFixed(0)}% consensus
                    </div>
                  )}
                </div>
              </TableCell>
              
              <TableCell className="text-center">
                <div className="space-y-1">
                  <div className={`font-bold text-lg flex items-center justify-center gap-1 ${getXpColor(submission.finalXp)}`}>
                    {submission.finalXp || 'Pending'}
                    {getXpTrend(submission.aiXp, submission.peerXp, submission.finalXp)}
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                <div className="text-center space-y-1">
                  <div className="font-medium">{submission.reviewCount || 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {submission.status === 'LEGACY_IMPORTED' ? (
                      <span className="text-blue-600">Legacy</span>
                    ) : (submission.reviewCount || 0) >= 3 ? (
                      <span className="text-green-600">Complete</span>
                    ) : (
                      <span className="text-orange-600">{Math.max(0, 3 - (submission.reviewCount || 0))} needed</span>
                    )}
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                <Badge className={getStatusColor(submission.status)}>
                  {submission.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              
              <TableCell className="text-center">
                <div className="font-medium text-lg">{submission.weekNumber}</div>
              </TableCell>
              
              <TableCell>
                <div className="flex items-center gap-1">
                  <Link href={submission.url} target="_blank">
                    <Button variant="ghost" size="sm" title="View original submission">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </Link>
                  {userRole === 'ADMIN' && (
                    <Link href={`/admin/submissions/${submission.id}`}>
                      <Button variant="ghost" size="sm" title="Admin management">
                        <Award className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {/* Table Footer with Summary */}
      <div className="border-t bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-4">
            <div>
              Avg AI XP: {(submissions.reduce((sum, s) => sum + s.aiXp, 0) / submissions.length).toFixed(1)}
            </div>
            <div>
              Avg Peer XP: {(submissions.filter(s => s.peerXp).reduce((sum, s) => sum + (s.peerXp || 0), 0) / submissions.filter(s => s.peerXp).length || 0).toFixed(1)}
            </div>
            <div>
              Finalized: {submissions.filter(s => s.status === 'FINALIZED').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

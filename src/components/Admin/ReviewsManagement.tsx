'use client'

import React, { useState, useEffect } from 'react'
import { api } from '@/lib/api-client'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    Search,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Star,
    Clock,
    CheckCircle,
    LayoutList
} from 'lucide-react'

interface Review {
    id: string
    xpScore: number
    comments: string | null
    createdAt: string
    qualityRating: number | null
    isLate: boolean
    contentCategory: string | null
    qualityTier: string | null
    reviewer: {
        id: string
        username: string
        email: string
        profileImageUrl?: string | null
    }
}

interface SubmissionWithReviews {
    id: string
    url: string
    platform: string
    title: string | null
    finalXp: number | null
    peerReviews: Review[]
}

interface Pagination {
    page: number
    limit: number
    totalCount: number
    totalPages: number
}

function timeAgo(date: string | Date) {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    let interval = seconds / 31536000
    if (interval > 1) return Math.floor(interval) + " years ago"
    interval = seconds / 2592000
    if (interval > 1) return Math.floor(interval) + " months ago"
    interval = seconds / 86400
    if (interval > 1) return Math.floor(interval) + " days ago"
    interval = seconds / 3600
    if (interval > 1) return Math.floor(interval) + " hours ago"
    interval = seconds / 60
    if (interval > 1) return Math.floor(interval) + " minutes ago"
    return Math.floor(seconds) + " seconds ago"
}

export default function ReviewsManagement() {
    const [submissions, setSubmissions] = useState<SubmissionWithReviews[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [pagination, setPagination] = useState<Pagination>({
        page: 1,
        limit: 10,
        totalCount: 0,
        totalPages: 0
    })

    useEffect(() => {
        fetchReviews()
    }, [pagination.page, search])

    const fetchReviews = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
            })

            if (search) {
                params.append('search', search)
            }

            const response = await api.get(`/api/admin/reviews?${params.toString()}`)
            setSubmissions(response.submissions)
            setPagination(prev => ({ ...prev, ...response.pagination }))
        } catch (error) {
            console.error('Error fetching reviews:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setPagination(prev => ({ ...prev, page: 1 }))
    }

    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-emerald-600 font-bold'
        if (score >= 70) return 'text-blue-600 font-bold'
        if (score >= 40) return 'text-amber-600 font-bold'
        return 'text-red-600 font-bold'
    }

    return (
        <div className="space-y-6">
            <Card className="border-0 shadow-xl">
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <LayoutList className="h-5 w-5" />
                                Submission Reviews
                            </CardTitle>
                            <CardDescription>
                                View reviews grouped by submission
                            </CardDescription>
                        </div>
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search by title, URL or reviewer..."
                                    className="pl-8 w-[300px]"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <Button type="submit" variant="secondary">Search</Button>
                        </form>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-12 text-muted-foreground">
                            Loading submissions...
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            No submissions found with reviews.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {submissions.map((submission) => (
                                <Card key={submission.id} className="overflow-hidden border-muted">
                                    <div className="bg-muted/30 p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">{submission.platform}</Badge>
                                                <a
                                                    href={submission.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium hover:underline flex items-center gap-1 text-primary"
                                                >
                                                    {submission.title || submission.url}
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span>{submission.peerReviews.length} review{submission.peerReviews.length !== 1 ? 's' : ''}</span>
                                                {submission.finalXp !== null && (
                                                    <span className="flex items-center gap-1 font-medium text-emerald-600">
                                                        <CheckCircle className="h-3 w-3" />
                                                        Final XP: {submission.finalXp}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-0">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/10 hover:bg-muted/10">
                                                    <TableHead className="w-[200px]">Reviewer</TableHead>
                                                    <TableHead className="w-[180px]">Score & Details</TableHead>
                                                    <TableHead>Feedback</TableHead>
                                                    <TableHead className="w-[150px]">Date</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {submission.peerReviews.map((review) => (
                                                    <TableRow key={review.id}>
                                                        <TableCell className="align-top">
                                                            <div className="flex items-center gap-2">
                                                                <Avatar className="h-6 w-6">
                                                                    <AvatarImage src={review.reviewer.profileImageUrl || undefined} />
                                                                    <AvatarFallback className="text-[10px]">
                                                                        {review.reviewer.username.substring(0, 2).toUpperCase()}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium">{review.reviewer.username}</span>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="align-top">
                                                            <div className="flex flex-col gap-1.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={getScoreColor(review.xpScore)}>
                                                                        {review.xpScore} XP
                                                                    </span>
                                                                    {review.qualityRating && (
                                                                        <div className="flex items-center gap-0.5">
                                                                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                                                            <span className="text-xs text-muted-foreground">{review.qualityRating}/5</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {review.contentCategory && (
                                                                        <Badge variant="secondary" className="text-[10px] px-1 h-5">
                                                                            {review.contentCategory}
                                                                        </Badge>
                                                                    )}
                                                                    {review.qualityTier && (
                                                                        <Badge variant="outline" className="text-[10px] px-1 h-5">
                                                                            {review.qualityTier}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="align-top">
                                                            <div className="max-w-[500px]">
                                                                {review.comments ? (
                                                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                                                        {review.comments}
                                                                    </p>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground italic">No comments</span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="align-top">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                    <Clock className="h-3 w-3" />
                                                                    {timeAgo(review.createdAt)}
                                                                </div>
                                                                {review.isLate && (
                                                                    <Badge variant="destructive" className="w-fit text-[10px] px-1 py-0 h-4">
                                                                        Late
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-6">
                        <div className="text-sm text-muted-foreground">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} submissions
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                                disabled={pagination.page === 1 || loading}
                                title="First page"
                            >
                                First
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                disabled={pagination.page === 1 || loading}
                                title="Previous page"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={pagination.totalPages || 1}
                                    value={pagination.page}
                                    onChange={(e) => {
                                        const page = parseInt(e.target.value)
                                        if (page >= 1 && page <= (pagination.totalPages || 1)) {
                                            setPagination(prev => ({ ...prev, page }))
                                        }
                                    }}
                                    className="w-16 h-8 text-center text-sm"
                                    disabled={loading}
                                />
                                <span className="text-sm text-muted-foreground">of {pagination.totalPages || 1}</span>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                disabled={pagination.page >= pagination.totalPages || loading}
                                title="Next page"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPagination(prev => ({ ...prev, page: pagination.totalPages || 1 }))}
                                disabled={pagination.page >= pagination.totalPages || loading}
                                title="Last page"
                            >
                                Last
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

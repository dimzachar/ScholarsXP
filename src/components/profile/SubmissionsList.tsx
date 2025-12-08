'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Calendar, ExternalLink, CheckCircle2, Award, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'

interface Submission {
    id: string
    title: string
    url?: string
    platform?: string
    status: string
    xpAwarded?: number
    finalXp?: number
    createdAt: string
    isLegacy?: boolean
}

interface SubmissionsListProps {
    submissions: Submission[]
}

export function SubmissionsList({ submissions }: SubmissionsListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [sortOrder, setSortOrder] = useState('date-desc')
    const [statusFilter, setStatusFilter] = useState('all')
    const [hideLegacy, setHideLegacy] = useState(true)
    const [showAll, setShowAll] = useState(false)
    const [summaries, setSummaries] = useState<Record<string, string>>({})
    const [loadingSummaries, setLoadingSummaries] = useState<Record<string, boolean>>({})
    const { authenticatedFetch } = useAuthenticatedFetch()

    const filteredAndSortedSubmissions = useMemo(() => {
        let result = [...(submissions || [])]

        // Filter out legacy submissions if toggle is on
        if (hideLegacy) {
            result = result.filter((sub) => !sub.isLegacy)
        }

        // Filter by search term
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase()
            result = result.filter(
                (sub) =>
                    (sub.title && sub.title.toLowerCase().includes(lowerTerm)) ||
                    (sub.url && sub.url.toLowerCase().includes(lowerTerm))
            )
        }

        // Filter by status
        if (statusFilter !== 'all') {
            result = result.filter((sub) => sub.status.toLowerCase() === statusFilter.toLowerCase())
        }

        // Sort
        result.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime()
            const dateB = new Date(b.createdAt).getTime()

            if (sortOrder === 'date-desc') {
                return dateB - dateA
            } else if (sortOrder === 'date-asc') {
                return dateA - dateB
            }
            return 0
        })

        return result
    }, [submissions, searchTerm, sortOrder, statusFilter, hideLegacy])

    const formatDate = (dateString: string) => {
        const d = new Date(dateString)
        if (isNaN(d.getTime())) return '—'
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    }

    const getStatusColor = (status: string) => {
        const lowerStatus = status.toLowerCase()
        if (lowerStatus === 'completed' || lowerStatus === 'finalized') return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
        if (lowerStatus === 'pending') return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800'
        if (lowerStatus === 'rejected') return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
    }

    // Get unique statuses for the filter dropdown (respects legacy filter)
    const uniqueStatuses = useMemo(() => {
        let filtered = submissions || []
        if (hideLegacy) {
            filtered = filtered.filter(s => !s.isLegacy)
        }
        const statuses = new Set(filtered.map(s => s.status))
        return Array.from(statuses)
    }, [submissions, hideLegacy])

    // Check if there are any legacy submissions to show the toggle
    const hasLegacySubmissions = useMemo(() => {
        return submissions?.some(s => s.isLegacy) ?? false
    }, [submissions])

    const fetchSummary = useCallback(async (submissionId: string) => {
        if (summaries[submissionId] || loadingSummaries[submissionId]) return

        setLoadingSummaries(prev => ({ ...prev, [submissionId]: true }))
        try {
            const response = await authenticatedFetch(`/api/submissions/${submissionId}/ai-summary`)
            if (response.ok) {
                const data = await response.json()
                if (data.summary) {
                    setSummaries(prev => ({ ...prev, [submissionId]: data.summary }))
                }
            }
        } catch (error) {
            console.error('Failed to fetch summary', error)
        } finally {
            setLoadingSummaries(prev => ({ ...prev, [submissionId]: false }))
        }
    }, [summaries, loadingSummaries, authenticatedFetch])

    // Fetch summaries for finalized submissions
    useEffect(() => {
        const finalizedSubmissions = filteredAndSortedSubmissions.filter(
            sub => (sub.status.toLowerCase() === 'finalized' || sub.status.toLowerCase() === 'completed')
        )

        finalizedSubmissions.forEach(sub => {
            if (!summaries[sub.id] && !loadingSummaries[sub.id]) {
                fetchSummary(sub.id)
            }
        })
    }, [fetchSummary, filteredAndSortedSubmissions, loadingSummaries, summaries]) // Only re-run when submission IDs change

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-bold tracking-tight">My submissions</h2>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search submissions..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={sortOrder} onValueChange={setSortOrder}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="date-desc">Newest First</SelectItem>
                            <SelectItem value="date-asc">Oldest First</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            {uniqueStatuses.map((status) => (
                                <SelectItem key={status} value={status.toLowerCase()}>
                                    {status}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {hasLegacySubmissions && (
                        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background">
                            <Checkbox
                                id="hide-legacy"
                                checked={hideLegacy}
                                onCheckedChange={(checked) => setHideLegacy(checked === true)}
                            />
                            <Label htmlFor="hide-legacy" className="text-sm cursor-pointer whitespace-nowrap">
                                Hide legacy
                            </Label>
                        </div>
                    )}
                </div>
            </div>

            {/* Submission Cards */}
            <div className="grid gap-4">
                {filteredAndSortedSubmissions.length > 0 ? (
                    (showAll ? filteredAndSortedSubmissions : filteredAndSortedSubmissions.slice(0, 5)).map((sub) => {
                        const isFinalized = sub.status.toLowerCase() === 'finalized' || sub.status.toLowerCase() === 'completed'

                        return (
                            <Card key={sub.id} className="overflow-hidden transition-all hover:shadow-md">
                                <CardContent className="p-0">
                                    <div className="flex flex-col p-4 gap-2">
                                        {/* Top Row: Title/URL + Date */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <a
                                                    href={sub.url || '#'}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-semibold text-primary hover:underline truncate flex items-center gap-1.5"
                                                >
                                                    {sub.title || sub.url || 'Untitled Submission'}
                                                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                                                </a>
                                            </div>
                                            <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap">
                                                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                                                {formatDate(sub.createdAt)}
                                            </div>
                                        </div>

                                        {/* Bottom Row: Badges */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className={`${getStatusColor(sub.status)} px-2 py-0.5 text-xs font-medium border-0`}>
                                                {isFinalized && <CheckCircle2 className="mr-1 h-3 w-3" />}
                                                {sub.status}
                                            </Badge>

                                            {(sub.xpAwarded || sub.finalXp) && (
                                                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-0 px-2 py-0.5 text-xs font-medium flex items-center gap-1">
                                                    <Award className="h-3 w-3" />
                                                    {sub.xpAwarded ?? sub.finalXp} XP
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Feedback/Description Section */}
                                    {isFinalized && (
                                        <div className="bg-muted/30 px-4 py-3 border-t text-sm text-muted-foreground">
                                            {loadingSummaries[sub.id] ? (
                                                <div className="flex items-center gap-2 animate-pulse">
                                                    <div className="h-2 w-2 bg-primary/40 rounded-full animate-bounce" />
                                                    <span className="text-xs">Generating feedback summary...</span>
                                                </div>
                                            ) : summaries[sub.id] ? (
                                                <div className="space-y-1">
                                                    <p className="font-medium text-xs text-primary/80 uppercase tracking-wider flex items-center gap-1">
                                                        <Sparkles className="h-4 w-4 text-blue-500" />
                                                        AI Feedback Summary
                                                    </p>
                                                    <p className="leading-relaxed">{summaries[sub.id]}</p>
                                                </div>
                                            ) : (
                                                <p className="text-xs italic opacity-70">No feedback summary available.</p>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })
                ) : (
                    <div className="text-center py-12 border rounded-lg bg-muted/10 border-dashed">
                        <p className="text-muted-foreground">No submissions found matching your criteria.</p>
                        <Button
                            variant="link"
                            onClick={() => {
                                setSearchTerm('')
                                setStatusFilter('all')
                                setHideLegacy(false)
                            }}
                            className="mt-2"
                        >
                            Clear filters
                        </Button>
                    </div>
                )}
            </div>

            {/* Show More Button */}
            {filteredAndSortedSubmissions.length > 5 && (
                <div className="flex justify-center pt-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowAll(!showAll)}
                        className="min-w-[120px]"
                    >
                        {showAll ? 'Show Less' : 'Show More'}
                    </Button>
                </div>
            )}
        </div>
    )
}

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    Activity,
    ArrowLeft,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    ShieldCheck
} from 'lucide-react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

interface ShadowLog {
    id: string
    submissionId: string
    activeFormulaId: string
    activeScore: number
    shadowFormulaId: string
    shadowScore: number
    delta: number
    timestamp: string
    submission: {
        id: true
        title: string
        url: string
        status: string
    }
}

export default function ShadowModeDashboard() {
    const { user, isLoading: loading } = usePrivyAuthSync()
    const { authenticatedFetch } = useAuthenticatedFetch()
    const [logs, setLogs] = useState<ShadowLog[]>([])
    const [loadingData, setLoadingData] = useState(true)
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const limit = 20

    const fetchLogs = useCallback(async () => {
        try {
            setLoadingData(true)
            const response = await authenticatedFetch(`/api/admin/shadow-mode?limit=${limit}&offset=${offset}`)
            if (response.ok) {
                const data = await response.json()
                setLogs(data.logs)
                setTotal(data.total)
            }
        } catch (error) {
            console.error('Error fetching shadow logs:', error)
        } finally {
            setLoadingData(false)
        }
    }, [authenticatedFetch, offset])

    useEffect(() => {
        fetchLogs()
    }, [fetchLogs])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (user?.role !== 'ADMIN') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Card className="w-96">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Access Denied
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        You do not have permission to view this page.
                    </CardContent>
                </Card>
            </div>
        )
    }

    const chartData = [...logs].reverse().map(log => ({
        time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        delta: log.delta,
        active: log.activeScore,
        shadow: log.shadowScore,
        title: log.submission.title || 'Submission'
    }))

    const avgDelta = logs.length > 0
        ? logs.reduce((sum, l) => sum + Math.abs(l.delta), 0) / logs.length
        : 0

    const maxDelta = logs.length > 0
        ? Math.max(...logs.map(l => Math.abs(l.delta)))
        : 0

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/reliability-simulator">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold flex items-center gap-2">
                                <ShieldCheck className="h-8 w-8 text-primary" />
                                Shadow Mode Dashboard
                            </h1>
                            <p className="text-muted-foreground">
                                Comparing Active vs. Shadow reliability formulas in production
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingData}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loadingData ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Comparisons</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{total}</div>
                            <p className="text-xs text-muted-foreground mt-1">Live consensus events tracked</p>
                        </CardContent>
                    </Card>
                    <Card className={avgDelta > 10 ? 'bg-warning/5 border-warning/20' : 'bg-success/5 border-success/20'}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Average Delta</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold flex items-center gap-2">
                                {avgDelta.toFixed(2)} XP
                                {avgDelta > 0 ? <TrendingUp className="h-5 w-5 text-warning" /> : <TrendingDown className="h-5 w-5 text-success" />}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Mean deviation between formulas</p>
                        </CardContent>
                    </Card>
                    <Card className={maxDelta > 25 ? 'bg-destructive/5 border-destructive/20' : 'bg-info/5 border-info/20'}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Max Deviation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{maxDelta.toFixed(2)} XP</div>
                            <p className="text-xs text-muted-foreground mt-1">Largest single disagreement</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Chart */}
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-primary" />
                            Delta Trend
                        </CardTitle>
                        <CardDescription>Deviation of Shadow Formula from Active Formula over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                    <XAxis dataKey="time" />
                                    <YAxis />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                                    />
                                    <Legend />
                                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                                    <Line
                                        type="monotone"
                                        dataKey="delta"
                                        name="Delta (XP)"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Logs Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Comparisons</CardTitle>
                        <CardDescription>Detailed breakdown of individual consensus events</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Submission</TableHead>
                                    <TableHead>Active Formula</TableHead>
                                    <TableHead>Shadow Formula</TableHead>
                                    <TableHead className="text-right">Delta</TableHead>
                                    <TableHead className="text-right">Time</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            No shadow mode logs found yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium max-w-[300px] truncate">
                                                        {log.submission.title || 'Untitled Submission'}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground font-mono">
                                                        {log.submissionId.slice(0, 8)}...
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-mono">{log.activeScore.toFixed(2)} XP</span>
                                                    <Badge variant="outline" className="w-fit text-[10px] px-1 py-0 h-4">
                                                        {log.activeFormulaId}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-mono">{log.shadowScore.toFixed(2)} XP</span>
                                                    <Badge variant="secondary" className="w-fit text-[10px] px-1 py-0 h-4">
                                                        {log.shadowFormulaId}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={`font-bold font-mono ${Math.abs(log.delta) > 20 ? 'text-destructive' :
                                                        Math.abs(log.delta) > 10 ? 'text-warning' :
                                                            'text-success'
                                                    }`}>
                                                    {log.delta > 0 ? '+' : ''}{log.delta.toFixed(2)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground text-sm">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {/* Pagination */}
                        <div className="flex items-center justify-between mt-6">
                            <div className="text-sm text-muted-foreground">
                                Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} logs
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOffset(Math.max(0, offset - limit))}
                                    disabled={offset === 0}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOffset(offset + limit)}
                                    disabled={offset + limit >= total}
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

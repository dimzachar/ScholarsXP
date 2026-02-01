'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { isAdmin } from '@/lib/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LiveDashboard } from '@/components/Admin/live-monitor/LiveDashboard'
import { LiveFeed } from '@/components/Admin/live-monitor/LiveFeed'
import { LiveWatchlist } from '@/components/Admin/live-monitor/LiveWatchlist'
import { ActiveVote, ConsensusEvent, WatchlistReviewer } from './types'

export default function LiveMonitorPage() {
    const { user, isLoading: loading } = usePrivyAuthSync()
    const { authenticatedFetch } = useAuthenticatedFetch()

    const [data, setData] = useState<{
        activeVotes: ActiveVote[]
        recentConsensus: ConsensusEvent[]
        watchlist: WatchlistReviewer[]
        config: any
    } | null>(null)

    const [loadingData, setLoadingData] = useState(true)
    const [isPolling, setIsPolling] = useState(true)
    const [currentView, setCurrentView] = useState<'dashboard' | 'feed' | 'watchlist'>('dashboard')

    const fetchData = useCallback(async () => {
        try {
            setLoadingData(true)
            const response = await authenticatedFetch('/api/admin/live-monitor')
            if (response.ok) {
                const newData = await response.json()
                setData(newData)
            }
        } catch (error) {
            console.error('Error fetching live monitor data:', error)
        } finally {
            setLoadingData(false)
        }
    }, [authenticatedFetch])

    useEffect(() => {
        fetchData()
        if (isPolling) {
            const interval = setInterval(fetchData, 15000) // 15s polling
            return () => clearInterval(interval)
        }
    }, [fetchData, isPolling])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f6f7f8] dark:bg-[#101922]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#137fec]"></div>
            </div>
        )
    }

    if (!isAdmin(user?.role)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f6f7f8] dark:bg-[#101922]">
                <Card className="w-96 text-center">
                    <CardHeader>
                        <CardTitle className="text-destructive">Access Denied</CardTitle>
                    </CardHeader>
                    <CardContent>Admin privileges required.</CardContent>
                </Card>
            </div>
        )
    }

    // Render the appropriate view
    switch (currentView) {
        case 'feed':
            return <LiveFeed data={data} onViewChange={setCurrentView} />
        case 'watchlist':
            return <LiveWatchlist data={data} onViewChange={setCurrentView} />
        case 'dashboard':
        default:
            return (
                <LiveDashboard
                    data={data}
                    onRefresh={fetchData}
                    loading={loadingData}
                    onViewChange={setCurrentView}
                />
            )
    }
}

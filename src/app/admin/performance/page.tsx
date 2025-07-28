'use client'

import { PerformanceDashboard } from '@/components/Admin/PerformanceDashboard'

// Force rebuild - fixed case sensitivity issue

export default function AdminPerformancePage() {
  return (
    <div className="container mx-auto py-6">
      <PerformanceDashboard />
    </div>
  )
}

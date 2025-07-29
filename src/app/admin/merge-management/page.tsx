/**
 * Admin Merge Management Page
 * 
 * Provides admin interface for monitoring and managing legacy account merges.
 * Includes system health monitoring, merge history, and manual intervention tools.
 */

import { Metadata } from 'next'
import MergeManagement from '@/components/Admin/MergeManagement'

export const metadata: Metadata = {
  title: 'Merge Management - Admin',
  description: 'Monitor and manage legacy account merge operations',
}

export default function MergeManagementPage() {
  return (
    <div className="container mx-auto py-6">
      <MergeManagement />
    </div>
  )
}

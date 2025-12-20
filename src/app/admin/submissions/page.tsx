'use client'

import SubmissionsManagement from '@/components/Admin/SubmissionsManagement'

export default function AdminSubmissionsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        <SubmissionsManagement />
      </div>
    </div>
  )
}

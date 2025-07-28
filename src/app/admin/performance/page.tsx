'use client'

import React from 'react'

// Temporary placeholder component to fix build issue
function PerformanceDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Performance Dashboard</h1>
      <p className="text-gray-600">Performance monitoring dashboard is temporarily unavailable.</p>
    </div>
  )
}

export default function AdminPerformancePage() {
  return (
    <div className="container mx-auto py-6">
      <PerformanceDashboard />
    </div>
  )
}

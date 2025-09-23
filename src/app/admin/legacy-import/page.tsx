'use client'
/* eslint react/no-unescaped-entities: off */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react'

interface ImportResult {
  success: boolean
  message: string
  imported?: number
  errors?: string[]
  duplicates?: number
  duplicateDetails?: { url: string; type: 'LEGACY' | 'CURRENT' }[]
}

export default function LegacyImportPage() {
  const [csvData, setCsvData] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [progress, setProgress] = useState<{ total: number; processed: number; imported: number; duplicates: number; errors: number; etaSec: number } | null>(null)
  const [chunkSize, setChunkSize] = useState(100)

  const handleImport = async () => {
    if (!csvData.trim()) {
      setResult({
        success: false,
        message: 'Please paste CSV data before importing'
      })
      return
    }

    setIsLoading(true)
    setResult(null)
    setProgress(null)

    try {
      // Split into lines and batch import for progress visibility
      const rawLines = csvData.trim().split('\n').map(l => l.trim()).filter(Boolean)
      const lines = rawLines[0]?.toLowerCase().startsWith('timestamp') ? rawLines.slice(1) : rawLines

      const total = lines.length
      const startedAt = Date.now()
      let processed = 0
      let imported = 0
      let duplicates = 0
      let allErrors: string[] = []
      let duplicateDetailsAgg: { url: string; type: 'LEGACY' | 'CURRENT' }[] = []

      // Helper to update progress and ETA
      const updateProgress = () => {
        const elapsedSec = (Date.now() - startedAt) / 1000
        const rate = processed > 0 ? processed / Math.max(elapsedSec, 0.001) : 0
        const remaining = Math.max(total - processed, 0)
        const etaSec = rate > 0 ? remaining / rate : 0
        setProgress({ total, processed, imported, duplicates, errors: allErrors.length, etaSec })
      }

      for (let i = 0; i < total; i += chunkSize) {
        const batch = lines.slice(i, i + chunkSize)
        const response = await fetch('/api/admin/import-legacy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvData: batch.join('\n') })
        })
        const data = await response.json()
        if (response.ok) {
          imported += data.imported || 0
          duplicates += data.duplicates || 0
          if (Array.isArray(data.errors)) allErrors = allErrors.concat(data.errors)
          if (Array.isArray(data.duplicateDetails)) duplicateDetailsAgg = duplicateDetailsAgg.concat(data.duplicateDetails)
        } else {
          allErrors.push(data.error || `Batch ${i / chunkSize + 1} failed`)
        }
        processed += batch.length
        updateProgress()
      }

      setResult({
        success: true,
        message: `Legacy import completed: ${imported} imported, ${duplicates} duplicates skipped, ${allErrors.length} errors`,
        imported,
        duplicates,
        errors: allErrors,
        duplicateDetails: duplicateDetailsAgg
      })
      // Clear form on success
      setCsvData('')
    } catch {
      setResult({
        success: false,
        message: 'Network error occurred during import'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const downloadTemplate = () => {
    const template = `Timestamp	Discord Handle	Role	Submission Link	XP	Notes
4/28/2025 15:59	tr2uochy	Initiate	https://x.com/tr2uochy/status/1916854557097034232	25	Great analysis
4/29/2025 10:30	scholar456	Scholar Apprentice	https://medium.com/@user/article		Excellent research (no XP - assign later)
4/30/2025 14:20	newuser	Initiate	https://twitter.com/newuser/status/456	0	Zero XP example`
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'legacy_submissions_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>📊 Legacy Data Import</CardTitle>
          <CardDescription>
            Import Google Forms submission data to prevent duplicate submissions and maintain historical records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">Expected CSV Format:</h4>
            <p className="text-sm text-blue-800 mb-3">
              Your CSV should have these columns (tab-separated):
            </p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Timestamp</strong> - When the submission was made</li>
              <li>• <strong>Discord Handle</strong> - User's Discord username</li>
              <li>• <strong>Role</strong> - Their role at time of submission</li>
              <li>• <strong>Submission Link</strong> - URL to their content</li>
              <li>• <strong>XP</strong> - XP value to award (optional - defaults to 0)</li>
              <li>• <strong>Notes</strong> - Any additional notes (optional)</li>
            </ul>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={downloadTemplate}
              className="mt-3"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="csvData">CSV Data</Label>
              <Textarea
                id="csvData"
                placeholder="Paste your Google Forms CSV export here..."
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                disabled={isLoading}
                rows={12}
                className="font-mono text-sm"
              />
              <div className="flex items-center gap-3 mt-2">
                <Label htmlFor="chunkSize" className="text-sm">Batch size</Label>
                <input
                  id="chunkSize"
                  type="number"
                  min={25}
                  max={500}
                  step={25}
                  value={chunkSize}
                  disabled={isLoading}
                  onChange={(e) => setChunkSize(Math.max(25, Math.min(500, Number(e.target.value) || 100)))}
                  className="w-24 border rounded px-2 py-1 text-sm"
                />
                <span className="text-xs text-gray-500">Lower if DB is flaky</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Copy and paste the entire CSV content from your Google Forms export
              </p>
            </div>

            <Button 
              onClick={handleImport}
              disabled={isLoading || !csvData.trim()}
              className="w-full"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isLoading ? 'Importing Legacy Data...' : 'Import Legacy Data'}
            </Button>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Progress: {progress.processed} / {progress.total}</span>
                <span>ETA: {Math.ceil(progress.etaSec)}s</span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded">
                <div
                  className="h-3 bg-blue-600 rounded"
                  style={{ width: `${Math.min(100, (progress.processed / Math.max(progress.total, 1)) * 100)}%` }}
                />
              </div>
              <div className="text-xs text-gray-600">
                Imported: {progress.imported} • Duplicates: {progress.duplicates} • Errors: {progress.errors}
              </div>
            </div>
          )}

          {result && (
            <Alert className={result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={result.success ? 'text-green-800' : 'text-red-800'}>
                <p className="font-medium mb-1">
                  {result.success ? 'Import Successful!' : 'Import Failed'}
                </p>
                <p className="text-sm">{result.message}</p>
                
                {result.success && (
                  <div className="mt-2 p-2 bg-white rounded border border-green-200">
                    <p className="text-sm font-medium text-green-900">Import Summary:</p>
                    <ul className="text-sm text-green-800 mt-1">
                      <li>• Imported: {result.imported} submissions</li>
                      {result.duplicates && result.duplicates > 0 && (
                        <li>• Duplicates skipped: {result.duplicates}</li>
                      )}
                      {result.errors && result.errors.length > 0 && (
                        <li>• Errors: {result.errors.length}</li>
                      )}
                    </ul>

                    {result.duplicateDetails && result.duplicateDetails.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-green-900">Duplicate URLs (first 10 shown):</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const header = 'url,type\n'
                              const rows = (result.duplicateDetails || []).map(d => `${d.url},${d.type}`).join('\n')
                              const csv = header + rows
                              const blob = new Blob([csv], { type: 'text/csv' })
                              const url = window.URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = 'legacy_import_duplicates.csv'
                              a.click()
                              window.URL.revokeObjectURL(url)
                            }}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download duplicates (CSV)
                          </Button>
                        </div>
                        <ul className="text-sm text-green-800 mt-1 max-h-40 overflow-y-auto list-disc pl-5">
                          {(result.duplicateDetails || []).slice(0, 10).map((d, i) => (
                            <li key={`${d.url}-${i}`} className="truncate">
                              <span className="font-mono">{d.url}</span>
                              <span className="ml-2 text-xs text-gray-600">[{d.type}]</span>
                            </li>
                          ))}
                          {result.duplicateDetails.length > 10 && (
                            <li>... and {result.duplicateDetails.length - 10} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {result.errors && result.errors.length > 0 && (
                  <div className="mt-2 p-2 bg-white rounded border border-red-200">
                    <p className="text-sm font-medium text-red-900">Errors:</p>
                    <ul className="text-sm text-red-800 mt-1 max-h-32 overflow-y-auto">
                      {result.errors.slice(0, 10).map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                      {result.errors.length > 10 && (
                        <li>• ... and {result.errors.length - 10} more errors</li>
                      )}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h4 className="font-medium text-yellow-900 mb-2">⚠️ Important Notes:</h4>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• XP column is optional - leave empty if XP data is missing</li>
              <li>• Users with 0 XP will be created and can be assigned XP later via XP Management</li>
              <li>• Duplicate URLs will be automatically skipped</li>
              <li>• Content fingerprints will be generated for similarity detection</li>
              <li>• Users cannot resubmit these URLs for XP in the new system</li>
              <li>• This process can be run multiple times safely</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

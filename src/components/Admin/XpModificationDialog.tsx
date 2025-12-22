'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Award, RefreshCw } from 'lucide-react'

interface XpModificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submissionId: string
  currentXp: number
  xpType: 'ai' | 'peer' | 'final'
  onSuccess: () => void
}

export default function XpModificationDialog({
  open,
  onOpenChange,
  submissionId,
  currentXp,
  xpType,
  onSuccess,
  isLegacySubmission = false
}: XpModificationDialogProps) {
  const [newXp, setNewXp] = useState(currentXp.toString())
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const validateInput = () => {
    const errors: string[] = []
    const xpValue = parseInt(newXp)

    if (isNaN(xpValue)) {
      errors.push('XP must be a valid number')
    } else {
      if (xpValue < 0) {
        errors.push('XP cannot be negative')
      }
      if (xpValue > 10000) {
        errors.push('XP cannot exceed 10,000 points')
      }
    }

    if (!reason.trim()) {
      errors.push('Reason is required')
    } else if (reason.trim().length < 5) {
      errors.push('Reason must be at least 5 characters long')
    }

    const difference = Math.abs(xpValue - currentXp)
    if (difference > 1000) {
      errors.push('XP changes greater than 1,000 points require additional confirmation')
    }

    setValidationErrors(errors)
    return errors.length === 0
  }

  const handleSubmit = () => {
    if (!validateInput()) {
      return
    }

    const difference = Math.abs(parseInt(newXp) - currentXp)
    if (difference > 100) {
      setShowConfirmation(true)
    } else {
      performXpUpdate()
    }
  }

  const performXpUpdate = async () => {
    try {
      setLoading(true)
      setError(null)

      const xpValue = parseInt(newXp)
      const endpoint = `/api/admin/submissions/${submissionId}`

      const requestBody = {
        action: 'updateXp',
        data: {
          xpType,
          xpAwarded: xpValue,
          reason: reason.trim()
        }
      }

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update XP')
      }

      // Success
      onSuccess()
      onOpenChange(false)
      resetForm()

    } catch (error) {
      console.error('Error updating XP:', error)
      setError(error instanceof Error ? error.message : 'Failed to update XP')
    } finally {
      setLoading(false)
      setShowConfirmation(false)
    }
  }

  const resetForm = () => {
    setNewXp(currentXp.toString())
    setReason('')
    setError(null)
    setValidationErrors([])
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  const xpDifference = parseInt(newXp) - currentXp
  const isIncrease = xpDifference > 0
  const isSignificantChange = Math.abs(xpDifference) > 100

  // Check if form is valid for real-time button enabling
  const isFormValid = reason.trim().length >= 5 && !isNaN(parseInt(newXp)) && parseInt(newXp) >= 0

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Modify {xpType.toUpperCase()} XP
            </DialogTitle>
            <DialogDescription>
              Update the {xpType} XP score for this submission. All changes will be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current vs New XP Display */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Current XP</div>
                <div className="text-2xl font-bold">{currentXp.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">New XP</div>
                <div className={`text-2xl font-bold ${
                  isNaN(parseInt(newXp)) ? 'text-muted-foreground' : 
                  isIncrease ? 'text-green-600' : 
                  xpDifference < 0 ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {isNaN(parseInt(newXp)) ? '—' : parseInt(newXp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* XP Difference Indicator */}
            {!isNaN(parseInt(newXp)) && xpDifference !== 0 && (
              <div className={`text-center p-2 rounded-lg ${
                isIncrease ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                <div className="font-medium">
                  {isIncrease ? '+' : ''}{xpDifference.toLocaleString()} XP change
                </div>
                {isSignificantChange && (
                  <div className="text-sm">
                    ⚠️ Significant change - requires confirmation
                  </div>
                )}
              </div>
            )}

            {/* New XP Input */}
            <div className="space-y-2">
              <Label htmlFor="newXp">New XP Value</Label>
              <Input
                id="newXp"
                type="number"
                min="0"
                max="10000"
                value={newXp}
                onChange={(e) => setNewXp(e.target.value)}
                placeholder="Enter new XP value"
              />
            </div>

            {/* Reason Input */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Change *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this XP modification is necessary..."
                rows={3}
              />
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !isFormValid}
            >
              {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Update XP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Large Changes */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Confirm Large XP Change
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to make a significant XP change of{' '}
              <strong className={isIncrease ? 'text-green-600' : 'text-red-600'}>
                {isIncrease ? '+' : ''}{xpDifference} points
              </strong>.
              <br /><br />
              This will update the user's total XP, weekly stats, and leaderboard position.
              Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performXpUpdate} disabled={loading}>
              {loading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

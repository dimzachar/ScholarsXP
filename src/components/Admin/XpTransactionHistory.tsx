'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { History, TrendingUp, RefreshCw, Calendar, User, AlertTriangle, Award, Settings } from 'lucide-react'

interface XpTransaction {
  id: string
  amount: number
  type: string
  description: string
  createdAt: string
  weekNumber: number
}

interface XpTransactionHistoryProps {
  submissionId: string
}

export default function XpTransactionHistory({ submissionId }: XpTransactionHistoryProps) {
  const [transactions, setTransactions] = useState<XpTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTransactions()
  }, [submissionId])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/admin/submissions/${submissionId}/xp-transactions`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.status}`)
      }

      const data = await response.json()
      setTransactions(data.transactions || [])
    } catch (error) {
      console.error('Error fetching XP transactions:', error)
      setError(error instanceof Error ? error.message : 'Failed to load transaction history')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'SUBMISSION_REWARD':
        return <Award className="h-4 w-4 text-blue-600" />
      case 'REVIEW_REWARD':
        return <User className="h-4 w-4 text-green-600" />
      case 'ADMIN_ADJUSTMENT':
        return <Settings className="h-4 w-4 text-purple-600" />
      case 'PENALTY':
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      case 'STREAK_BONUS':
        return <TrendingUp className="h-4 w-4 text-orange-600" />
      case 'ACHIEVEMENT_BONUS':
        return <Award className="h-4 w-4 text-yellow-600" />
      default:
        return <History className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'SUBMISSION_REWARD':
        return 'bg-blue-100 text-blue-800'
      case 'REVIEW_REWARD':
        return 'bg-green-100 text-green-800'
      case 'ADMIN_ADJUSTMENT':
        return 'bg-purple-100 text-purple-800'
      case 'PENALTY':
        return 'bg-red-100 text-red-800'
      case 'STREAK_BONUS':
        return 'bg-orange-100 text-orange-800'
      case 'ACHIEVEMENT_BONUS':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatTransactionType = (type: string) => {
    return type.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
  }

  const totalXpChange = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  const positiveTransactions = transactions.filter(tx => tx.amount > 0)
  const negativeTransactions = transactions.filter(tx => tx.amount < 0)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            XP Transaction History
          </CardTitle>
          <CardDescription>
            Audit trail of all XP-related changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            XP Transaction History
          </CardTitle>
          <CardDescription>
            Audit trail of all XP-related changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button 
            variant="outline" 
            onClick={fetchTransactions}
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              XP Transaction History ({transactions.length})
            </CardTitle>
            <CardDescription>
              Audit trail of all XP-related changes
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTransactions}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <div className="text-lg font-medium mb-2">No Transactions Found</div>
            <div className="text-sm">
              No XP transactions have been recorded for this submission yet.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Stats */}
            {transactions.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg mb-6">
                <div className="text-center">
                  <div className={`text-lg font-bold ${
                    totalXpChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {totalXpChange >= 0 ? '+' : ''}{totalXpChange.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Net XP Change</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">
                    {positiveTransactions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Positive</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">
                    {negativeTransactions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Negative</div>
                </div>
              </div>
            )}

            {/* Transaction List */}
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">
                      {getTransactionIcon(transaction.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getTransactionTypeColor(transaction.type)}>
                          {formatTransactionType(transaction.type)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Week {transaction.weekNumber}
                        </Badge>
                      </div>
                      <div className="font-medium text-sm mb-1">
                        {transaction.description}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(transaction.createdAt)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {transaction.amount >= 0 ? '+' : ''}{transaction.amount}
                    </div>
                    <div className="text-xs text-muted-foreground">XP</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline Visualization */}
            {transactions.length > 2 && (
              <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  XP Timeline
                </h4>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border"></div>
                  <div className="space-y-4">
                    {transactions.slice(0, 5).map((transaction, index) => (
                      <div key={transaction.id} className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          transaction.amount >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                        }`}>
                          {transaction.amount >= 0 ? '+' : ''}{transaction.amount}
                        </div>
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-muted-foreground text-xs">
                            {formatDate(transaction.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {transactions.length > 5 && (
                      <div className="text-center text-sm text-muted-foreground">
                        ... and {transactions.length - 5} more transactions
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

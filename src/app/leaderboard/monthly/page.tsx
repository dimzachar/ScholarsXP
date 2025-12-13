import MonthlyLeaderboard from '@/components/leaderboard/MonthlyLeaderboardNew'
import AuthGuard from '@/components/Auth/AuthGuard'

export default function MonthlyLeaderboardPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
        <div className="container mx-auto p-4">
          <MonthlyLeaderboard />
        </div>
      </div>
    </AuthGuard>
  )
}

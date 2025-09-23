import MonthlyLeaderboard from '@/components/leaderboard/MonthlyLeaderboardNew'
import AuthGuard from '@/components/Auth/AuthGuard'

export default function MonthlyLeaderboardPage() {
  return (
    <AuthGuard>
      <div className="container mx-auto p-4">
        <MonthlyLeaderboard />
      </div>
    </AuthGuard>
  )
}

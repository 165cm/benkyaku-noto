import { useState, useEffect } from 'react'
import { Clock, BookOpen, TrendingUp, Award } from 'lucide-react'
import Card from '@/components/Card'
import { calculateStudyStats } from '@/lib/review'
import type { StudyStats } from '@/types'

export default function Stats() {
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setLoading(true)
    const data = await calculateStudyStats()
    setStats(data)
    setLoading(false)
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}時間${minutes}分`
    }
    return `${minutes}分`
  }

  if (loading || !stats) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">学習統計</h1>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">今日の学習時間</p>
              <p className="text-2xl font-bold">
                {formatTime(stats.todayStudyTime)}
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="text-blue-600" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">今週の学習時間</p>
              <p className="text-2xl font-bold">
                {formatTime(stats.weekStudyTime)}
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="text-green-600" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">累計問題数</p>
              <p className="text-2xl font-bold">
                {stats.totalProblemsSolved}
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <BookOpen className="text-purple-600" size={24} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">正答率</p>
              <p className="text-2xl font-bold">{stats.correctRate}%</p>
            </div>
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Award className="text-yellow-600" size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* 週間グラフ */}
      <Card className="mb-8">
        <h2 className="text-lg font-semibold mb-4">週間学習時間</h2>
        <div className="space-y-3">
          {stats.weeklyData.map((day) => {
            const maxTime = Math.max(...stats.weeklyData.map((d) => d.studyTime))
            const percentage = maxTime > 0 ? (day.studyTime / maxTime) * 100 : 0
            const date = new Date(day.date)
            const dayLabel = date.toLocaleDateString('ja-JP', {
              month: 'short',
              day: 'numeric',
              weekday: 'short',
            })

            return (
              <div key={day.date}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600">{dayLabel}</span>
                  <span className="font-medium">
                    {formatTime(day.studyTime)} ({day.problemsSolved}問)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 総合情報 */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">累計学習時間</h2>
        <div className="text-center py-8">
          <p className="text-4xl font-bold mb-2">
            {formatTime(stats.totalStudyTime)}
          </p>
          <p className="text-gray-600">
            これまでに {stats.totalProblemsSolved} 問の学習記録を作成しました
          </p>
        </div>
      </Card>
    </div>
  )
}

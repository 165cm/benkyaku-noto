import { useState, useEffect } from 'react'
import { Clock, BookOpen, TrendingUp, Award } from 'lucide-react'
import Card from '@/components/Card'
import { calculateStudyStatsByWorkbook } from '@/lib/review'
import { getWorkbooks } from '@/lib/db'
import type { StudyStats, Workbook } from '@/types'

export default function Stats() {
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('')

  useEffect(() => {
    loadWorkbooks()
  }, [])

  useEffect(() => {
    loadStats()
  }, [selectedWorkbookId])

  const loadWorkbooks = async () => {
    const data = await getWorkbooks()
    setWorkbooks(data)
  }

  const loadStats = async () => {
    setLoading(true)
    const workbookId = selectedWorkbookId || undefined
    const data = await calculateStudyStatsByWorkbook(workbookId)
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">学習統計</h1>

        {/* 問題集選択ドロップダウン */}
        {workbooks.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">問題集:</label>
            <select
              value={selectedWorkbookId}
              onChange={(e) => setSelectedWorkbookId(e.target.value)}
              className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">全体</option>
              {workbooks.map((workbook) => (
                <option key={workbook.id} value={workbook.id}>
                  {workbook.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card>
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

        <Card>
          <h2 className="text-lg font-semibold mb-4">週間正答率</h2>
          <div className="space-y-3">
            {stats.weeklyData.map((day) => {
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
                      {day.accuracy !== null && day.accuracy !== undefined ? (
                        <>
                          {day.accuracy}% ({day.problemsSolved}問)
                        </>
                      ) : (
                        <span className="text-gray-400">データなし</span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    {day.accuracy !== null && day.accuracy !== undefined ? (
                      <div
                        className={`rounded-full h-2 transition-all ${
                          day.accuracy >= 80
                            ? 'bg-green-500'
                            : day.accuracy >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${day.accuracy}%` }}
                      />
                    ) : (
                      <div className="bg-gray-300 rounded-full h-2 w-0" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

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

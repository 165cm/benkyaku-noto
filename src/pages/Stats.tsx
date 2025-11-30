import { useState, useEffect } from 'react'
import { Clock, BookOpen, TrendingUp, Award, Info, AlertCircle } from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import Card from '@/components/Card'
import { calculateStudyStatsByWorkbook } from '@/lib/review'
import { getWorkbooks } from '@/lib/db'
import type { StudyStats, Workbook } from '@/types'

export default function Stats() {
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('')

  useEffect(() => {
    loadWorkbooks()
  }, [])

  useEffect(() => {
    loadStats()
  }, [selectedWorkbookId])

  const loadWorkbooks = async () => {
    try {
      const data = await getWorkbooks()
      setWorkbooks(data)
    } catch (err) {
      console.error('Failed to load workbooks:', err)
      setError('問題集の読み込みに失敗しました')
    }
  }

  const loadStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const workbookId = selectedWorkbookId || undefined
      const data = await calculateStudyStatsByWorkbook(workbookId)
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
      setError('統計の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">統計を読み込んでいます...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card>
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle size={24} />
            <div>
              <p className="font-semibold">エラーが発生しました</p>
              <p className="text-sm text-gray-600">{error}</p>
              <button
                onClick={loadStats}
                className="mt-3 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                再読み込み
              </button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card>
          <div className="text-center py-8">
            <BookOpen className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-gray-600 mb-2">まだ学習記録がありません</p>
            <p className="text-sm text-gray-500">問題集を追加して学習を開始しましょう</p>
          </div>
        </Card>
      </div>
    )
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
              <div className="flex items-center gap-1 mb-1">
                <p className="text-sm text-gray-600">今日の学習時間</p>
                <span title="日付は夜中の3時で更新されます（0時〜2時59分は前日扱い）" className="inline-flex cursor-help">
                  <Info size={14} className="text-gray-400" />
                </span>
              </div>
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
              <div className="flex items-center gap-1 mb-1">
                <p className="text-sm text-gray-600">今週の学習時間</p>
                <span title="日付は夜中の3時で更新されます（0時〜2時59分は前日扱い）" className="inline-flex cursor-help">
                  <Info size={14} className="text-gray-400" />
                </span>
              </div>
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
              <div className="flex items-center gap-1 mb-1">
                <p className="text-sm text-gray-600">正答率</p>
                <span title="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）" className="inline-flex cursor-help">
                  <Info size={14} className="text-gray-400" />
                </span>
              </div>
              <p className="text-2xl font-bold">{stats.correctRate}%</p>
            </div>
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Award className="text-yellow-600" size={24} />
            </div>
          </div>
        </Card>
      </div>

      {/* 週間グラフ - Recharts */}
      <Card className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">週間の推移</h2>
          <span title="学習時間と正答率の7日間の推移（日付は夜中の3時で更新）" className="inline-flex cursor-help">
            <Info size={16} className="text-gray-400" />
          </span>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={stats.weeklyData.map(day => ({
              ...day,
              dateLabel: new Date(day.date).toLocaleDateString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
              }),
              studyTimeMinutes: Math.round(day.studyTime / 60),
            }))}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="#3b82f6"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `${Math.floor(value / 60)}:${(value % 60).toString().padStart(2, '0')}`}
              label={{ value: '学習時間', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#10b981"
              tick={{ fontSize: 12 }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              label={{ value: '正答率', angle: 90, position: 'insideRight', style: { fontSize: 12 } }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const data = payload[0].payload
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="font-semibold text-sm mb-2">{data.dateLabel}</p>
                    <p className="text-xs text-blue-600">
                      学習時間: {formatTime(data.studyTime)} ({data.problemsSolved}問)
                    </p>
                    {data.accuracy !== null && data.accuracy !== undefined && (
                      <p className="text-xs text-green-600">
                        正答率: {data.accuracy}%
                      </p>
                    )}
                  </div>
                )
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 14 }}
              iconType="line"
            />
            <Bar
              yAxisId="left"
              dataKey="studyTime"
              fill="#3b82f6"
              opacity={0.8}
              name="学習時間(秒)"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="accuracy"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ fill: '#10b981', strokeWidth: 2, r: 5, stroke: '#fff' }}
              activeDot={{ r: 7 }}
              name="正答率(%)"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
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

import { useState, useEffect } from 'react'
import { Clock, BookOpen, TrendingUp, Award, Info, AlertCircle } from 'lucide-react'
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

      {/* 週間グラフ - 折れ線グラフ */}
      <Card className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">週間の推移</h2>
          <span title="学習時間と正答率の7日間の推移（日付は夜中の3時で更新）" className="inline-flex cursor-help">
            <Info size={16} className="text-gray-400" />
          </span>
        </div>

        <div className="relative h-64 mb-8">
          {/* Y軸ラベル（学習時間） */}
          <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-gray-500 pr-2">
            {(() => {
              const maxTime = Math.max(...stats.weeklyData.map(d => d.studyTime), 1)
              const step = Math.ceil(maxTime / 4 / 300) * 300 // 5分刻み
              return [4, 3, 2, 1, 0].map(i => (
                <span key={i}>{formatTime(step * i)}</span>
              ))
            })()}
          </div>

          {/* Y軸ラベル（正答率） */}
          <div className="absolute right-0 top-0 bottom-8 flex flex-col justify-between text-xs text-gray-500 pl-2">
            <span>100%</span>
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
            <span>0%</span>
          </div>

          {/* グラフエリア */}
          <div className="absolute left-12 right-12 top-0 bottom-8">
            {/* 背景グリッド */}
            <div className="absolute inset-0 flex flex-col justify-between">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="border-t border-gray-200" />
              ))}
            </div>

            {/* 学習時間の棒グラフ */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              {stats.weeklyData.map((day, i) => {
                const maxTime = Math.max(...stats.weeklyData.map(d => d.studyTime), 1)
                const barWidth = 100 / stats.weeklyData.length
                const barPadding = barWidth * 0.2
                const x = (i * barWidth) + barPadding
                const width = barWidth - (barPadding * 2)
                const height = (day.studyTime / maxTime) * 100
                const y = 100 - height

                return (
                  <g key={`bar-${i}`}>
                    <rect
                      x={`${x}%`}
                      y={`${y}%`}
                      width={`${width}%`}
                      height={`${height}%`}
                      fill="#3b82f6"
                      opacity="0.8"
                      className="hover:opacity-100 cursor-pointer"
                    >
                      <title>{formatTime(day.studyTime)} ({day.problemsSolved}問)</title>
                    </rect>
                  </g>
                )
              })}
            </svg>

            {/* 正答率の折れ線グラフ */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              {/* 折れ線 */}
              {stats.weeklyData.filter(d => d.accuracy !== null && d.accuracy !== undefined).length > 1 && (
                <polyline
                  points={stats.weeklyData.map((day, i) => {
                    const barWidth = 100 / stats.weeklyData.length
                    const x = (i * barWidth) + (barWidth / 2)
                    const y = (day.accuracy !== null && day.accuracy !== undefined) ? 100 - day.accuracy : 100
                    return `${x},${y}`
                  }).join(' ')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* ドット */}
              {stats.weeklyData.map((day, i) => {
                if (day.accuracy === null || day.accuracy === undefined) return null
                const barWidth = 100 / stats.weeklyData.length
                const x = (i * barWidth) + (barWidth / 2)
                const y = 100 - day.accuracy
                return (
                  <circle
                    key={`accuracy-${i}`}
                    cx={`${x}%`}
                    cy={`${y}%`}
                    r="4"
                    fill="#10b981"
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                  >
                    <title>{day.accuracy}% ({day.problemsSolved}問)</title>
                  </circle>
                )
              })}
            </svg>
          </div>

          {/* X軸ラベル（日付） */}
          <div className="absolute left-12 right-12 bottom-0 flex justify-between text-xs text-gray-500">
            {stats.weeklyData.map((day) => {
              const date = new Date(day.date)
              const dayLabel = date.toLocaleDateString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
              })
              return (
                <span key={day.date} className="text-center">{dayLabel}</span>
              )
            })}
          </div>
        </div>

        {/* 凡例 */}
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-blue-600 opacity-80"></div>
            <span className="text-gray-600">学習時間</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-600"></div>
            <span className="text-gray-600">正答率</span>
          </div>
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

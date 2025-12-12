import { useState, useEffect } from 'react'
import { Clock, BookOpen, TrendingUp, Award, Info, AlertCircle, Calendar, CalendarDays } from 'lucide-react'
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
import Button from '@/components/Button'
import { calculateStudyStatsWithDateRange, type DateRangeType, type DateRange } from '@/lib/review'
import { getWorkbooks } from '@/lib/db'
import type { Workbook } from '@/types'

interface StatsData {
  totalStudyTime: number
  todayStudyTime: number
  weekStudyTime: number
  periodStudyTime: number
  totalProblemsSolved: number
  periodProblemsSolved: number
  correctRate: number
  chartData: Array<{
    date: string
    studyTime: number
    problemsSolved: number
    accuracy: number | null
    isWeekly?: boolean
    isMonthly?: boolean
  }>
  dateRange: {
    type: DateRangeType
    startDate: Date
    endDate: Date
    aggregationType: 'day' | 'week' | 'month'
  }
}

export default function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('')

  // 期間選択
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('week')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)

  useEffect(() => {
    loadWorkbooks()
  }, [])

  useEffect(() => {
    loadStats()
  }, [selectedWorkbookId, dateRangeType, customStartDate, customEndDate])

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

      const dateRange: DateRange = {
        type: dateRangeType,
        startDate: customStartDate ? new Date(customStartDate) : undefined,
        endDate: customEndDate ? new Date(customEndDate) : undefined,
      }

      const data = await calculateStudyStatsWithDateRange(workbookId, dateRange)
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
      setError('統計の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = seconds / 3600
    if (hours >= 1) {
      return `${hours.toFixed(1)}h`
    }
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m`
  }

  const getDateLabel = (dateStr: string, isWeekly?: boolean, isMonthly?: boolean) => {
    const date = new Date(dateStr)
    if (isMonthly) {
      return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' })
    }
    if (isWeekly) {
      return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + '週'
    }
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  const getPeriodLabel = () => {
    switch (dateRangeType) {
      case 'week': return '週間'
      case 'month': return '月間'
      case 'all': return '全期間'
      case 'custom': return '指定期間'
    }
  }

  const handleDateRangeChange = (type: DateRangeType) => {
    setDateRangeType(type)
    if (type !== 'custom') {
      setShowCustomDatePicker(false)
    } else {
      setShowCustomDatePicker(true)
      // デフォルトで過去30日を設定
      const today = new Date()
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(today.getDate() - 30)
      setCustomEndDate(today.toISOString().split('T')[0])
      setCustomStartDate(thirtyDaysAgo.toISOString().split('T')[0])
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">学習統計</h1>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* 問題集選択ドロップダウン */}
          {workbooks.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">問題集:</label>
              <select
                value={selectedWorkbookId}
                onChange={(e) => setSelectedWorkbookId(e.target.value)}
                className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
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
      </div>

      {/* 期間選択ボタン */}
      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={18} className="text-gray-600" />
          <h2 className="font-semibold">表示期間</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={dateRangeType === 'week' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleDateRangeChange('week')}
          >
            1週間
          </Button>
          <Button
            variant={dateRangeType === 'month' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleDateRangeChange('month')}
          >
            30日間
          </Button>
          <Button
            variant={dateRangeType === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleDateRangeChange('all')}
          >
            全期間
          </Button>
          <Button
            variant={dateRangeType === 'custom' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handleDateRangeChange('custom')}
          >
            <Calendar size={14} className="mr-1" />
            期間指定
          </Button>
        </div>

        {/* カスタム期間選択 */}
        {showCustomDatePicker && (
          <div className="mt-4 flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">開始:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            <span className="text-gray-500">〜</span>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">終了:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>
        )}
      </Card>

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
                <p className="text-sm text-gray-600">{getPeriodLabel()}の学習時間</p>
              </div>
              <p className="text-2xl font-bold">
                {formatTime(stats.periodStudyTime)}
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
              <p className="text-sm text-gray-600 mb-1">{getPeriodLabel()}の問題数</p>
              <p className="text-2xl font-bold">
                {stats.periodProblemsSolved}
              </p>
              <p className="text-xs text-gray-500">累計: {stats.totalProblemsSolved}問</p>
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

      {/* グラフ */}
      <Card className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">{getPeriodLabel()}の推移</h2>
          <span title="学習時間と正答率の推移（日付は夜中の3時で更新）" className="inline-flex cursor-help">
            <Info size={16} className="text-gray-400" />
          </span>
          {stats.dateRange.aggregationType !== 'day' && (
            <span className="text-xs text-gray-500 ml-2">
              ({stats.dateRange.aggregationType === 'week' ? '週単位' : '月単位'}で表示)
            </span>
          )}
        </div>

        {stats.chartData.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
            <p>この期間のデータがありません</p>
          </div>
        ) : (
          <>
            {/* スマホ用グラフ */}
            <div className="block md:hidden">
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart
                  data={stats.chartData.map(day => ({
                    ...day,
                    dateLabel: getDateLabel(day.date, day.isWeekly, day.isMonthly),
                  }))}
                  margin={{ top: 5, right: 5, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 10 }}
                    stroke="#6b7280"
                    interval={stats.chartData.length > 14 ? Math.floor(stats.chartData.length / 7) : 0}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    stroke="#3b82f6"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => {
                      const hours = value / 3600
                      if (hours >= 1) return `${hours.toFixed(1)}h`
                      return `${Math.round(value / 60)}m`
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#10b981"
                    tick={{ fontSize: 10 }}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const data = payload[0].payload
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2">
                          <p className="font-semibold text-xs mb-1">{data.dateLabel}</p>
                          <p className="text-xs text-blue-600">
                            {formatTime(data.studyTime)} ({data.problemsSolved}問)
                          </p>
                          {data.accuracy !== null && data.accuracy !== undefined && (
                            <p className="text-xs text-green-600">
                              正答率 {data.accuracy}%
                            </p>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    iconType="line"
                    iconSize={10}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="studyTime"
                    fill="#3b82f6"
                    opacity={0.8}
                    name="学習時間"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                    name="正答率"
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* PC用グラフ */}
            <div className="hidden md:block">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart
                  data={stats.chartData.map(day => ({
                    ...day,
                    dateLabel: getDateLabel(day.date, day.isWeekly, day.isMonthly),
                  }))}
                  margin={{ top: 10, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 12 }}
                    stroke="#6b7280"
                    interval={stats.chartData.length > 14 ? Math.floor(stats.chartData.length / 7) : 0}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    stroke="#3b82f6"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => {
                      const hours = value / 3600
                      if (hours >= 1) return `${hours.toFixed(1)}h`
                      return `${Math.round(value / 60)}m`
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#10b981"
                    tick={{ fontSize: 12 }}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const data = payload[0].payload
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                          <p className="font-semibold text-sm mb-2">{data.dateLabel}</p>
                          <p className="text-sm text-blue-600">
                            学習時間: {formatTime(data.studyTime)} ({data.problemsSolved}問)
                          </p>
                          {data.accuracy !== null && data.accuracy !== undefined && (
                            <p className="text-sm text-green-600">
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
                    name="学習時間"
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
                    name="正答率"
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
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

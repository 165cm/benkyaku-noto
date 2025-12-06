import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Play, TrendingUp, Info, Zap } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { getTodayReviewList } from '@/lib/review'
import { createStudySession } from '@/lib/studySession'
import { db } from '@/lib/db'
import type { ReviewSchedule } from '@/types'

// 復習タイミングのカテゴリ
type TimingCategory = 'today' | 'tomorrow' | 'thisWeek' | 'later'

interface ReviewWithTiming extends ReviewSchedule {
  timingCategory: TimingCategory
  timingLabel: string
  timingColor: string
  timingBgColor: string
}

export default function Review() {
  const navigate = useNavigate()
  const [reviewList, setReviewList] = useState<ReviewWithTiming[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<TimingCategory | 'all'>('all')
  const [selectedWorkbook, setSelectedWorkbook] = useState<string>('all')

  useEffect(() => {
    loadReviewList()
  }, [])

  const getTimingCategory = (daysSince: number): { category: TimingCategory, label: string, color: string, bgColor: string } => {
    if (daysSince >= 1 && daysSince <= 3) {
      return { category: 'today', label: '今日復習', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' }
    } else if (daysSince >= 4 && daysSince <= 7) {
      return { category: 'tomorrow', label: '明日復習', color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200' }
    } else if (daysSince >= 8 && daysSince <= 14) {
      return { category: 'thisWeek', label: '今週復習', color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200' }
    } else {
      return { category: 'later', label: '早めに復習', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' }
    }
  }

  const loadReviewList = async () => {
    setLoading(true)
    const list = await getTodayReviewList()

    // 各レビューにタイミング情報を追加
    const listWithTiming: ReviewWithTiming[] = list.map(review => {
      const daysSince = getDaysSinceLastStudy(review.lastStudiedAt)
      const timing = getTimingCategory(daysSince)
      return {
        ...review,
        timingCategory: timing.category,
        timingLabel: timing.label,
        timingColor: timing.color,
        timingBgColor: timing.bgColor,
      }
    })

    setReviewList(listWithTiming)
    setLoading(false)
  }

  const getDaysSinceLastStudy = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  const getPriorityColor = (score: number) => {
    if (score >= 150) return 'text-error'
    if (score >= 100) return 'text-warning'
    return 'text-gray-600'
  }

  const getPriorityLabel = (score: number) => {
    if (score >= 150) return '最優先'
    if (score >= 100) return '優先'
    return '通常'
  }

  // 問題の表示用タイトルを取得（sectionTitle-problemNumber形式）
  const getReviewDisplayTitle = (review: ReviewSchedule) => {
    if (review.sectionTitle) {
      return `${review.sectionTitle}-${review.problemNumber}`
    }
    // 後方互換性：sectionTitleがない場合はproblemNumberのみ
    return review.problemNumber
  }

  // 連続学習を開始
  const startContinuousStudy = async () => {
    if (filteredList.length === 0) {
      alert('復習する問題がありません')
      return
    }

    // 問題IDリストから実際のProblemオブジェクトを取得
    const problemIds = filteredList.map(r => r.problemId)
    const problems = await db.problems.where('id').anyOf(problemIds).toArray()

    // filteredListの順序を保持するためにソート
    const sortedProblems = problemIds.map(id => problems.find(p => p.id === id)).filter(p => p !== undefined)

    // 親問題を子問題に展開
    const expandedProblems: typeof sortedProblems = []

    for (const problem of sortedProblems) {
      // 子問題を取得
      const subProblems = await db.problems
        .where('parentProblemId')
        .equals(problem.id)
        .toArray()

      // 削除されていない子問題を sortOrder 順に並べる
      const activeSubProblems = subProblems
        .filter(p => !p.deletedAt)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

      if (activeSubProblems.length > 0) {
        // 親問題の場合: 子問題を順番に追加（X-1, X-2, X-3...）
        expandedProblems.push(...activeSubProblems)
      } else {
        // 通常問題の場合: そのまま追加
        expandedProblems.push(problem)
      }
    }

    // 学習セッションを作成（時間制限なし: 9999分）
    createStudySession(9999, expandedProblems)

    // 復習モードフラグを保存（レポートで復習リストに戻るため）
    sessionStorage.setItem('reviewModeActive', 'true')

    // 最初の問題に遷移
    navigate(`/study/${expandedProblems[0].id}`)
  }

  // 問題集リストを取得（重複削除）
  const workbooks = Array.from(new Set(reviewList.map(r => r.workbookTitle))).sort()

  // フィルター後のリスト
  const filteredList = reviewList.filter(r => {
    const categoryMatch = selectedCategory === 'all' || r.timingCategory === selectedCategory
    const workbookMatch = selectedWorkbook === 'all' || r.workbookTitle === selectedWorkbook
    return categoryMatch && workbookMatch
  })

  // カテゴリ別カウント（問題集フィルター適用後）
  const workbookFilteredList = selectedWorkbook === 'all'
    ? reviewList
    : reviewList.filter(r => r.workbookTitle === selectedWorkbook)

  const todayCount = workbookFilteredList.filter(r => r.timingCategory === 'today').length
  const tomorrowCount = workbookFilteredList.filter(r => r.timingCategory === 'tomorrow').length
  const thisWeekCount = workbookFilteredList.filter(r => r.timingCategory === 'thisWeek').length
  const laterCount = workbookFilteredList.filter(r => r.timingCategory === 'later').length

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">復習リスト</h1>
          <p className="text-gray-600 mt-1">
            復習が推奨される問題を優先度順に表示しています（全{reviewList.length}問）
          </p>
          <p className="text-sm text-gray-500 mt-1">
            📅 復習タイミングや 📚 問題集で絞り込んで効率的に復習できます
          </p>
        </div>
      </div>

      {/* 連続学習ボタン */}
      {filteredList.length > 0 && (
        <div className="mb-6">
          <Button
            onClick={startContinuousStudy}
            className="w-full h-16 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-lg font-bold shadow-lg hover:shadow-xl transition-all"
          >
            <Zap size={24} className="mr-2" />
            連続学習を開始（{filteredList.length}問を優先順に出題）
          </Button>
          <p className="text-xs text-gray-500 text-center mt-2">
            フィルターした問題を優先度順に連続で学習できます
          </p>
        </div>
      )}

      {reviewList.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-3">📅 復習タイミングで絞り込み</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              すべて ({reviewList.length})
            </button>
            <button
              onClick={() => setSelectedCategory('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === 'today'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
              }`}
            >
              🔴 今日復習 ({todayCount})
            </button>
            <button
              onClick={() => setSelectedCategory('tomorrow')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === 'tomorrow'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              🟠 明日復習 ({tomorrowCount})
            </button>
            <button
              onClick={() => setSelectedCategory('thisWeek')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === 'thisWeek'
                  ? 'bg-yellow-600 text-white shadow-md'
                  : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200'
              }`}
            >
              🟡 今週復習 ({thisWeekCount})
            </button>
            <button
              onClick={() => setSelectedCategory('later')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === 'later'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              🟣 早めに復習 ({laterCount})
            </button>
          </div>
        </div>
      )}

      {reviewList.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-600 mb-3">📚 問題集で絞り込み</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedWorkbook('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedWorkbook === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              すべての問題集 ({reviewList.length})
            </button>
            {workbooks.map((workbook) => {
              const count = reviewList.filter(r => r.workbookTitle === workbook).length
              return (
                <button
                  key={workbook}
                  onClick={() => setSelectedWorkbook(workbook)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedWorkbook === workbook
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {workbook} ({count})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {filteredList.length === 0 && reviewList.length > 0 ? (
        <div className="text-center py-12">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">この条件の復習問題はありません</p>
          <Button onClick={() => {
            setSelectedCategory('all')
            setSelectedWorkbook('all')
          }}>すべて表示</Button>
        </div>
      ) : reviewList.length === 0 ? (
        <div className="text-center py-12">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">復習する問題がありません</p>
          <p className="text-sm text-gray-400">
            問題を解いて学習記録を蓄積すると、復習リストが表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((review) => {
            const daysSince = getDaysSinceLastStudy(review.lastStudiedAt)

            return (
              <Card
                key={review.problemId}
                className={`flex items-center justify-between border-2 ${review.timingBgColor}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${review.timingColor} bg-white border-2`}
                    >
                      {review.timingLabel}
                    </span>
                    {review.category && (
                      <span className="text-xs text-gray-500">{review.category}</span>
                    )}
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${getPriorityColor(
                        review.priorityScore
                      )}`}
                    >
                      {getPriorityLabel(review.priorityScore)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-lg">
                      {getReviewDisplayTitle(review)}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">
                    {review.workbookTitle}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      復習回数: {review.reviewCount}回
                    </span>
                    <span className="flex items-center gap-1">
                      平均正答率: {Math.round(review.averageScore)}%
                      <span title="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）" className="inline-flex cursor-help">
                        <Info size={12} className="text-gray-400" />
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      最終学習: {daysSince}日前
                      <span title="日付は夜中の3時で更新されます（0時〜2時59分は前日扱い）" className="inline-flex cursor-help">
                        <Info size={12} className="text-gray-400" />
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right mr-2">
                    <div className="flex items-center gap-1 text-sm">
                      <TrendingUp size={14} />
                      <span className={getPriorityColor(review.priorityScore)}>
                        {Math.round(review.priorityScore)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">優先度</p>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => navigate(`/study/${review.problemId}`)}
                  >
                    <Play size={16} className="mr-1" />
                    学習
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-semibold mb-2">📚 復習アルゴリズムについて</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p>
            <strong>優先度スコア</strong> = (100 - 平均正答率) × 経過日数係数
          </p>
          <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
            <li>1日以内: 係数 0.5</li>
            <li>3日以内: 係数 1.0</li>
            <li>7日以内: 係数 1.5</li>
            <li>14日以内: 係数 2.0</li>
            <li>14日以上: 係数 2.5</li>
          </ul>
          <p className="mt-2 text-xs">
            ※ スコアが高いほど復習の優先度が高くなります
          </p>
        </div>
      </div>
    </div>
  )
}

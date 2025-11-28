import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Calendar, TrendingUp, Play, Loader2, GraduationCap, Target, Sparkles, Info, FileText } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { calculateStudyStats, getTodayReviewList, getWeakSectionProblem, calculateSectionStats, type SectionStats } from '@/lib/review'
import { getExplanations } from '@/lib/db'
import { generateFirstTimeStudySet, getUnstudiedProblemsCount } from '@/lib/studySet'
import { getWeakModeSession } from '@/lib/weakModeSession'
import type { StudyStats, ReviewSchedule } from '@/types'

export default function Home() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [reviewList, setReviewList] = useState<ReviewSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'review' | 'firstTime' | 'explanation'>('review')
  const [unstudiedCount, setUnstudiedCount] = useState(0)
  const [weakSections, setWeakSections] = useState<SectionStats[]>([])
  const [startingReview, setStartingReview] = useState(false)
  const [explanationCount, setExplanationCount] = useState(0)
  const [hasTodayReport, setHasTodayReport] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [statsData, reviewData, unstudiedCount, sectionStats, explanations] = await Promise.all([
      calculateStudyStats(),
      getTodayReviewList(),
      getUnstudiedProblemsCount(),
      calculateSectionStats(),
      getExplanations(),
    ])

    // 今日のレポートがあるかチェック
    const localStorageData = localStorage.getItem('weak_mode_session')
    const session = getWeakModeSession()
    console.log('=== WeakModeSession Debug ===')
    console.log('LocalStorage raw data:', localStorageData)
    console.log('Parsed session:', session)
    console.log('Has session:', session !== null)
    console.log('Results count:', session?.results.length || 0)
    console.log('hasTodayReport:', session !== null && session.results.length > 0)
    console.log('===========================')
    setHasTodayReport(session !== null && session.results.length > 0)

    setStats(statsData)
    setReviewList(reviewData.slice(0, 10)) // 上位10件に増加
    setUnstudiedCount(unstudiedCount)
    setWeakSections(sectionStats.slice(0, 5)) // 苦手セクション上位5件
    setExplanationCount(explanations.length)
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

  // 復習リストの表示用タイトルを取得（sectionTitle-problemNumber形式）
  const getReviewDisplayTitle = (review: ReviewSchedule) => {
    if (review.sectionTitle) {
      return `${review.sectionTitle}-${review.problemNumber}`
    }
    // 後方互換性：sectionTitleがない場合はproblemNumberのみ
    return review.problemNumber
  }

  const handleStartFirstTimeStudy = async () => {
    setLoading(true)
    try {
      // 最初の未学習問題を取得
      const problems = await generateFirstTimeStudySet(180) // 最初の1問だけ取得

      if (problems.length === 0) {
        alert('未学習の問題がありません。')
        setLoading(false)
        return
      }

      // 最初の問題に直接ナビゲート
      navigate(`/study/${problems[0].id}`)
    } catch (error) {
      console.error('Error starting first-time study:', error)
      alert('学習を開始できませんでした')
      setLoading(false)
    }
  }

  const handleStartWeakSectionReview = async () => {
    setStartingReview(true)
    try {
      // 苦手セクションから次の問題を取得
      const problem = await getWeakSectionProblem()

      if (!problem) {
        alert('復習する問題がありません。まず初回学習を進めてください。')
        return
      }

      // 問題に直接ナビゲート（苦手克服モードフラグ付き）
      navigate(`/study/${problem.id}?mode=weak`)
    } catch (error) {
      console.error('Error starting weak section review:', error)
      alert('復習を開始できませんでした')
    } finally {
      setStartingReview(false)
    }
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">ホーム</h1>
      </div>

      {/* 今日の統計 - 2×2グリッド（4カラム） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Calendar className="text-blue-600" size={20} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-600">学習時間</p>
                <span title="日付は夜中の3時で更新されます" className="cursor-help">
                  <Info size={12} className="text-gray-400" />
                </span>
              </div>
              <p className="text-xl font-bold truncate">
                {stats ? formatTime(stats.todayStudyTime) : '0分'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <BookOpen className="text-green-600" size={20} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600">復習待ち</p>
              <p className="text-xl font-bold">{reviewList.length}問</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-purple-600" size={20} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-600">正答率</p>
                <span title="最新3回の重み付け平均" className="cursor-help">
                  <Info size={12} className="text-gray-400" />
                </span>
              </div>
              <p className="text-xl font-bold">
                {stats ? stats.correctRate : 0}%
              </p>
            </div>
          </div>
        </Card>

        {hasTodayReport ? (
          <Card
            className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate('/weak-mode-report')}
          >
            <div className="flex items-center gap-2">
              <FileText className="text-blue-600" size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600">今日のレポート</p>
                <p className="text-sm font-bold text-blue-600 truncate">確認する →</p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-3 bg-gray-50">
            <div className="flex items-center gap-2">
              <FileText className="text-gray-400" size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">今日のレポート</p>
                <p className="text-sm text-gray-400">未学習</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* 学習モード選択（タブ式） */}
      <Card className="mb-4">
        {/* タブヘッダー - コンパクト版 */}
        <div className="flex border-b border-border mb-4">
          <button
            onClick={() => setActiveTab('review')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'review'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Target size={16} />
            <span>苦手克服</span>
            {weakSections.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {weakSections.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('firstTime')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'firstTime'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <GraduationCap size={16} />
            <span>初回学習</span>
            {unstudiedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                {unstudiedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('explanation')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'explanation'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles size={16} />
            <span>AI解説</span>
            {explanationCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                {explanationCount}
              </span>
            )}
          </button>
        </div>

        {/* 復習モードのコンテンツ - 超コンパクト版 */}
        {activeTab === 'review' && (
          <div>
            {/* 次の問題プレビュー & 苦手セクション */}
            {weakSections.length > 0 ? (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">
                  🎯 次: <span className="font-medium text-gray-700">{weakSections[0].title}</span>
                  {' '}({weakSections[0].accuracy}%)
                </div>
                <div className="text-xs text-gray-600 space-y-0.5">
                  {weakSections.slice(0, 3).map((section, index) => {
                    const accuracy = section.accuracy ?? 0
                    const colorClass = accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'
                    return (
                      <div key={section.sectionKey} className="flex items-center justify-between">
                        <span className="truncate">{index + 1}. {section.title}</span>
                        <span className={`font-semibold ml-2 ${colorClass}`}>{accuracy}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-3">復習できる問題があります</p>
            )}

            {/* 開始ボタン */}
            <Button
              onClick={handleStartWeakSectionReview}
              disabled={weakSections.length === 0 || startingReview}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {startingReview ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  開始中...
                </>
              ) : (
                <>
                  <Target size={16} className="mr-2" />
                  苦手克服を開始
                </>
              )}
            </Button>
          </div>
        )}

        {/* 初回学習モードのコンテンツ - 超コンパクト版 */}
        {activeTab === 'firstTime' && (
          <div>
            <p className="text-xs text-gray-600 mb-3">
              📚 未学習問題: <span className="font-bold text-green-600">{unstudiedCount}問</span>
            </p>
            <Button
              onClick={handleStartFirstTimeStudy}
              disabled={unstudiedCount === 0 || loading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  開始中...
                </>
              ) : (
                <>
                  <Play size={16} className="mr-2" />
                  初回学習を開始
                </>
              )}
            </Button>
          </div>
        )}

        {/* AI解説モードのコンテンツ - 超コンパクト版 */}
        {activeTab === 'explanation' && (
          <div>
            <p className="text-xs text-gray-600 mb-3">
              ✨ ストック: <span className="font-bold text-purple-600">{explanationCount}件</span>
              {weakSections.length > 0 && (
                <span className="ml-2 text-gray-500">
                  | 推奨: {weakSections[0].title} ({weakSections[0].accuracy}%)
                </span>
              )}
            </p>
            <Button
              onClick={() => navigate('/explanations')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              <Sparkles size={16} className="mr-2" />
              解説ライブラリを開く
            </Button>
          </div>
        )}
      </Card>

      {/* 復習リスト - コンパクトテーブル形式 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">復習リスト（優先度順）</h2>
          {reviewList.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/review')}
            >
              すべて
            </Button>
          )}
        </div>

        {reviewList.length === 0 ? (
          <Card className="p-4">
            <p className="text-center text-gray-500 text-sm">
              復習する問題がありません
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-gray-100">
              {reviewList.map((review, index) => (
                <div
                  key={review.problemId}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4">{index + 1}</span>
                    <span className="text-sm font-medium truncate">{getReviewDisplayTitle(review)}</span>
                    <span className="text-xs text-gray-500">|</span>
                    <span className="text-xs font-semibold text-gray-700">{Math.round(review.averageScore)}%</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/study/${review.problemId}`)}
                    className="flex-shrink-0 ml-2"
                  >
                    <Play size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

    </div>
  )
}

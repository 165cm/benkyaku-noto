import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Loader2, Target, ChevronDown, ChevronUp } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { calculateStudyStats, getTodayReviewList, getWeakSectionProblem, calculateSectionStats, type SectionStats } from '@/lib/review'
import { getExplanations } from '@/lib/db'
import { generateFirstTimeStudySet, getUnstudiedProblemsCount } from '@/lib/studySet'
import { getWeakModeSession } from '@/lib/weakModeSession'
import { calculateStreak } from '@/lib/streak'
import { getWeeklyStudyTime, getWeekDayLabels } from '@/lib/weeklyStats'
import type { StudyStats, ReviewSchedule } from '@/types'

export default function Home() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [reviewList, setReviewList] = useState<ReviewSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [unstudiedCount, setUnstudiedCount] = useState(0)
  const [weakSections, setWeakSections] = useState<SectionStats[]>([])
  const [startingReview, setStartingReview] = useState(false)
  const [explanationCount, setExplanationCount] = useState(0)
  const [hasTodayReport, setHasTodayReport] = useState(false)
  const [streak, setStreak] = useState(0)
  const [weeklyData, setWeeklyData] = useState<number[]>([])
  const [showOtherModes, setShowOtherModes] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [statsData, reviewData, unstudiedCount, sectionStats, explanations, streakData, weeklyTimeData] = await Promise.all([
      calculateStudyStats(),
      getTodayReviewList(),
      getUnstudiedProblemsCount(),
      calculateSectionStats(),
      getExplanations(),
      calculateStreak(),
      getWeeklyStudyTime(),
    ])

    // 今日のレポートがあるかチェック
    const session = getWeakModeSession()
    setHasTodayReport(session !== null && session.results.length > 0)

    setStats(statsData)
    setReviewList(reviewData.slice(0, 10)) // 上位10件に増加
    setUnstudiedCount(unstudiedCount)
    setWeakSections(sectionStats.slice(0, 5)) // 苦手セクション上位5件
    setExplanationCount(explanations.length)
    setStreak(streakData)
    setWeeklyData(weeklyTimeData)
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

  // 今日のおすすめモードを決定
  const getRecommendedMode = () => {
    if (weakSections.length > 0) {
      return {
        mode: 'weak' as const,
        title: '苦手克服モード',
        reason: `苦手セクションが${weakSections.length}つあります`,
        description: '優先度の高い問題から復習しましょう',
        action: handleStartWeakSectionReview,
        color: 'blue',
        icon: Target,
      }
    }
    if (unstudiedCount > 0) {
      return {
        mode: 'firstTime' as const,
        title: '初回学習モード',
        reason: `未学習問題が${unstudiedCount}問あります`,
        description: '新しい問題に挑戦しましょう',
        action: handleStartFirstTimeStudy,
        color: 'green',
        icon: Play,
      }
    }
    return null
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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    )
  }

  const recommendedMode = getRecommendedMode()
  const targetStudyTime = 3600 // 目標1時間（秒）
  const todayStudyTime = stats?.todayStudyTime || 0
  const studyProgress = Math.min((todayStudyTime / targetStudyTime) * 100, 100)
  const weekDayLabels = getWeekDayLabels()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🏠 ホーム</h1>
      </div>

      {/* ストリーク表示 */}
      {streak > 0 && (
        <Card className="mb-4 bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
          <div className="flex items-center gap-3 p-4">
            <span className="text-4xl">🔥</span>
            <div className="flex-1">
              <p className="text-2xl font-bold text-orange-700">
                {streak}日連続で学習中！
              </p>
              <p className="text-sm text-orange-600">このまま続けよう！</p>
            </div>
          </div>
        </Card>
      )}

      {/* 今日の学習時間 - 大きく表示 */}
      <Card className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-2">📊 今日の学習時間</p>
          <p className="text-5xl font-bold text-blue-700 mb-3">
            {formatTime(todayStudyTime)}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${studyProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-600">
            目標{formatTime(targetStudyTime)}まで
            {todayStudyTime < targetStudyTime
              ? `あと${formatTime(targetStudyTime - todayStudyTime)}`
              : '達成！🎉'}
          </p>
        </div>
      </Card>

      {/* 週間グラフ */}
      <Card className="mb-4">
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-3">📈 今週の学習記録</h2>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDayLabels.map((day, i) => {
              const timeInMinutes = Math.round(weeklyData[i] / 60)
              const maxTime = Math.max(...weeklyData, 1)
              const barHeight = (weeklyData[i] / maxTime) * 100

              return (
                <div key={day} className="text-center">
                  <p className="text-xs text-gray-500 mb-1">{day}</p>
                  <div className="h-20 bg-gray-100 rounded flex items-end justify-center">
                    <div
                      className="bg-blue-600 w-full rounded transition-all duration-500"
                      style={{
                        height: `${barHeight}%`,
                        minHeight: weeklyData[i] > 0 ? '4px' : '0',
                      }}
                    />
                  </div>
                  <p className="text-xs font-medium mt-1">
                    {timeInMinutes > 0 ? timeInMinutes : '-'}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="text-sm text-gray-600 text-center">
            今週の合計: {formatTime(weeklyData.reduce((a, b) => a + b, 0))}
          </p>
        </div>
      </Card>

      {/* 今日の復習 */}
      {reviewList.length > 0 && (
        <Card className="mb-4 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-purple-900">📚 今日の復習</h2>
                <p className="text-sm text-purple-700">復習が推奨される問題があります</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-purple-900">{reviewList.length}</div>
                <p className="text-xs text-purple-600">問</p>
              </div>
            </div>

            {/* 優先度別の内訳 */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {reviewList.slice(0, 4).map((review) => (
                <div key={review.problemId} className="bg-white bg-opacity-70 rounded p-2 text-xs">
                  <p className="font-medium truncate">{review.sectionTitle || review.problemNumber}</p>
                  <p className="text-gray-600">正答率: {Math.round(review.averageScore)}%</p>
                </div>
              ))}
            </div>

            {/* 復習ページへのリンク */}
            <Button
              onClick={() => navigate('/review')}
              className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white font-bold"
            >
              復習リストを見る →
            </Button>
          </div>
        </Card>
      )}

      {/* 今日のおすすめ */}
      {recommendedMode && (
        <Card className="mb-4">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-2">🎯 今日のおすすめ</h2>
            <p className="text-sm text-gray-600 mb-1">{recommendedMode.reason}</p>
            <p className="text-sm text-gray-600 mb-4">{recommendedMode.description}</p>

            {/* 次に復習する問題のプレビュー */}
            {recommendedMode.mode === 'weak' && weakSections.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-2">次に復習する問題:</p>
                {weakSections.slice(0, 3).map((section, index) => {
                  const accuracy = section.accuracy ?? 0
                  const colorClass =
                    accuracy >= 80
                      ? 'text-green-600'
                      : accuracy >= 50
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  return (
                    <div key={section.sectionKey} className="flex items-center justify-between py-1">
                      <span className="text-sm truncate flex items-center gap-2">
                        <span className="text-gray-400">{index + 1}.</span>
                        {section.title}
                        {index === 0 && <span className="text-xs">⭐</span>}
                      </span>
                      <span className={`text-sm font-semibold ml-2 ${colorClass}`}>
                        {accuracy}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 大きなCTAボタン */}
            <Button
              onClick={recommendedMode.action}
              disabled={startingReview}
              className={`w-full h-16 text-lg font-bold ${
                recommendedMode.color === 'blue'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {startingReview ? (
                <>
                  <Loader2 size={24} className="mr-2 animate-spin" />
                  開始中...
                </>
              ) : (
                <>
                  <recommendedMode.icon size={24} className="mr-2" />
                  今すぐ開始 💪
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* その他のモード（折りたたみ） */}
      <Card className="mb-4">
        <button
          onClick={() => setShowOtherModes(!showOtherModes)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700">📝 その他のモード</span>
          {showOtherModes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {showOtherModes && (
          <div className="p-4 pt-0 space-y-3 border-t border-gray-100">
            {/* 初回学習モード */}
            {recommendedMode?.mode !== 'firstTime' && unstudiedCount > 0 && (
              <button
                onClick={handleStartFirstTimeStudy}
                className="w-full p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-900">初回学習モード</p>
                    <p className="text-xs text-green-700">未学習問題: {unstudiedCount}問</p>
                  </div>
                  <Play size={20} className="text-green-600" />
                </div>
              </button>
            )}

            {/* 苦手克服モード */}
            {recommendedMode?.mode !== 'weak' && weakSections.length > 0 && (
              <button
                onClick={handleStartWeakSectionReview}
                className="w-full p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">苦手克服モード</p>
                    <p className="text-xs text-blue-700">苦手セクション: {weakSections.length}件</p>
                  </div>
                  <Target size={20} className="text-blue-600" />
                </div>
              </button>
            )}

            {/* AI解説ライブラリ */}
            <button
              onClick={() => navigate('/explanations')}
              className="w-full p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-900">AI解説ライブラリ</p>
                  <p className="text-xs text-purple-700">ストック: {explanationCount}件</p>
                </div>
                <span className="text-xl">✨</span>
              </div>
            </button>

            {/* 復習リスト */}
            <button
              onClick={() => navigate('/review')}
              className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">復習リストを見る</p>
                  <p className="text-xs text-gray-700">復習待ち: {reviewList.length}問</p>
                </div>
                <span className="text-xl">📋</span>
              </div>
            </button>

            {/* 学習統計 */}
            <button
              onClick={() => navigate('/stats')}
              className="w-full p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">学習統計を見る</p>
                  <p className="text-xs text-gray-700">
                    正答率: {stats?.correctRate || 0}%
                  </p>
                </div>
                <span className="text-xl">📊</span>
              </div>
            </button>

            {/* 今日のレポート */}
            {hasTodayReport && (
              <button
                onClick={() => navigate('/weak-mode-report')}
                className="w-full p-3 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-indigo-900">今日のレポート</p>
                    <p className="text-xs text-indigo-700">苦手克服モードの結果を確認</p>
                  </div>
                  <span className="text-xl">📄</span>
                </div>
              </button>
            )}
          </div>
        )}
      </Card>

    </div>
  )
}

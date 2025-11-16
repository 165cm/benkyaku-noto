import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Calendar, TrendingUp, Play, Loader2, GraduationCap, RotateCcw } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { calculateStudyStats, getTodayReviewList } from '@/lib/review'
import { getWorkbooks } from '@/lib/db'
import { generateStudySet, generateFirstTimeStudySet, hasUnstudiedProblems } from '@/lib/studySet'
import { createStudySession } from '@/lib/studySession'
import type { StudyStats, ReviewSchedule, Workbook, Problem } from '@/types'

export default function Home() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [reviewList, setReviewList] = useState<ReviewSchedule[]>([])
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingStudySet, setGeneratingStudySet] = useState(false)
  const [studySetPreview, setStudySetPreview] = useState<{
    minutes: number
    problems: Problem[]
    isFirstTime: boolean
  } | null>(null)
  const [hasUnstudieds, setHasUnstudieds] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [statsData, reviewData, workbooksData, hasUnstudieds] = await Promise.all([
      calculateStudyStats(),
      getTodayReviewList(),
      getWorkbooks(),
      hasUnstudiedProblems(),
    ])

    setStats(statsData)
    setReviewList(reviewData.slice(0, 5)) // 上位5件
    setWorkbooks(workbooksData.slice(0, 3)) // 最新3件
    setHasUnstudieds(hasUnstudieds)
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

  const handleStartFirstTimeStudy = async (minutes: number) => {
    setGeneratingStudySet(true)
    try {
      const problems = await generateFirstTimeStudySet(minutes)

      if (problems.length === 0) {
        alert('未学習の問題がありません。')
        return
      }

      setStudySetPreview({ minutes, problems, isFirstTime: true })
    } catch (error) {
      console.error('Error generating first-time study set:', error)
      alert('学習セットの生成に失敗しました')
    } finally {
      setGeneratingStudySet(false)
    }
  }

  const handleStartReviewStudy = async (minutes: number) => {
    setGeneratingStudySet(true)
    try {
      const problems = await generateStudySet(minutes)

      if (problems.length === 0) {
        alert('復習する問題がありません。')
        return
      }

      setStudySetPreview({ minutes, problems, isFirstTime: false })
    } catch (error) {
      console.error('Error generating review study set:', error)
      alert('学習セットの生成に失敗しました')
    } finally {
      setGeneratingStudySet(false)
    }
  }

  const startStudySession = () => {
    if (!studySetPreview || studySetPreview.problems.length === 0) return

    // セッションを作成
    createStudySession(studySetPreview.minutes, studySetPreview.problems)

    // 最初の問題に移動
    navigate(`/study/${studySetPreview.problems[0].id}`)
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">ホーム</h1>
        <p className="text-gray-600">学習の進捗と復習リストを確認できます</p>
      </div>

      {/* 今日の統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">今日の学習時間</p>
              <p className="text-2xl font-bold">
                {stats ? formatTime(stats.todayStudyTime) : '0分'}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <BookOpen className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">復習待ち</p>
              <p className="text-2xl font-bold">{reviewList.length}問</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600">正答率</p>
              <p className="text-2xl font-bold">
                {stats ? stats.correctRate : 0}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 時間設定で学習セット生成 */}
      {hasUnstudieds ? (
        // 初回学習モード
        <Card className="mb-8">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap size={20} className="text-green-600" />
              <h2 className="text-xl font-semibold">初回学習モード</h2>
            </div>
            <p className="text-sm text-gray-600">
              未学習の問題を1から順番に学習します
            </p>
          </div>

          <div className="grid grid-cols-5 gap-3 mb-4">
            {[5, 10, 15, 30, 45].map((minutes) => (
              <Button
                key={minutes}
                variant="secondary"
                onClick={() => handleStartFirstTimeStudy(minutes)}
                disabled={generatingStudySet}
                className="flex flex-col items-center gap-1 h-20"
              >
                <span className="text-2xl font-bold">{minutes}</span>
                <span className="text-xs">分</span>
              </Button>
            ))}
          </div>

          {generatingStudySet && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-600">
              <Loader2 size={20} className="animate-spin" />
              <span>学習セットを生成中...</span>
            </div>
          )}

          {studySetPreview && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-green-900">
                    {studySetPreview.minutes}分の学習セット
                  </p>
                  <p className="text-sm text-green-700">
                    {studySetPreview.problems.length}問が選択されました（順番に出題）
                  </p>
                </div>
                <Button onClick={startStudySession}>
                  <Play size={16} className="mr-1" />
                  開始
                </Button>
              </div>
              <div className="space-y-1">
                {studySetPreview.problems.slice(0, 3).map((problem) => (
                  <p key={problem.id} className="text-xs text-green-600">
                    · {problem.problemNumber}
                    {problem.page && ` (p.${problem.page})`}
                  </p>
                ))}
                {studySetPreview.problems.length > 3 && (
                  <p className="text-xs text-green-500">
                    ...他 {studySetPreview.problems.length - 3}問
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      ) : (
        // 復習モード
        <Card className="mb-8">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw size={20} className="text-blue-600" />
              <h2 className="text-xl font-semibold">復習モード</h2>
            </div>
            <p className="text-sm text-gray-600">
              間違えた問題をランダムに復習します
            </p>
          </div>

          <div className="grid grid-cols-5 gap-3 mb-4">
            {[5, 10, 15, 30, 45].map((minutes) => (
              <Button
                key={minutes}
                variant="secondary"
                onClick={() => handleStartReviewStudy(minutes)}
                disabled={generatingStudySet}
                className="flex flex-col items-center gap-1 h-20"
              >
                <span className="text-2xl font-bold">{minutes}</span>
                <span className="text-xs">分</span>
              </Button>
            ))}
          </div>

          {generatingStudySet && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-600">
              <Loader2 size={20} className="animate-spin" />
              <span>学習セットを生成中...</span>
            </div>
          )}

          {studySetPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-blue-900">
                    {studySetPreview.minutes}分の学習セット
                  </p>
                  <p className="text-sm text-blue-700">
                    {studySetPreview.problems.length}問が選択されました（ランダム）
                  </p>
                </div>
                <Button onClick={startStudySession}>
                  <Play size={16} className="mr-1" />
                  開始
                </Button>
              </div>
              <div className="space-y-1">
                {studySetPreview.problems.slice(0, 3).map((problem) => (
                  <p key={problem.id} className="text-xs text-blue-600">
                    · {problem.problemNumber}
                    {problem.page && ` (p.${problem.page})`}
                  </p>
                ))}
                {studySetPreview.problems.length > 3 && (
                  <p className="text-xs text-blue-500">
                    ...他 {studySetPreview.problems.length - 3}問
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 復習リストのプレビュー */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">復習リスト（優先度順）</h2>
          {reviewList.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/review')}
            >
              すべて表示
            </Button>
          )}
        </div>

        {reviewList.length === 0 ? (
          <Card>
            <p className="text-center text-gray-500 py-4">
              復習する問題がありません
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {reviewList.map((review) => (
              <Card
                key={review.problemId}
                className="flex items-center justify-between"
              >
                <div>
                  <h3 className="font-medium">問題 {review.problemNumber}</h3>
                  <p className="text-sm text-gray-600">
                    {review.workbookTitle} · 正答率{' '}
                    {Math.round(review.averageScore)}%
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate(`/study/${review.problemId}`)}
                >
                  <Play size={16} className="mr-1" />
                  学習
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 最近の問題集 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">最近の問題集</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/workbooks')}
          >
            すべて表示
          </Button>
        </div>

        {workbooks.length === 0 ? (
          <Card>
            <p className="text-center text-gray-500 py-4">
              問題集がありません
            </p>
            <div className="text-center mt-4">
              <Button onClick={() => navigate('/workbooks')}>
                問題集を作成
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workbooks.map((workbook) => (
              <Card
                key={workbook.id}
                hover
                onClick={() => navigate(`/workbooks/${workbook.id}`)}
              >
                <h3 className="font-semibold mb-2">{workbook.title}</h3>
                <p className="text-sm text-gray-600 mb-2">
                  {workbook.subject}
                </p>
                <p className="text-sm text-gray-500">
                  問題数: {workbook.totalProblems}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

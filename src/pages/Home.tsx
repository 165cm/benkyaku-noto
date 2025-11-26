import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Calendar, TrendingUp, Play, Loader2, GraduationCap, Target, Sparkles } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { calculateStudyStats, getTodayReviewList, getWeakSectionProblem, calculateSectionStats, type SectionStats } from '@/lib/review'
import { getWorkbooks, getExplanations } from '@/lib/db'
import { generateFirstTimeStudySet, getUnstudiedProblemsCount } from '@/lib/studySet'
import type { StudyStats, ReviewSchedule, Workbook } from '@/types'

export default function Home() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [reviewList, setReviewList] = useState<ReviewSchedule[]>([])
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'review' | 'firstTime' | 'explanation'>('review')
  const [unstudiedCount, setUnstudiedCount] = useState(0)
  const [weakSections, setWeakSections] = useState<SectionStats[]>([])
  const [startingReview, setStartingReview] = useState(false)
  const [explanationCount, setExplanationCount] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [statsData, reviewData, workbooksData, unstudiedCount, sectionStats, explanations] = await Promise.all([
      calculateStudyStats(),
      getTodayReviewList(),
      getWorkbooks(),
      getUnstudiedProblemsCount(),
      calculateSectionStats(),
      getExplanations(),
    ])

    setStats(statsData)
    setReviewList(reviewData.slice(0, 5)) // 上位5件
    setWorkbooks(workbooksData.slice(0, 3)) // 最新3件
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
              <p className="text-sm text-gray-600" title="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）">正答率</p>
              <p className="text-2xl font-bold" title="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）">
                {stats ? stats.correctRate : 0}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 学習モード選択（タブ式） */}
      <Card className="mb-8">
        {/* タブヘッダー */}
        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setActiveTab('review')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'review'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Target size={18} />
            <span>苦手克服</span>
            {weakSections.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                {weakSections.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('firstTime')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'firstTime'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <GraduationCap size={18} />
            <span>初回学習</span>
            {unstudiedCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                {unstudiedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('explanation')}
            className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'explanation'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles size={18} />
            <span>AI解説</span>
            {explanationCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                {explanationCount}
              </span>
            )}
          </button>
        </div>

        {/* 復習モードのコンテンツ */}
        {activeTab === 'review' && (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Target size={20} className="text-blue-600" />
                <h2 className="text-xl font-semibold">苦手克服モード</h2>
              </div>
              <p className="text-sm text-gray-600">
                平均点の低いセクションの問題を優先的に復習します
              </p>
            </div>

            {/* 苦手セクション一覧 */}
            {weakSections.length > 0 && (
              <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-900 mb-3">📊 苦手セクション（正解率の低い順）</h3>
                <div className="space-y-2">
                  {weakSections.map((section, index) => {
                    const colorClass = section.accuracy !== null && section.accuracy >= 80
                      ? 'text-green-700'
                      : section.accuracy !== null && section.accuracy >= 50
                      ? 'text-yellow-700'
                      : 'text-red-700'
                    return (
                      <div key={section.sectionKey} className="flex items-center justify-between text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-orange-400 font-bold">{index + 1}.</span>
                            <div className="min-w-0">
                              <span className="text-xs text-gray-500 block truncate">
                                {section.category}
                              </span>
                              <span className="font-medium text-gray-700 block truncate">
                                {section.title}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`font-semibold ${colorClass}`}>
                            {section.accuracy}%
                          </span>
                          <span className="text-gray-500 text-xs">
                            ({section.studiedCount}/{section.problems.length}問学習済)
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 復習開始ボタン */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
              <div className="mb-4">
                {weakSections.length > 0 && (
                  <>
                    <p className="text-xs text-blue-600 mb-1">
                      {weakSections[0].category}
                    </p>
                    <p className="text-blue-900 font-medium mb-2">
                      次は「{weakSections[0].title}」から出題されます
                    </p>
                  </>
                )}
                {weakSections.length === 0 && (
                  <p className="text-blue-900 font-medium mb-2">
                    復習できる問題があります
                  </p>
                )}
                <p className="text-sm text-blue-700">
                  苦手な分野を1問ずつ淡々と克服していきましょう
                </p>
              </div>
              <Button
                onClick={handleStartWeakSectionReview}
                disabled={weakSections.length === 0 || startingReview}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {startingReview ? (
                  <>
                    <Loader2 size={20} className="mr-2 animate-spin" />
                    開始中...
                  </>
                ) : (
                  <>
                    <Target size={20} className="mr-2" />
                    苦手克服を開始
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* 初回学習モードのコンテンツ */}
        {activeTab === 'firstTime' && (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap size={20} className="text-green-600" />
                <h2 className="text-xl font-semibold">初回学習モード</h2>
              </div>
              <p className="text-sm text-gray-600">
                未学習の問題を1から順番に学習します
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <div className="mb-4">
                <p className="text-green-900 font-medium mb-2">
                  未学習問題: {unstudiedCount}問
                </p>
                <p className="text-sm text-green-700">
                  最初の問題から順番に学習を開始します
                </p>
              </div>
              <Button
                onClick={handleStartFirstTimeStudy}
                disabled={unstudiedCount === 0 || loading}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="mr-2 animate-spin" />
                    開始中...
                  </>
                ) : (
                  <>
                    <Play size={20} className="mr-2" />
                    初回学習を開始
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* AI解説モードのコンテンツ */}
        {activeTab === 'explanation' && (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={20} className="text-purple-600" />
                <h2 className="text-xl font-semibold">AI解説ライブラリ</h2>
              </div>
              <p className="text-sm text-gray-600">
                苦手セクションの解き方をAIが詳しく解説します
              </p>
            </div>

            {/* 苦手セクション一覧 */}
            {weakSections.length > 0 && (
              <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-900 mb-3">📚 解説候補セクション</h3>
                <div className="space-y-2">
                  {weakSections.slice(0, 3).map((section, index) => {
                    const colorClass = section.accuracy !== null && section.accuracy >= 80
                      ? 'text-green-700'
                      : section.accuracy !== null && section.accuracy >= 50
                      ? 'text-yellow-700'
                      : 'text-red-700'
                    return (
                      <div key={section.sectionKey} className="flex items-center justify-between text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-400 font-bold">{index + 1}.</span>
                            <div className="min-w-0">
                              <span className="text-xs text-gray-500 block truncate">
                                {section.category}
                              </span>
                              <span className="font-medium text-gray-700 block truncate">
                                {section.title}
                              </span>
                            </div>
                          </div>
                        </div>
                        <span className={`font-semibold flex-shrink-0 ${colorClass}`}>
                          {section.accuracy}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 text-center">
              <div className="mb-4">
                <p className="text-purple-900 font-medium mb-2">
                  {explanationCount > 0
                    ? `${explanationCount}件の解説がストックされています`
                    : '苦手セクションの解説を生成しましょう'}
                </p>
                <p className="text-sm text-purple-700">
                  解き方のコツ、典型的な間違い、暗記ポイントなどを確認できます
                </p>
              </div>
              <Button
                onClick={() => navigate('/explanations')}
                size="lg"
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Sparkles size={20} className="mr-2" />
                解説ライブラリを開く
              </Button>
            </div>
          </div>
        )}
      </Card>

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
                <div className="flex-1 min-w-0">
                  {review.category && (
                    <p className="text-xs text-gray-500">{review.category}</p>
                  )}
                  <h3 className="font-medium truncate">{getReviewDisplayTitle(review)}</h3>
                  <p className="text-sm text-gray-600 truncate">
                    {review.workbookTitle} · 正答率{' '}
                    {Math.round(review.averageScore)}%
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate(`/study/${review.problemId}`)}
                  className="flex-shrink-0"
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

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, AlertCircle, Clock, TrendingUp, Play } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { getSession, clearSession, createStudySession } from '@/lib/studySession'
import { db, getSubProblems, isParentProblem } from '@/lib/db'
import type { StudySession } from '@/lib/studySession'
import type { Problem, StudyRecord } from '@/types'

type TabType = 'all' | 'initial' | 'review'

export default function StudyReport() {
  const navigate = useNavigate()
  const [session, setSession] = useState<StudySession | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [nextSection, setNextSection] = useState<{
    title: string
    problems: Problem[]
  } | null>(null)
  const [studyRecordsMap, setStudyRecordsMap] = useState<Map<string, StudyRecord[]>>(new Map())
  const [activeTab, setActiveTab] = useState<TabType>('review')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const currentSession = getSession()
    if (!currentSession) {
      navigate('/')
      return
    }

    setSession(currentSession)

    // 問題の詳細を取得
    const problemDetails = await Promise.all(
      currentSession.results.map((result) =>
        db.problems.get(result.problemId)
      )
    )

    const validProblems = problemDetails.filter((p) => p !== undefined) as Problem[]
    setProblems(validProblems)
    setSession(currentSession)

    // 各問題の学習記録を取得（今回のセッション以前の記録）
    const recordsMap = new Map<string, StudyRecord[]>()
    const sessionStartTime = currentSession.startTime.getTime()

    for (const result of currentSession.results) {
      const allRecords = await db.studyRecords
        .where('problemId')
        .equals(result.problemId)
        .toArray()

      // 今回のセッション開始前の記録のみを取得
      const previousRecords = allRecords.filter(
        record => record.studiedAt.getTime() < sessionStartTime
      )
      recordsMap.set(result.problemId, previousRecords)
    }
    setStudyRecordsMap(recordsMap)

    // デフォルトタブを判定（初回学習と復習のどちらが多いかで判定）
    const initialCount = currentSession.results.filter(
      result => (recordsMap.get(result.problemId) || []).length === 0
    ).length
    const reviewCount = currentSession.results.filter(
      result => (recordsMap.get(result.problemId) || []).length > 0
    ).length

    // 初回学習と復習のどちらが多いかでデフォルトタブを設定
    if (initialCount > reviewCount) {
      setActiveTab('initial')
    } else if (reviewCount > 0) {
      setActiveTab('review')
    } else {
      setActiveTab('all')
    }

    // 次のセクションを検索
    if (validProblems.length > 0) {
      const workbookId = validProblems[0].workbookId
      const currentSectionTitle = validProblems[0].sectionTitle

      // 問題集の全問題を取得
      const allProblems = await db.problems
        .where('workbookId')
        .equals(workbookId)
        .toArray()

      const activeProblems = allProblems.filter(p => !p.deletedAt && !p.parentProblemId)

      // セクションごとにグループ化
      const sections = new Map<string, Problem[]>()
      for (const problem of activeProblems) {
        const sectionKey = problem.sectionTitle || '未分類'
        if (!sections.has(sectionKey)) {
          sections.set(sectionKey, [])
        }
        sections.get(sectionKey)!.push(problem)
      }

      // セクションの順序を取得（sortOrder順）
      const sectionOrder = Array.from(sections.keys()).sort((a, b) => {
        const aProblems = sections.get(a)!
        const bProblems = sections.get(b)!
        const aMinSort = Math.min(...aProblems.map(p => p.sortOrder || 0))
        const bMinSort = Math.min(...bProblems.map(p => p.sortOrder || 0))
        return aMinSort - bMinSort
      })

      // 現在のセクションの次を取得
      const currentIndex = sectionOrder.indexOf(currentSectionTitle || '未分類')
      if (currentIndex >= 0 && currentIndex < sectionOrder.length - 1) {
        const nextSectionTitle = sectionOrder[currentIndex + 1]
        const nextProblems = sections.get(nextSectionTitle)!
        setNextSection({
          title: nextSectionTitle,
          problems: nextProblems,
        })
      }
    }

    setLoading(false)
  }

  const handleFinish = () => {
    // 問題集のTOPに戻る
    const workbookId = problems[0]?.workbookId
    clearSession()
    if (workbookId) {
      navigate(`/workbooks/${workbookId}`)
    } else {
      navigate('/')
    }
  }

  // 問題の表示用タイトルを取得（sectionTitle-problemNumber形式）
  const getProblemDisplayTitle = (problem: Problem) => {
    if (problem.sectionTitle) {
      return `${problem.sectionTitle}-${problem.problemNumber}`
    }
    // 後方互換性：sectionTitleがない場合はproblemNumberのみ
    return problem.problemNumber
  }

  // 問題が初回学習か復習かを判定
  const isInitialStudy = (problemId: string): boolean => {
    const previousRecords = studyRecordsMap.get(problemId) || []
    return previousRecords.length === 0
  }

  // タブごとに問題をフィルタリング
  const getFilteredResults = (tab: TabType) => {
    if (!session) return []

    if (tab === 'all') {
      return session.results
    } else if (tab === 'initial') {
      return session.results.filter(result => isInitialStudy(result.problemId))
    } else {
      return session.results.filter(result => !isInitialStudy(result.problemId))
    }
  }

  // タブごとの統計を計算
  const getTabStats = (tab: TabType) => {
    const filteredResults = getFilteredResults(tab)
    const totalTime = filteredResults.reduce((sum, r) => sum + r.timeSpent, 0)
    const correctCount = filteredResults.filter((r) => r.score === 'correct').length
    const partialCount = filteredResults.filter((r) => r.score === 'partial').length
    const incorrectCount = filteredResults.filter((r) => r.score === 'incorrect').length
    const totalProblems = filteredResults.length

    const accuracyRate =
      totalProblems > 0
        ? Math.round(
            ((correctCount + partialCount * 0.5) / totalProblems) * 100
          )
        : 0

    return {
      totalTime,
      correctCount,
      partialCount,
      incorrectCount,
      totalProblems,
      accuracyRate,
      filteredResults
    }
  }

  const handleStudyNextSection = async () => {
    if (!nextSection) return

    // 学習可能な問題を抽出（親問題を除外し、小問を含める）
    const learnableProblems: Problem[] = []
    for (const problem of nextSection.problems) {
      const hasSubProblems = await isParentProblem(problem.id)
      if (!hasSubProblems) {
        learnableProblems.push(problem)
      }
      // 小問を追加
      const subProblems = await getSubProblems(problem.id)
      learnableProblems.push(...subProblems)
    }

    if (learnableProblems.length === 0) {
      alert('学習可能な問題がありません')
      return
    }

    // ソート
    learnableProblems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

    // セッションをクリアして新しいセッションを開始
    clearSession()
    createStudySession(999, learnableProblems)
    navigate(`/study/${learnableProblems[0].id}`)
  }

  if (loading || !session) {
    return <div>読み込み中...</div>
  }

  // 学習したセクションタイトルを取得
  const studiedSectionTitle = problems[0]?.sectionTitle || problems[0]?.category || '学習'

  // 各タブの統計情報
  const allStats = getTabStats('all')
  const initialStats = getTabStats('initial')
  const reviewStats = getTabStats('review')

  // 現在のタブの統計情報
  const currentStats = getTabStats(activeTab)

  // タブの定義
  const tabs: { key: TabType; label: string; stats: ReturnType<typeof getTabStats> }[] = [
    { key: 'all', label: '総合', stats: allStats },
    { key: 'review', label: '復習', stats: reviewStats },
    { key: 'initial', label: '新規', stats: initialStats },
  ]

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">学習レポート</h1>
        <p className="text-lg font-medium text-primary mb-1">{studiedSectionTitle}</p>
        <p className="text-gray-600">お疲れ様でした！</p>
      </div>

      {/* タブナビゲーション */}
      <div className="mb-8">
        <div className="flex border-b border-gray-300">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex-1 py-3 px-4 text-center font-medium transition-colors
                ${activeTab === tab.key
                  ? 'border-b-2 border-primary text-primary bg-blue-50'
                  : 'text-gray-600 hover:text-primary hover:bg-gray-50'
                }
              `}
            >
              <div>
                <span>{tab.label}</span>
                <span className="ml-2 text-sm">({tab.stats.totalProblems}問)</span>
              </div>
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="mt-6">
          {/* サマリーカード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <div className="text-center">
                <Clock className="mx-auto mb-2 text-blue-600" size={32} />
                <p className="text-sm text-gray-600">学習時間</p>
                <p className="text-2xl font-bold">
                  {Math.floor(currentStats.totalTime / 60)}分
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <CheckCircle className="mx-auto mb-2 text-green-600" size={32} />
                <p className="text-sm text-gray-600">正解</p>
                <p className="text-2xl font-bold text-green-600">{currentStats.correctCount}問</p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <AlertCircle className="mx-auto mb-2 text-yellow-600" size={32} />
                <p className="text-sm text-gray-600">部分正解</p>
                <p className="text-2xl font-bold text-yellow-600">{currentStats.partialCount}問</p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <XCircle className="mx-auto mb-2 text-red-600" size={32} />
                <p className="text-sm text-gray-600">不正解</p>
                <p className="text-2xl font-bold text-red-600">{currentStats.incorrectCount}問</p>
              </div>
            </Card>
          </div>

          {/* 正答率 */}
          <Card className="mb-6">
            <div className="flex items-center gap-4">
              <TrendingUp className="text-primary" size={40} />
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-1">正答率</p>
                <div className="flex items-center gap-4">
                  <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                    {currentStats.accuracyRate > 0 && (
                      <div
                        className="bg-primary h-4 rounded-full"
                        style={{ width: `${currentStats.accuracyRate}%` }}
                      />
                    )}
                  </div>
                  <span className="text-2xl font-bold min-w-[60px] text-right">{currentStats.accuracyRate}%</span>
                </div>
              </div>
            </div>
          </Card>

          {/* 詳細リスト */}
          <div className="space-y-2">
            {currentStats.filteredResults.map((result) => {
              const problem = problems.find((p) => p.id === result.problemId)
              if (!problem) return null

              const ScoreIcon =
                result.score === 'correct'
                  ? CheckCircle
                  : result.score === 'partial'
                    ? AlertCircle
                    : XCircle

              const scoreColor =
                result.score === 'correct'
                  ? 'text-green-600'
                  : result.score === 'partial'
                    ? 'text-yellow-600'
                    : 'text-red-600'

              const scoreLabel =
                result.score === 'correct'
                  ? '◯'
                  : result.score === 'partial'
                    ? '△'
                    : '×'

              return (
                <Card
                  key={result.problemId}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <ScoreIcon className={scoreColor} size={24} />
                    <div>
                      {problem.category && (
                        <p className="text-xs text-gray-500">{problem.category}</p>
                      )}
                      <p className="font-medium">{getProblemDisplayTitle(problem)}</p>
                      {problem.page && (
                        <p className="text-xs text-gray-500">p.{problem.page}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${scoreColor}`}>
                      {scoreLabel}
                    </p>
                    <p className="text-xs text-gray-500">
                      {Math.floor(result.timeSpent / 60)}分
                      {Math.floor(result.timeSpent % 60)}秒
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {nextSection && (
          <Button onClick={handleStudyNextSection} size="lg">
            <Play size={18} className="mr-2" />
            次のセクション: {nextSection.title}
          </Button>
        )}
        <Button onClick={handleFinish} size="lg" variant={nextSection ? 'secondary' : 'primary'}>
          問題集に戻る
        </Button>
      </div>
    </div>
  )
}

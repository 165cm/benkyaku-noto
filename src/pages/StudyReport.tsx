import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, ChevronDown, ChevronUp } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { getSession, clearSession, createStudySession } from '@/lib/studySession'
import { db, getSubProblems, isParentProblem } from '@/lib/db'
import type { StudySession } from '@/lib/studySession'
import type { Problem, StudyRecord } from '@/types'

type TabType = 'all' | 'initial' | 'review'

interface SectionGroup {
  sectionKey: string
  sectionTitle: string
  category: string
  problems: {
    problemId: string
    problem: Problem
    score: 'correct' | 'partial' | 'incorrect'
    timeSpent: number
  }[]
  correctCount: number
  partialCount: number
  incorrectCount: number
  totalCount: number
}

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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

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

  // 時間のフォーマット
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}分${secs}秒`
    }
    return `${secs}秒`
  }

  // 結果アイコンを取得
  const getResultIcon = (result: string) => {
    switch (result) {
      case 'correct':
        return <span className="text-green-600 font-bold">◯</span>
      case 'partial':
        return <span className="text-yellow-600 font-bold">△</span>
      case 'incorrect':
        return <span className="text-red-600 font-bold">×</span>
      default:
        return <span className="text-gray-400">-</span>
    }
  }

  // セクションの開閉トグル
  const toggleSection = (sectionKey: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionKey)) {
      newExpanded.delete(sectionKey)
    } else {
      newExpanded.add(sectionKey)
    }
    setExpandedSections(newExpanded)
  }

  // 問題をセクションごとにグループ化
  const groupBySection = (filteredResults: Array<{ problemId: string; score: 'correct' | 'partial' | 'incorrect'; timeSpent: number }>): SectionGroup[] => {
    const groups = new Map<string, SectionGroup>()

    for (const result of filteredResults) {
      const problem = problems.find((p) => p.id === result.problemId)
      if (!problem) continue

      const sectionKey = problem.sectionTitle || 'その他'
      const category = problem.category || ''

      if (!groups.has(sectionKey)) {
        groups.set(sectionKey, {
          sectionKey,
          sectionTitle: sectionKey,
          category,
          problems: [],
          correctCount: 0,
          partialCount: 0,
          incorrectCount: 0,
          totalCount: 0,
        })
      }

      const group = groups.get(sectionKey)!
      group.problems.push({
        problemId: result.problemId,
        problem,
        score: result.score,
        timeSpent: result.timeSpent,
      })
      group.totalCount++
      if (result.score === 'correct') {
        group.correctCount++
      } else if (result.score === 'partial') {
        group.partialCount++
      } else {
        group.incorrectCount++
      }
    }

    return Array.from(groups.values())
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-3">
        <h1 className="text-lg font-bold mb-0.5">学習レポート</h1>
        <p className="text-xs text-gray-600">{studiedSectionTitle} · お疲れ様でした！</p>
      </div>

      {/* タブナビゲーション */}
      <div className="flex border-b border-gray-300 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              flex-1 py-2 px-3 text-center font-medium transition-colors text-sm
              ${activeTab === tab.key
                ? 'border-b-2 border-primary text-primary bg-blue-50'
                : 'text-gray-600 hover:text-primary hover:bg-gray-50'
              }
            `}
          >
            <div>
              <span>{tab.label}</span>
              <span className="ml-1 text-xs">({tab.stats.totalProblems}問)</span>
            </div>
          </button>
        ))}
      </div>

      {/* コンパクトな統計 */}
      <Card className="mb-3 p-2">
        <div className="flex items-center justify-between text-sm">
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500 mb-0.5">解答数</p>
            <p className="text-lg md:text-2xl font-bold text-blue-600">{currentStats.totalProblems}問</p>
          </div>
          <div className="text-center flex-1 border-l border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">正解率</p>
            <p className="text-lg md:text-2xl font-bold text-green-600">{currentStats.accuracyRate}%</p>
          </div>
          <div className="text-center flex-1 border-l border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">学習時間</p>
            <p className="text-base md:text-lg font-bold text-purple-600">{formatTime(currentStats.totalTime)}</p>
          </div>
          <div className="text-center flex-1 border-l border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">◯/△/×</p>
            <p className="text-xs md:text-sm font-bold">
              <span className="text-green-600">{currentStats.correctCount}</span>
              {' / '}
              <span className="text-yellow-600">{currentStats.partialCount}</span>
              {' / '}
              <span className="text-red-600">{currentStats.incorrectCount}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* 問題別詳細 */}
      {currentStats.totalProblems <= 10 ? (
        // 10問以下：全て表示（アコーディオンなし）
        <Card className="mb-3 p-2">
          <div className="mb-1.5">
            <span className="font-medium text-xs">問題別の結果</span>
            <span className="text-xs text-gray-500 ml-2">
              {currentStats.totalProblems}問中{currentStats.correctCount}問正解（{currentStats.accuracyRate}%）
            </span>
          </div>
          <div className="border-t pt-1.5 space-y-0.5">
            {currentStats.filteredResults.map((result, index) => {
              const problem = problems.find((p) => p.id === result.problemId)
              if (!problem) return null

              return (
                <div
                  key={result.problemId}
                  className="flex items-center justify-between p-1.5 rounded text-xs hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{index + 1}. {getProblemDisplayTitle(problem)}</span>
                    <span className="text-xs text-gray-500 ml-1">{formatTime(result.timeSpent)}</span>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {getResultIcon(result.score)}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        // 10問超え：セクション別にアコーディオン表示
        <div className="space-y-1.5 mb-3">
          <div className="px-2 mb-1.5">
            <span className="font-medium text-xs">問題別の結果</span>
            <span className="text-xs text-gray-500 ml-2">
              {currentStats.totalProblems}問中{currentStats.correctCount}問正解（{currentStats.accuracyRate}%）
            </span>
          </div>
          {groupBySection(currentStats.filteredResults).map((section) => {
            const accuracy = Math.round((section.correctCount / section.totalCount) * 100)
            return (
              <Card key={section.sectionKey} className="p-0">
                <button
                  onClick={() => toggleSection(section.sectionKey)}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded transition-colors"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="font-medium text-xs truncate">{section.sectionTitle}</span>
                    <span className="text-xs text-gray-500">
                      {section.totalCount}問中{section.correctCount}問正解 · {accuracy}%
                    </span>
                  </div>
                  {expandedSections.has(section.sectionKey) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {expandedSections.has(section.sectionKey) && (
                  <div className="border-t mt-1 pt-1.5 space-y-0.5 px-2 pb-2">
                    {section.problems.map((item) => (
                      <div
                        key={item.problemId}
                        className="flex items-center justify-between p-1.5 rounded text-xs hover:bg-gray-50"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{getProblemDisplayTitle(item.problem)}</span>
                          <span className="text-xs text-gray-500 ml-1">{formatTime(item.timeSpent)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {getResultIcon(item.score)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ボタン */}
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

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, TrendingUp, Target, ArrowUp, ArrowDown, Minus, Info, ChevronDown, ChevronUp } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { getWeakModeSession, calculateWeakModeStats } from '@/lib/weakModeSession'
import { getProblem } from '@/lib/db'
import type { Problem } from '@/types'

interface ProblemDetail {
  problem: Problem
  previousResult: string | null
  currentResult: string
  previousAttempts: number
  timeSpent: number
}

interface SectionGroup {
  sectionKey: string
  sectionTitle: string
  category: string
  problems: ProblemDetail[]
  correctCount: number
  totalCount: number
}

export default function WeakModeReport() {
  const navigate = useNavigate()
  const [problemDetails, setProblemDetails] = useState<ProblemDetail[]>([])
  const [stats, setStats] = useState<Awaited<ReturnType<typeof calculateWeakModeStats>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadReportData()
  }, [])

  const loadReportData = async () => {
    const session = getWeakModeSession()
    console.log('WeakModeReport - Loading session:', {
      session,
      hasSession: session !== null,
      resultsCount: session?.results.length || 0
    })
    if (!session || session.results.length === 0) {
      console.log('WeakModeReport - No session data, redirecting to home')
      navigate('/')
      return
    }

    // 統計を計算
    const sessionStats = await calculateWeakModeStats(session)
    setStats(sessionStats)

    // 各問題の詳細を取得
    const details: ProblemDetail[] = []
    for (const result of session.results) {
      const problem = await getProblem(result.problemId)
      if (problem) {
        details.push({
          problem,
          previousResult: result.previousResult,
          currentResult: result.result,
          previousAttempts: result.previousAttempts,
          timeSpent: result.timeSpent,
        })
      }
    }
    setProblemDetails(details)
    setLoading(false)
  }

  // 問題の表示用タイトルを取得（sectionTitle-problemNumber形式）
  const getProblemDisplayTitle = (problem: Problem) => {
    if (problem.sectionTitle) {
      return `${problem.sectionTitle}-${problem.problemNumber}`
    }
    // 後方互換性：sectionTitleがない場合はproblemNumberのみ
    return problem.problemNumber
  }

  const handleGoHome = () => {
    // セッションは日付が変わるまで保持（clearWeakModeSessionを削除）
    navigate('/')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}分${secs}秒`
    }
    return `${secs}秒`
  }

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

  const getChangeIcon = (prev: string | null, curr: string) => {
    if (!prev) return <Minus size={14} className="text-gray-400" />

    const prevScore = prev === 'correct' ? 2 : prev === 'partial' ? 1 : 0
    const currScore = curr === 'correct' ? 2 : curr === 'partial' ? 1 : 0

    if (currScore > prevScore) {
      return <ArrowUp size={14} className="text-green-600" />
    } else if (currScore < prevScore) {
      return <ArrowDown size={14} className="text-red-600" />
    }
    return <Minus size={14} className="text-gray-400" />
  }

  // 結果の変化に応じた背景色を取得
  const getChangeBackgroundClass = (prev: string | null, curr: string) => {
    if (!prev) return 'hover:bg-gray-50' // 初回

    const prevScore = prev === 'correct' ? 2 : prev === 'partial' ? 1 : 0
    const currScore = curr === 'correct' ? 2 : curr === 'partial' ? 1 : 0

    if (currScore > prevScore) {
      return 'bg-green-50 hover:bg-green-100' // 改善
    } else if (currScore < prevScore) {
      return 'bg-red-50 hover:bg-red-100' // 下落
    }
    return 'hover:bg-gray-50' // 変化なし
  }

  const getEncouragingMessage = () => {
    if (!stats) return ''

    if (stats.accuracy >= 80) {
      return '素晴らしい成績です！この調子で続けましょう！'
    } else if (stats.accuracy >= 60) {
      return '良い調子です！苦手を少しずつ克服しています！'
    } else if (stats.improvedCount > 0) {
      return `${stats.improvedCount}問が前回より改善しました！努力が実っています！`
    } else if (stats.maxStreak >= 3) {
      return `${stats.maxStreak}問連続正解！集中力が素晴らしい！`
    } else {
      return '繰り返し学習が大切です。次回も頑張りましょう！'
    }
  }

  // 問題をセクションごとにグループ化
  const groupBySection = (details: ProblemDetail[]): SectionGroup[] => {
    const groups = new Map<string, SectionGroup>()

    for (const detail of details) {
      const sectionKey = detail.problem.sectionTitle || 'その他'
      const category = detail.problem.category || ''

      if (!groups.has(sectionKey)) {
        groups.set(sectionKey, {
          sectionKey,
          sectionTitle: sectionKey,
          category,
          problems: [],
          correctCount: 0,
          totalCount: 0,
        })
      }

      const group = groups.get(sectionKey)!
      group.problems.push(detail)
      group.totalCount++
      if (detail.currentResult === 'correct') {
        group.correctCount++
      }
    }

    return Array.from(groups.values())
  }

  const toggleSection = (sectionKey: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionKey)) {
      newExpanded.delete(sectionKey)
    } else {
      newExpanded.add(sectionKey)
    }
    setExpandedSections(newExpanded)
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  if (!stats) {
    return <div>データがありません</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-3">
        <h1 className="text-lg font-bold mb-0.5">苦手克服レポート</h1>
        <p className="text-xs text-gray-600">{getEncouragingMessage()}</p>
      </div>

      {/* コンパクトな統計 */}
      <Card className="mb-3 p-2">
        <div className="flex items-center justify-between text-sm">
          <div className="text-center flex-1">
            <p className="text-xs text-gray-500 mb-0.5">解答数</p>
            <p className="text-lg md:text-2xl font-bold text-blue-600">{stats.totalProblems}問</p>
          </div>
          <div className="text-center flex-1 border-l border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">今回の正解率</p>
            <p className="text-lg md:text-2xl font-bold text-green-600">{stats.accuracy}%</p>
          </div>
          <div className="text-center flex-1 border-l border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">学習時間</p>
            <p className="text-base md:text-lg font-bold text-purple-600">{formatTime(stats.totalTime)}</p>
          </div>
          <div className="text-center flex-1 border-l border-gray-200">
            <p className="text-xs text-gray-500 mb-0.5">◯/△/×</p>
            <p className="text-xs md:text-sm font-bold">
              <span className="text-green-600">{stats.correctCount}</span>
              {' / '}
              <span className="text-yellow-600">{stats.partialCount}</span>
              {' / '}
              <span className="text-red-600">{stats.incorrectCount}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* 成長記録 */}
      {stats.studyTimeEstimate && (
        <div className="space-y-2 mb-3">
          {/* 今回解いた問題の正解率（モチベーション重視で先に表示） */}
          <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200 p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Target size={16} className="text-indigo-600 flex-shrink-0" />
                <span className="text-xs font-medium truncate">{stats.studyTimeEstimate.scopeLabel}の正解率</span>
                <span title="直近3回の重み付け平均" className="cursor-help flex-shrink-0">
                  <Info size={10} className="text-gray-400" />
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-sm md:text-lg font-bold text-gray-600">{stats.studyTimeEstimate.previousAccuracy}%</span>
                <span className="text-gray-400 text-xs">→</span>
                <span className="text-sm md:text-lg font-bold text-blue-600">{stats.studyTimeEstimate.currentAccuracy}%</span>
                {stats.studyTimeEstimate.accuracyChange !== 0 && (
                  <span className={`text-xs md:text-base font-bold ${
                    stats.studyTimeEstimate.accuracyChange > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ({stats.studyTimeEstimate.accuracyChange > 0 ? '+' : ''}{stats.studyTimeEstimate.accuracyChange}%)
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* 復習対象全体の正解率（優先KPI、目標80%の基準） */}
          {stats.studyTimeEstimate.overallStats && (
            <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={16} className="text-green-600 flex-shrink-0" />
                  <span className="text-xs font-medium truncate">復習対象全体の正解率</span>
                  <span title="直近3回の重み付け平均（最新50%、1つ前30%、2つ前20%）" className="cursor-help flex-shrink-0">
                    <Info size={10} className="text-gray-400" />
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm md:text-xl font-bold text-gray-600">{stats.studyTimeEstimate.overallStats.previousAccuracy}%</span>
                  <span className="text-gray-400 text-xs">→</span>
                  <span className="text-sm md:text-xl font-bold text-green-600">{stats.studyTimeEstimate.overallStats.currentAccuracy}%</span>
                  {stats.studyTimeEstimate.overallStats.accuracyChange !== 0 && (
                    <span className={`text-xs md:text-lg font-bold ${
                      stats.studyTimeEstimate.overallStats.accuracyChange > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ({stats.studyTimeEstimate.overallStats.accuracyChange > 0 ? '+' : ''}{stats.studyTimeEstimate.overallStats.accuracyChange}%)
                    </span>
                  )}
                </div>
              </div>
              {stats.studyTimeEstimate.canEstimate && stats.studyTimeEstimate.overallStats.currentAccuracy < stats.studyTimeEstimate.targetAccuracy && (
                <p className="text-xs text-gray-600 text-center">
                  💡 目標80%まで あと{stats.studyTimeEstimate.estimatedSessionsMin || stats.studyTimeEstimate.estimatedSessionsMax}回
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* 問題別詳細 */}
      {problemDetails.length <= 10 ? (
        // 10問以下：全て表示（アコーディオンなし）
        <Card className="mb-3 p-2">
          <div className="mb-1.5">
            <span className="font-medium text-xs">問題別の結果</span>
            <span className="text-xs text-gray-500 ml-2">
              {stats.totalProblems}問中{stats.correctCount}問正解（{stats.accuracy}%）
            </span>
          </div>
          <div className="border-t pt-1.5 space-y-0.5">
            {problemDetails.map((detail, index) => (
              <div
                key={detail.problem.id}
                className={`flex items-center justify-between p-1.5 rounded text-xs ${getChangeBackgroundClass(detail.previousResult, detail.currentResult)}`}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{index + 1}. {getProblemDisplayTitle(detail.problem)}</span>
                  <span className="text-xs text-gray-500 ml-1">{formatTime(detail.timeSpent)}</span>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {detail.previousResult ? getResultIcon(detail.previousResult) : <span className="text-gray-400 text-xs">初</span>}
                  <span className="text-gray-400 text-xs">→</span>
                  {getResultIcon(detail.currentResult)}
                  {getChangeIcon(detail.previousResult, detail.currentResult)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        // 10問超え：セクション別にアコーディオン表示
        <div className="space-y-1.5 mb-3">
          <div className="px-2 mb-1.5">
            <span className="font-medium text-xs">問題別の結果</span>
            <span className="text-xs text-gray-500 ml-2">
              {stats.totalProblems}問中{stats.correctCount}問正解（{stats.accuracy}%）
            </span>
          </div>
          {groupBySection(problemDetails).map((section) => {
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
                    {section.problems.map((detail) => (
                      <div
                        key={detail.problem.id}
                        className={`flex items-center justify-between p-1.5 rounded text-xs ${getChangeBackgroundClass(detail.previousResult, detail.currentResult)}`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{getProblemDisplayTitle(detail.problem)}</span>
                          <span className="text-xs text-gray-500 ml-1">{formatTime(detail.timeSpent)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {detail.previousResult ? getResultIcon(detail.previousResult) : <span className="text-gray-400 text-xs">初</span>}
                          <span className="text-gray-400 text-xs">→</span>
                          {getResultIcon(detail.currentResult)}
                          {getChangeIcon(detail.previousResult, detail.currentResult)}
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

      {/* ホームに戻るボタン */}
      <div className="text-center">
        <Button onClick={handleGoHome} size="lg">
          <Home size={20} className="mr-2" />
          ホームに戻る
        </Button>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, AlertCircle, Clock, TrendingUp, Play } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { getSession, clearSession, createStudySession } from '@/lib/studySession'
import { db, getSubProblems, isParentProblem } from '@/lib/db'
import type { StudySession } from '@/lib/studySession'
import type { Problem } from '@/types'

export default function StudyReport() {
  const navigate = useNavigate()
  const [session, setSession] = useState<StudySession | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [nextSection, setNextSection] = useState<{
    title: string
    problems: Problem[]
  } | null>(null)

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

  // 問題番号の表示用フォーマット
  const getDisplayProblemNumber = (problemNumber: string) => {
    const parts = problemNumber.split('-')

    // 小問の場合（例: "代金精算-3-1" → "3-1"）
    if (parts.length >= 3) {
      return parts.slice(-2).join('-')
    }

    // 通常の問題（例: "代金精算-3" → "3"）
    if (parts.length >= 2) {
      return parts[parts.length - 1]
    }

    // ハイフンがない場合はそのまま
    return problemNumber
  }

  if (loading || !session) {
    return <div>読み込み中...</div>
  }

  const totalTime = session.results.reduce((sum, r) => sum + r.timeSpent, 0)
  const correctCount = session.results.filter((r) => r.score === 'correct').length
  const partialCount = session.results.filter((r) => r.score === 'partial').length
  const incorrectCount = session.results.filter(
    (r) => r.score === 'incorrect'
  ).length
  const totalProblems = session.results.length

  const accuracyRate =
    totalProblems > 0
      ? Math.round(
          ((correctCount + partialCount * 0.5) / totalProblems) * 100
        )
      : 0

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">学習レポート</h1>
        <p className="text-gray-600">お疲れ様でした！</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <div className="text-center">
            <Clock className="mx-auto mb-2 text-blue-600" size={32} />
            <p className="text-sm text-gray-600">学習時間</p>
            <p className="text-2xl font-bold">
              {Math.floor(totalTime / 60)}分
            </p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <CheckCircle className="mx-auto mb-2 text-green-600" size={32} />
            <p className="text-sm text-gray-600">正解</p>
            <p className="text-2xl font-bold text-green-600">{correctCount}問</p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <AlertCircle className="mx-auto mb-2 text-yellow-600" size={32} />
            <p className="text-sm text-gray-600">部分正解</p>
            <p className="text-2xl font-bold text-yellow-600">{partialCount}問</p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <XCircle className="mx-auto mb-2 text-red-600" size={32} />
            <p className="text-sm text-gray-600">不正解</p>
            <p className="text-2xl font-bold text-red-600">{incorrectCount}問</p>
          </div>
        </Card>
      </div>

      {/* 正答率 */}
      <Card className="mb-8">
        <div className="flex items-center gap-4">
          <TrendingUp className="text-primary" size={40} />
          <div className="flex-1">
            <p className="text-sm text-gray-600 mb-1">正答率</p>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                {accuracyRate > 0 && (
                  <div
                    className="bg-primary h-4 rounded-full"
                    style={{ width: `${accuracyRate}%` }}
                  />
                )}
              </div>
              <span className="text-2xl font-bold min-w-[60px] text-right">{accuracyRate}%</span>
            </div>
          </div>
        </div>
      </Card>

      {/* 詳細リスト */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">問題ごとの結果</h2>
        <div className="space-y-2">
          {session.results.map((result) => {
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
                    <p className="font-medium">問題 {getDisplayProblemNumber(problem.problemNumber)}</p>
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

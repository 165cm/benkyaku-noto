import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, Trophy, TrendingUp, Clock, Target, Zap, Star, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import InfoTooltip from '@/components/InfoTooltip'
import { getWeakModeSession, clearWeakModeSession, calculateWeakModeStats } from '@/lib/weakModeSession'
import { getProblem } from '@/lib/db'
import type { Problem } from '@/types'

interface ProblemDetail {
  problem: Problem
  previousResult: string | null
  currentResult: string
  previousAttempts: number
  timeSpent: number
}

export default function WeakModeReport() {
  const navigate = useNavigate()
  const [problemDetails, setProblemDetails] = useState<ProblemDetail[]>([])
  const [stats, setStats] = useState<Awaited<ReturnType<typeof calculateWeakModeStats>> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReportData()
  }, [])

  const loadReportData = async () => {
    const session = getWeakModeSession()
    if (!session || session.results.length === 0) {
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
    clearWeakModeSession()
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

  if (loading) {
    return <div>読み込み中...</div>
  }

  if (!stats) {
    return <div>データがありません</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">苦手克服レポート</h1>
        <p className="text-gray-600">お疲れ様でした！学習結果を確認しましょう</p>
      </div>

      {/* 励ましメッセージ */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-full">
            <Trophy className="text-yellow-500" size={24} />
          </div>
          <p className="font-medium text-gray-800">{getEncouragingMessage()}</p>
        </div>
      </Card>

      {/* メイン統計 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Target className="text-blue-600" size={20} />
            <span className="text-sm text-gray-600">解答数</span>
          </div>
          <p className="text-3xl font-bold text-blue-600">{stats.totalProblems}問</p>
        </Card>

        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="text-green-600" size={20} />
            <span className="text-sm text-gray-600" title="この学習セッション内の正解率">正解率</span>
          </div>
          <p className="text-3xl font-bold text-green-600" title="この学習セッション内の正解率">{stats.accuracy}%</p>
        </Card>

        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="text-purple-600" size={20} />
            <span className="text-sm text-gray-600">総学習時間</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{formatTime(stats.totalTime)}</p>
        </Card>

        <Card className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="text-orange-600" size={20} />
            <span className="text-sm text-gray-600">平均所要時間</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{formatTime(stats.averageTime)}</p>
        </Card>
      </div>

      {/* 達成項目 */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Star className="text-yellow-500" size={20} />
          達成項目
        </h2>
        <div className="space-y-3">
          {stats.maxStreak >= 2 && (
            <div className="flex items-center justify-between p-2 bg-green-50 rounded">
              <span className="text-sm">最大連続正解</span>
              <span className="font-bold text-green-600">{stats.maxStreak}問</span>
            </div>
          )}
          {stats.improvedCount > 0 && (
            <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
              <span className="text-sm">前回より改善</span>
              <span className="font-bold text-blue-600">{stats.improvedCount}問</span>
            </div>
          )}
          {stats.masteredCount > 0 && (
            <div className="flex items-center justify-between p-2 bg-purple-50 rounded">
              <span className="text-sm">マスター達成</span>
              <span className="font-bold text-purple-600">{stats.masteredCount}問</span>
            </div>
          )}
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <span className="text-sm">正解 / 部分正解 / 不正解</span>
            <span className="font-bold">
              <span className="text-green-600">{stats.correctCount}</span>
              {' / '}
              <span className="text-yellow-600">{stats.partialCount}</span>
              {' / '}
              <span className="text-red-600">{stats.incorrectCount}</span>
            </span>
          </div>
        </div>
      </Card>

      {/* あなたの成長記録 */}
      {stats.studyTimeEstimate && (
        <Card className="mb-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="text-indigo-600" size={20} />
            あなたの成長記録
          </h2>

          {stats.studyTimeEstimate.currentAccuracy >= stats.studyTimeEstimate.targetAccuracy ? (
            <div className="text-center py-3">
              <p className="text-lg font-bold text-green-600 mb-1">
                🎉 {stats.studyTimeEstimate.message}
              </p>
              <p className="text-sm text-gray-600">
                今回の正解率: {stats.studyTimeEstimate.currentAccuracy}%
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-center mb-3">
                <div className="flex items-center justify-center gap-1 mb-2">
                  <p className="text-sm text-gray-600">{stats.studyTimeEstimate.scopeLabel}の正解率</p>
                  <InfoTooltip content="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）" />
                </div>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">学習前</p>
                    <p className="text-2xl font-bold text-gray-600">{stats.studyTimeEstimate.previousAccuracy}%</p>
                  </div>
                  <div className="text-2xl text-gray-400">→</div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">学習後</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.studyTimeEstimate.currentAccuracy}%</p>
                  </div>
                  {stats.studyTimeEstimate.accuracyChange !== 0 && (
                    <div className="text-center">
                      <p className={`text-lg font-bold ${
                        stats.studyTimeEstimate.accuracyChange > 0
                          ? 'text-green-600'
                          : stats.studyTimeEstimate.accuracyChange < 0
                            ? 'text-red-600'
                            : 'text-gray-600'
                      }`}>
                        {stats.studyTimeEstimate.accuracyChange > 0 ? '+' : ''}{stats.studyTimeEstimate.accuracyChange}%
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  目標 {stats.studyTimeEstimate.targetAccuracy}% まであと {stats.studyTimeEstimate.targetAccuracy - stats.studyTimeEstimate.currentAccuracy}ポイント
                </p>
              </div>

              {stats.studyTimeEstimate.canEstimate && (
                <>
                  <div className="p-3 bg-white rounded border border-indigo-200 text-center">
                    <p className="text-sm text-gray-700 mb-1">💡 このペースなら、</p>
                    <p className="text-lg font-bold text-indigo-600">
                      {stats.studyTimeEstimate.estimatedSessionsMin !== null &&
                       stats.studyTimeEstimate.estimatedSessionsMax !== null &&
                       stats.studyTimeEstimate.estimatedSessionsMin !== stats.studyTimeEstimate.estimatedSessionsMax
                        ? `あと${stats.studyTimeEstimate.estimatedSessionsMin}〜${stats.studyTimeEstimate.estimatedSessionsMax}回の苦手克服で達成！`
                        : stats.studyTimeEstimate.estimatedSessionsMin !== null
                          ? `あと${stats.studyTimeEstimate.estimatedSessionsMin}回の苦手克服で達成！`
                          : stats.studyTimeEstimate.estimatedSessionsMax !== null
                            ? `あと${stats.studyTimeEstimate.estimatedSessionsMax}回の苦手克服で達成！`
                            : 'もう少しで達成！'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">※1回 = 約30分の学習</p>
                  </div>

                  {stats.studyTimeEstimate.totalSessionCount < 6 && (
                    <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                      <p className="text-sm text-gray-700 text-center">
                        📝 まだ{stats.studyTimeEstimate.totalSessionCount}回分のデータです。
                        <br />
                        6回くらい続けると予測がより正確になります！
                      </p>
                    </div>
                  )}
                </>
              )}

              {!stats.studyTimeEstimate.canEstimate && (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-600">{stats.studyTimeEstimate.message}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 問題別詳細 */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-4">問題別の結果</h2>
        <div className="space-y-2">
          {problemDetails.map((detail, index) => (
            <div
              key={detail.problem.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded"
            >
              <div className="flex-1 min-w-0">
                {detail.problem.category && (
                  <p className="text-xs text-gray-500">{detail.problem.category}</p>
                )}
                <p className="text-sm font-medium truncate">
                  {index + 1}. {getProblemDisplayTitle(detail.problem)}
                </p>
                <p className="text-xs text-gray-500">
                  過去{detail.previousAttempts}回 · {formatTime(detail.timeSpent)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {detail.previousResult ? (
                    getResultIcon(detail.previousResult)
                  ) : (
                    <span className="text-gray-400 text-sm">初</span>
                  )}
                  <span className="text-gray-400">→</span>
                  {getResultIcon(detail.currentResult)}
                </div>
                {getChangeIcon(detail.previousResult, detail.currentResult)}
              </div>
            </div>
          ))}
        </div>
      </Card>

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

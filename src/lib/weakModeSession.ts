import type { StudyResult } from '@/types'
import { getProblem, getStudyRecords, db } from './db'
import { isSameStudyDay } from './dateUtils'

export interface WeakModeResult {
  problemId: string
  result: StudyResult
  previousResult: StudyResult | null
  timeSpent: number
  previousAttempts: number
}

export interface WeakModeSession {
  id: string
  startTime: Date
  results: WeakModeResult[]
}

const STORAGE_KEY = 'weak_mode_session'

// セッションを作成
export function createWeakModeSession(): WeakModeSession {
  const session: WeakModeSession = {
    id: crypto.randomUUID(),
    startTime: new Date(),
    results: [],
  }
  saveWeakModeSession(session)
  return session
}

// セッションを保存
export function saveWeakModeSession(session: WeakModeSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

// セッションを取得
export function getWeakModeSession(): WeakModeSession | null {
  const data = localStorage.getItem(STORAGE_KEY)
  if (!data) return null

  const session = JSON.parse(data)
  session.startTime = new Date(session.startTime)

  // 日付境界（3時基準）を超えていたらセッションをクリア
  const now = new Date()
  if (!isSameStudyDay(session.startTime, now)) {
    clearWeakModeSession()
    return null
  }

  return session
}

// セッションをクリア
export function clearWeakModeSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// 結果を追加
export function addWeakModeResult(
  problemId: string,
  result: StudyResult,
  previousResult: StudyResult | null,
  timeSpent: number,
  previousAttempts: number
): void {
  const session = getWeakModeSession()
  if (!session) return

  session.results.push({
    problemId,
    result,
    previousResult,
    timeSpent,
    previousAttempts,
  })
  saveWeakModeSession(session)
}

// 直近N回の重み付け平均を計算
// 最新50%、1つ前30%、2つ前20%の重みで計算
export function calculateWeightedAverage(results: StudyResult[]): number {
  if (results.length === 0) return 0

  const weights = [0.5, 0.3, 0.2] // 最新から順に
  const scores = results.map(r =>
    r === 'correct' ? 1 : r === 'partial' ? 0.5 : 0
  )

  let weightedSum = 0
  let totalWeight = 0

  for (let i = 0; i < Math.min(scores.length, 3); i++) {
    const weight = weights[i]
    weightedSum += scores[i] * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0
}

// 80%正解率達成までの推定学習回数を計算
export interface StudyTimeEstimate {
  scopeLabel: string // スコープの説明（例：「数学カテゴリ」「第1章セクション」「復習対象問題」）
  previousAccuracy: number // 学習前の正解率（直近3回の重み付け平均、今回を除く）
  currentAccuracy: number // 学習後の正解率（直近3回の重み付け平均、今回を含む）
  accuracyChange: number // 正解率の変化（+ or -）
  targetAccuracy: number // 目標正解率（80%）
  canEstimate: boolean // 推定可能かどうか
  estimatedSessionsMin: number | null // 推定回数（下限）
  estimatedSessionsMax: number | null // 推定回数（上限）
  totalSessionCount: number // これまでの累計学習回数（常に1以上）
  message: string // ユーザー向けメッセージ
  // 復習対象全体の統計
  overallStats?: {
    previousAccuracy: number // 復習対象全体の学習前の正解率
    currentAccuracy: number // 復習対象全体の学習後の正解率
    accuracyChange: number // 復習対象全体の正解率の変化
    totalProblemsCount: number // 復習対象全体の問題数
  }
}

async function calculateStudyTimeEstimate(session: WeakModeSession): Promise<StudyTimeEstimate> {
  const TARGET_ACCURACY = 80
  const MINUTES_PER_SESSION = 30 // 1回 = 30分
  const SECONDS_PER_SESSION = MINUTES_PER_SESSION * 60 // 1800秒
  const results = session.results

  // 累計学習回数（このセッション自体をカウントするため常に1以上）
  const totalSessionCount = 1

  // 学習した問題の詳細を取得してスコープを判定
  const problemIds = results.map(r => r.problemId)
  const problems = await Promise.all(problemIds.map(id => getProblem(id)))
  const validProblems = problems.filter(p => p !== undefined)

  // カテゴリとセクションを抽出
  const categories = new Set(validProblems.map(p => p.category || '未分類'))
  const sections = new Set(validProblems.map(p => p.sectionTitle || ''))

  // スコープラベルを決定
  let scopeLabel = '復習対象問題'
  if (categories.size === 1 && sections.size === 1) {
    const category = Array.from(categories)[0]
    const section = Array.from(sections)[0]
    if (section) {
      scopeLabel = `${section}`
    } else if (category !== '未分類') {
      scopeLabel = `${category}カテゴリ`
    }
  } else if (categories.size === 1) {
    const category = Array.from(categories)[0]
    if (category !== '未分類') {
      scopeLabel = `${category}カテゴリ`
    }
  } else if (sections.size === 1) {
    const section = Array.from(sections)[0]
    if (section) {
      scopeLabel = `${section}`
    }
  }

  // 各問題の履歴を取得して、学習前後の正解率を計算
  const problemHistories = await Promise.all(
    problemIds.map(async (problemId) => {
      const records = await getStudyRecords(problemId)
      return {
        problemId,
        records: records.map(r => r.result),
      }
    })
  )

  // 学習前の正解率（直近3回の重み付け平均、今回を除く）
  const previousAccuracies = problemHistories.map(({ records }) => {
    // 今回の学習を除いた履歴（最新1件を除く）
    const previousRecords = records.slice(1, 4)
    return calculateWeightedAverage(previousRecords)
  })
  const previousAccuracy = previousAccuracies.length > 0
    ? Math.round(previousAccuracies.reduce((sum, acc) => sum + acc, 0) / previousAccuracies.length)
    : 0

  // 学習後の正解率（直近3回の重み付け平均、今回を含む）
  const currentAccuracies = problemHistories.map(({ records }) => {
    // 直近3回の履歴（今回を含む）
    const recentRecords = records.slice(0, 3)
    return calculateWeightedAverage(recentRecords)
  })
  const currentAccuracy = currentAccuracies.length > 0
    ? Math.round(currentAccuracies.reduce((sum, acc) => sum + acc, 0) / currentAccuracies.length)
    : 0

  // 正解率の変化
  const accuracyChange = currentAccuracy - previousAccuracy

  // 既に目標達成している場合
  if (currentAccuracy >= TARGET_ACCURACY) {
    return {
      scopeLabel,
      previousAccuracy,
      currentAccuracy,
      accuracyChange,
      targetAccuracy: TARGET_ACCURACY,
      canEstimate: false,
      estimatedSessionsMin: null,
      estimatedSessionsMax: null,
      totalSessionCount,
      message: '目標達成！正解率80%を超えています！',
    }
  }

  const totalTime = results.reduce((sum, r) => sum + r.timeSpent, 0)

  // 正解率の向上量
  const accuracyImprovement = accuracyChange
  const remainingAccuracy = TARGET_ACCURACY - currentAccuracy

  let linearEstimateSeconds: number | null = null
  let exponentialEstimateSeconds: number | null = null

  // 1. 線形モデル（シンプル・直感的）
  if (accuracyImprovement > 0 && totalTime > 0) {
    // 1%の正解率向上にかかる時間
    const timePerPercent = totalTime / accuracyImprovement
    linearEstimateSeconds = Math.round(timePerPercent * remainingAccuracy)
  }

  // 2. 指数関数モデル（より科学的）
  if (accuracyImprovement > 0 && totalTime > 0 && previousAccuracy < TARGET_ACCURACY) {
    const maxAccuracy = 100 // 理論上の最大正解率
    const accuracyDiff = maxAccuracy - currentAccuracy
    const initialDiff = maxAccuracy - previousAccuracy

    if (initialDiff > 0 && accuracyDiff > 0 && accuracyDiff < initialDiff) {
      const k = -Math.log(accuracyDiff / initialDiff) / totalTime
      const targetDiff = maxAccuracy - TARGET_ACCURACY
      const ratio = targetDiff / initialDiff

      if (ratio > 0 && ratio < 1) {
        const estimatedTime = -Math.log(ratio) / k
        exponentialEstimateSeconds = Math.round(estimatedTime - totalTime) // 残り時間
      }
    }
  }

  // 推定時間を回数に変換
  let estimatedSessionsMin: number | null = null
  let estimatedSessionsMax: number | null = null

  if (linearEstimateSeconds !== null && linearEstimateSeconds > 0) {
    estimatedSessionsMin = Math.max(1, Math.ceil(linearEstimateSeconds / SECONDS_PER_SESSION))
  }

  if (exponentialEstimateSeconds !== null && exponentialEstimateSeconds > 0) {
    estimatedSessionsMax = Math.max(1, Math.ceil(exponentialEstimateSeconds / SECONDS_PER_SESSION))
  }

  // 範囲が逆転している場合は入れ替え
  if (estimatedSessionsMin !== null && estimatedSessionsMax !== null) {
    if (estimatedSessionsMin > estimatedSessionsMax) {
      [estimatedSessionsMin, estimatedSessionsMax] = [estimatedSessionsMax, estimatedSessionsMin]
    }
  }

  // 復習対象全体の正解率変化を計算（ホーム画面と同じ対象）
  let overallStats: StudyTimeEstimate['overallStats'] = undefined
  try {
    // 学習記録があるすべての問題を取得（ホーム画面と同じ）
    const allRecords = await db.studyRecords.toArray()
    const allProblemIds = new Set(allRecords.map(r => r.problemId))
    const overallProblems = await db.problems.where('id').anyOf([...allProblemIds]).toArray()

    if (overallProblems.length > 0) {
      // 今回のセッションで解いた問題とそれ以外で分けて計算
      const sessionProblemIds = new Set(problemIds)
      const overallPreviousAccuracies: number[] = []
      const overallCurrentAccuracies: number[] = []

      for (const problem of overallProblems) {
        const records = await getStudyRecords(problem.id)
        const resultsList = records.map(r => r.result)

        if (sessionProblemIds.has(problem.id)) {
          // 今回のセッションで解いた問題：学習前は最新を除く
          const previousRecords = resultsList.slice(1, 4)
          const currentRecords = resultsList.slice(0, 3)
          overallPreviousAccuracies.push(calculateWeightedAverage(previousRecords))
          overallCurrentAccuracies.push(calculateWeightedAverage(currentRecords))
        } else {
          // 今回のセッションで解いていない問題：学習前後で同じ
          const recentRecords = resultsList.slice(0, 3)
          const accuracy = calculateWeightedAverage(recentRecords)
          overallPreviousAccuracies.push(accuracy)
          overallCurrentAccuracies.push(accuracy)
        }
      }

      const overallPreviousAccuracyValue = overallPreviousAccuracies.length > 0
        ? Math.round(overallPreviousAccuracies.reduce((sum, acc) => sum + acc, 0) / overallPreviousAccuracies.length)
        : 0
      const overallCurrentAccuracyValue = overallCurrentAccuracies.length > 0
        ? Math.round(overallCurrentAccuracies.reduce((sum, acc) => sum + acc, 0) / overallCurrentAccuracies.length)
        : 0

      overallStats = {
        previousAccuracy: overallPreviousAccuracyValue,
        currentAccuracy: overallCurrentAccuracyValue,
        accuracyChange: overallCurrentAccuracyValue - overallPreviousAccuracyValue,
        totalProblemsCount: overallProblems.length,
      }
    }
  } catch (error) {
    console.error('Failed to calculate overall stats:', error)
    // エラーが発生しても続行（overallStatsはundefinedのまま）
  }

  // メッセージ生成
  let message = ''
  const canEstimate = estimatedSessionsMin !== null || estimatedSessionsMax !== null

  if (canEstimate) {
    message = '推定学習回数を計算しました'
  } else if (accuracyImprovement <= 0) {
    message = '正解率が向上していないため推定できません'
  } else {
    message = 'データが不足しているため推定が困難です'
  }

  return {
    scopeLabel,
    previousAccuracy,
    currentAccuracy,
    accuracyChange,
    targetAccuracy: TARGET_ACCURACY,
    canEstimate,
    estimatedSessionsMin,
    estimatedSessionsMax,
    totalSessionCount,
    message,
    overallStats,
  }
}

// セッションの統計を計算
export async function calculateWeakModeStats(session: WeakModeSession) {
  const results = session.results
  if (results.length === 0) {
    return {
      totalProblems: 0,
      totalTime: 0,
      averageTime: 0,
      correctCount: 0,
      partialCount: 0,
      incorrectCount: 0,
      accuracy: 0,
      improvedCount: 0,
      maxStreak: 0,
      masteredCount: 0,
      studyTimeEstimate: {
        scopeLabel: '復習対象問題',
        previousAccuracy: 0,
        currentAccuracy: 0,
        accuracyChange: 0,
        targetAccuracy: 80,
        canEstimate: false,
        estimatedSessionsMin: null,
        estimatedSessionsMax: null,
        totalSessionCount: 1,
        message: 'データがありません',
      } as StudyTimeEstimate,
    }
  }

  // 基本統計
  const totalProblems = results.length
  const totalTime = results.reduce((sum, r) => sum + r.timeSpent, 0)
  const averageTime = Math.round(totalTime / totalProblems)

  // 正誤カウント
  const correctCount = results.filter(r => r.result === 'correct').length
  const partialCount = results.filter(r => r.result === 'partial').length
  const incorrectCount = results.filter(r => r.result === 'incorrect').length
  // 正解率の計算（部分正解を0.5点として統一）
  const totalScore = correctCount + (partialCount * 0.5)
  const accuracy = Math.round((totalScore / totalProblems) * 100)

  // 改善した問題数（前回より良くなった）
  const improvedCount = results.filter(r => {
    if (!r.previousResult) return false
    const prevScore = r.previousResult === 'correct' ? 2 : r.previousResult === 'partial' ? 1 : 0
    const currScore = r.result === 'correct' ? 2 : r.result === 'partial' ? 1 : 0
    return currScore > prevScore
  }).length

  // 最大連続正解数
  let maxStreak = 0
  let currentStreak = 0
  for (const r of results) {
    if (r.result === 'correct') {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  // マスター達成（この回答で3回以上正解している問題）
  // Note: previousAttemptsは過去の回答数なので、正解履歴は別途計算が必要
  // ここでは簡易的に今回正解した問題数をカウント
  const masteredCount = results.filter(r =>
    r.result === 'correct' && r.previousAttempts >= 2
  ).length

  // 学習時間推定を計算
  const studyTimeEstimate = await calculateStudyTimeEstimate(session)

  return {
    totalProblems,
    totalTime,
    averageTime,
    correctCount,
    partialCount,
    incorrectCount,
    accuracy,
    improvedCount,
    maxStreak,
    masteredCount,
    studyTimeEstimate,
  }
}

import type { StudyResult } from '@/types'

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

// 80%正解率達成までの推定学習回数を計算
export interface StudyTimeEstimate {
  previousAccuracy: number // 学習前の正解率（復習課題全体）
  currentAccuracy: number // 学習後の正解率（今回の学習結果）
  accuracyChange: number // 正解率の変化（+ or -）
  targetAccuracy: number // 目標正解率（80%）
  canEstimate: boolean // 推定可能かどうか
  estimatedSessionsMin: number | null // 推定回数（下限）
  estimatedSessionsMax: number | null // 推定回数（上限）
  totalSessionCount: number // これまでの累計学習回数（常に1以上）
  message: string // ユーザー向けメッセージ
}

function calculateStudyTimeEstimate(session: WeakModeSession): StudyTimeEstimate {
  const TARGET_ACCURACY = 80
  const MINUTES_PER_SESSION = 30 // 1回 = 30分
  const SECONDS_PER_SESSION = MINUTES_PER_SESSION * 60 // 1800秒
  const results = session.results

  // 累計学習回数（このセッション自体をカウントするため常に1以上）
  const totalSessionCount = 1

  // 学習前の正解率を計算（previousResultから）
  const problemsWithPrevious = results.filter(r => r.previousResult !== null)
  let previousAccuracy = 0

  if (problemsWithPrevious.length > 0) {
    const previousCorrectCount = problemsWithPrevious.filter(
      r => r.previousResult === 'correct'
    ).length
    const previousPartialCount = problemsWithPrevious.filter(
      r => r.previousResult === 'partial'
    ).length
    // 部分正解を0.5点として計算（統一）
    previousAccuracy = Math.round(
      ((previousCorrectCount + previousPartialCount * 0.5) / problemsWithPrevious.length) * 100
    )
  }

  // 今回の学習後の正解率を計算
  const correctCount = results.filter(r => r.result === 'correct').length
  const partialCount = results.filter(r => r.result === 'partial').length
  const totalProblems = results.length

  // 正解を1点、部分正解を0.5点として計算（統一）
  const currentAccuracy = totalProblems > 0
    ? Math.round(((correctCount + partialCount * 0.5) / totalProblems) * 100)
    : 0

  // 正解率の変化
  const accuracyChange = currentAccuracy - previousAccuracy

  // 既に目標達成している場合
  if (currentAccuracy >= TARGET_ACCURACY) {
    return {
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
    previousAccuracy,
    currentAccuracy,
    accuracyChange,
    targetAccuracy: TARGET_ACCURACY,
    canEstimate,
    estimatedSessionsMin,
    estimatedSessionsMax,
    totalSessionCount,
    message,
  }
}

// セッションの統計を計算
export function calculateWeakModeStats(session: WeakModeSession) {
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
  const accuracy = Math.round((correctCount / totalProblems) * 100)

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
  const studyTimeEstimate = calculateStudyTimeEstimate(session)

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

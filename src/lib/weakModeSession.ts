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
  }
}

import type { Problem } from '@/types'

export interface StudySession {
  id: string
  startTime: Date
  targetMinutes: number
  problemIds: string[]
  currentIndex: number
  results: {
    problemId: string
    score: 'correct' | 'partial' | 'incorrect'
    timeSpent: number
  }[]
}

const SESSION_STORAGE_KEY = 'current_study_session'

export function createStudySession(
  targetMinutes: number,
  problems: Problem[]
): StudySession {
  const session: StudySession = {
    id: Date.now().toString(),
    startTime: new Date(),
    targetMinutes,
    problemIds: problems.map((p) => p.id),
    currentIndex: 0,
    results: [],
  }

  saveSession(session)
  return session
}

export function saveSession(session: StudySession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function getSession(): StudySession | null {
  const sessionStr = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!sessionStr) return null

  const session = JSON.parse(sessionStr)
  session.startTime = new Date(session.startTime)
  return session
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function addResult(
  problemId: string,
  score: 'correct' | 'partial' | 'incorrect',
  timeSpent: number
): void {
  const session = getSession()
  if (!session) return

  session.results.push({ problemId, score, timeSpent })
  session.currentIndex++
  saveSession(session)
}

export function isSessionComplete(session: StudySession): boolean {
  // 時間制限に達したか、すべての問題を終えたか
  const elapsedMinutes =
    (new Date().getTime() - session.startTime.getTime()) / 1000 / 60

  return (
    elapsedMinutes >= session.targetMinutes ||
    session.currentIndex >= session.problemIds.length
  )
}

export function getNextProblemId(session: StudySession): string | null {
  if (session.currentIndex >= session.problemIds.length) return null
  return session.problemIds[session.currentIndex]
}

// セッションの進捗情報を取得
export interface SessionProgress {
  completedCount: number        // 完了した問題数
  totalCount: number             // 全問題数
  progressRate: number           // 進捗率（0-100）
  averageTimePerProblem: number  // 平均時間（秒）
  estimatedRemainingTime: number // 残り時間（秒）
  estimatedTotalTime: number     // 見積もり総時間（秒）
}

export function getSessionProgress(session: StudySession): SessionProgress {
  const completedCount = session.results.length
  const totalCount = session.problemIds.length
  const progressRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // 平均時間を計算（最低でも1秒と仮定）
  let averageTimePerProblem = 180 // デフォルト3分

  if (completedCount > 0) {
    const totalTime = session.results.reduce((sum, r) => sum + r.timeSpent, 0)
    averageTimePerProblem = Math.round(totalTime / completedCount)
  }

  // 残り問題数
  const remainingCount = totalCount - completedCount

  // 残り時間の見積もり
  const estimatedRemainingTime = remainingCount * averageTimePerProblem

  // 見積もり総時間
  const completedTime = session.results.reduce((sum, r) => sum + r.timeSpent, 0)
  const estimatedTotalTime = completedTime + estimatedRemainingTime

  return {
    completedCount,
    totalCount,
    progressRate,
    averageTimePerProblem,
    estimatedRemainingTime,
    estimatedTotalTime,
  }
}

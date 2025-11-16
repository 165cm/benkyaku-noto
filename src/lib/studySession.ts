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

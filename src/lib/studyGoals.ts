// 曜日別学習時間目標の管理

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface WeeklyGoals {
  monday: number    // 分単位
  tuesday: number
  wednesday: number
  thursday: number
  friday: number
  saturday: number
  sunday: number
}

const DEFAULT_GOALS: WeeklyGoals = {
  monday: 60,
  tuesday: 60,
  wednesday: 60,
  thursday: 60,
  friday: 60,
  saturday: 120,
  sunday: 120,
}

const STORAGE_KEY = 'weeklyStudyGoals'

/**
 * 曜日別学習時間目標を取得
 */
export function getWeeklyGoals(): WeeklyGoals {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('目標取得エラー:', error)
  }
  return DEFAULT_GOALS
}

/**
 * 曜日別学習時間目標を保存
 */
export function saveWeeklyGoals(goals: WeeklyGoals): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
  } catch (error) {
    console.error('目標保存エラー:', error)
  }
}

/**
 * 週合計の目標時間を計算
 */
export function calculateWeeklyTotal(goals: WeeklyGoals): number {
  return Object.values(goals).reduce((sum, minutes) => sum + minutes, 0)
}

/**
 * 曜日名を日本語に変換
 */
export function getDayLabel(day: DayOfWeek): string {
  const labels: Record<DayOfWeek, string> = {
    monday: '月',
    tuesday: '火',
    wednesday: '水',
    thursday: '木',
    friday: '金',
    saturday: '土',
    sunday: '日',
  }
  return labels[day]
}

/**
 * 現在の曜日を取得
 */
export function getCurrentDay(): DayOfWeek {
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const today = new Date().getDay()
  return days[today]
}

/**
 * 今日の目標時間を取得（分）
 */
export function getTodayGoal(): number {
  const goals = getWeeklyGoals()
  const today = getCurrentDay()
  return goals[today]
}

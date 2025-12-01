import { db } from './db'
import { getWeekStartDay, getWeekDisplayMode, type WeekStartDay } from './storage'

/**
 * 過去7日間の学習時間を取得（月曜日から日曜日）
 *
 * 3時リセットのロジックを使用
 *
 * @returns 過去7日間の学習時間（秒単位）の配列 [月, 火, 水, 木, 金, 土, 日]
 */
export const getWeeklyStudyTime = async (): Promise<number[]> => {
  const records = await db.studyRecords.toArray()

  // 3時リセットのロジックで日付を正規化
  const normalizeDate = (timestamp: number | Date): string => {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
    if (date.getHours() < 3) {
      date.setDate(date.getDate() - 1)
    }
    return date.toISOString().split('T')[0]
  }

  // 今日の日付（3時リセット適用）
  const today = new Date()
  if (today.getHours() < 3) {
    today.setDate(today.getDate() - 1)
  }

  // 今日の曜日（0: 日曜, 1: 月曜, ..., 6: 土曜）
  const todayDay = today.getDay()

  // 今週の月曜日を計算（日曜の場合は前週の月曜）
  const monday = new Date(today)
  const diffToMonday = todayDay === 0 ? 6 : todayDay - 1
  monday.setDate(today.getDate() - diffToMonday)

  // 過去7日間の学習時間を格納する配列
  const weekData: number[] = Array(7).fill(0)

  // 月曜日から日曜日までの7日間
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(monday)
    targetDate.setDate(monday.getDate() + i)
    const dateStr = targetDate.toISOString().split('T')[0]

    // その日の学習記録を抽出
    const dayRecords = records.filter(r => normalizeDate(r.studiedAt) === dateStr)

    // 学習時間を合計（秒単位）
    weekData[i] = dayRecords.reduce((sum, r) => sum + r.studyTime, 0)
  }

  return weekData
}

/**
 * 今週の合計学習時間を取得
 *
 * @returns 今週の合計学習時間（秒単位）
 */
export const getWeeklyTotalTime = async (): Promise<number> => {
  const weekData = await getWeeklyStudyTime()
  return weekData.reduce((sum, time) => sum + time, 0)
}

/**
 * 曜日のラベルを取得
 *
 * @returns 曜日のラベル配列 ['月', '火', '水', '木', '金', '土', '日']
 */
export const getWeekDayLabels = (): string[] => {
  return ['月', '火', '水', '木', '金', '土', '日']
}

/**
 * 設定を考慮した週間学習時間を取得
 *
 * @returns 学習時間データ配列と曜日ラベル配列
 */
export const getWeeklyStudyTimeWithSettings = async (): Promise<{
  data: number[]
  labels: string[]
}> => {
  const records = await db.studyRecords.toArray()
  const startDay = getWeekStartDay()
  const displayMode = getWeekDisplayMode()

  // 3時リセットのロジックで日付を正規化
  const normalizeDate = (timestamp: number | Date): string => {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
    if (date.getHours() < 3) {
      date.setDate(date.getDate() - 1)
    }
    return date.toISOString().split('T')[0]
  }

  // 今日の日付（3時リセット適用）
  const today = new Date()
  if (today.getHours() < 3) {
    today.setDate(today.getDate() - 1)
  }

  let weekData: number[]
  let labels: string[]

  if (displayMode === 'last-7-days') {
    // 直近7日間
    weekData = Array(7).fill(0)
    labels = []

    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() - i)
      const dateStr = targetDate.toISOString().split('T')[0]

      // その日の学習記録を抽出
      const dayRecords = records.filter(r => normalizeDate(r.studiedAt) === dateStr)
      weekData[6 - i] = dayRecords.reduce((sum, r) => sum + r.studyTime, 0)

      // ラベル作成（曜日）
      const dayOfWeek = targetDate.getDay()
      const dayLabels = ['日', '月', '火', '水', '木', '金', '土']
      labels.push(dayLabels[dayOfWeek])
    }
  } else if (displayMode === 'last-14-days') {
    // 直近14日間
    weekData = Array(14).fill(0)
    labels = []

    for (let i = 13; i >= 0; i--) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() - i)
      const dateStr = targetDate.toISOString().split('T')[0]

      // その日の学習記録を抽出
      const dayRecords = records.filter(r => normalizeDate(r.studiedAt) === dateStr)
      weekData[13 - i] = dayRecords.reduce((sum, r) => sum + r.studyTime, 0)

      // ラベル作成（日付）
      labels.push(`${targetDate.getMonth() + 1}/${targetDate.getDate()}`)
    }
  } else {
    // 今週（開始曜日を考慮）
    weekData = Array(7).fill(0)
    labels = getWeekDayLabelsWithStartDay(startDay)

    const todayDay = today.getDay()

    // 今週の開始日を計算
    const weekStart = new Date(today)
    let diffToStart = (todayDay - startDay + 7) % 7
    weekStart.setDate(today.getDate() - diffToStart)

    // 開始日から7日間
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(weekStart)
      targetDate.setDate(weekStart.getDate() + i)
      const dateStr = targetDate.toISOString().split('T')[0]

      // その日の学習記録を抽出
      const dayRecords = records.filter(r => normalizeDate(r.studiedAt) === dateStr)
      weekData[i] = dayRecords.reduce((sum, r) => sum + r.studyTime, 0)
    }
  }

  return { data: weekData, labels }
}

/**
 * 開始曜日に応じた曜日ラベルを取得
 *
 * @param startDay 開始曜日（0=日曜, 1=月曜, ...）
 * @returns 曜日ラベル配列
 */
export const getWeekDayLabelsWithStartDay = (startDay: WeekStartDay): string[] => {
  const allDays = ['日', '月', '火', '水', '木', '金', '土']
  const result: string[] = []

  for (let i = 0; i < 7; i++) {
    result.push(allDays[(startDay + i) % 7])
  }

  return result
}

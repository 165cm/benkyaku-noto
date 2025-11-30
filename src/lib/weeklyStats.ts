import { db } from './db'

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

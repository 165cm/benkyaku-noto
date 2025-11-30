import { db } from './db'

/**
 * 連続学習日数を計算する
 *
 * 3時リセットのロジックを使用：
 * - 夜中の3時までは前日としてカウント
 * - 例: 2024-01-01 2:59 → 2023-12-31の学習としてカウント
 *
 * @returns 連続学習日数
 */
export const calculateStreak = async (): Promise<number> => {
  const records = await db.studyRecords.toArray()

  if (records.length === 0) {
    return 0
  }

  // 3時リセットのロジックで日付を正規化
  const normalizeDate = (timestamp: number | Date): string => {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
    // 3時前の場合は前日扱い
    if (date.getHours() < 3) {
      date.setDate(date.getDate() - 1)
    }
    return date.toISOString().split('T')[0]
  }

  // 学習した日付の一覧を取得（重複なし、降順）
  const dateSet = new Set(records.map(r => normalizeDate(r.studiedAt)))
  const sortedDates = Array.from(dateSet).sort().reverse()

  // 連続日数をカウント
  let streak = 0

  for (let i = 0; i < sortedDates.length; i++) {
    // i日前の日付を計算
    const expectedDate = new Date()
    if (expectedDate.getHours() < 3) {
      expectedDate.setDate(expectedDate.getDate() - 1)
    }
    expectedDate.setDate(expectedDate.getDate() - i)
    const expected = expectedDate.toISOString().split('T')[0]

    if (sortedDates[i] === expected) {
      streak++
    } else {
      // 連続が途切れた
      break
    }
  }

  return streak
}

/**
 * 今日の学習記録があるかチェック
 *
 * @returns 今日学習した場合はtrue
 */
export const hasStudiedToday = async (): Promise<boolean> => {
  const records = await db.studyRecords.toArray()

  const normalizeDate = (timestamp: number | Date): string => {
    const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
    if (date.getHours() < 3) {
      date.setDate(date.getDate() - 1)
    }
    return date.toISOString().split('T')[0]
  }

  const today = normalizeDate(Date.now())
  const todayRecords = records.filter(r => normalizeDate(r.studiedAt) === today)

  return todayRecords.length > 0
}

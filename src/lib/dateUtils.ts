/**
 * 学習アプリ用の日付ユーティリティ
 *
 * 日付の境界を「夜中の3時」に設定
 * - 0:00〜2:59 → 前日扱い
 * - 3:00〜23:59 → 当日扱い
 */

const DAY_BOUNDARY_HOUR = 3 // 日付変更時刻（3時）

/**
 * 今日の開始時刻（3時）を取得
 *
 * @returns 今日の3時（現在時刻が3時より前なら昨日の3時）
 */
export function getTodayStartTime(): Date {
  const now = new Date()
  const todayAt3AM = new Date(now)

  // 今日の3時を設定
  todayAt3AM.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0)

  // 現在時刻が3時より前の場合は、昨日の3時を基準にする
  if (now.getHours() < DAY_BOUNDARY_HOUR) {
    todayAt3AM.setDate(todayAt3AM.getDate() - 1)
  }

  return todayAt3AM
}

/**
 * 指定された日時を学習日付に変換
 *
 * 3時を境界として、それより前は前日扱いにする
 *
 * @param date - 変換する日時
 * @returns 学習日付（時刻は0:00:00）
 */
export function getStudyDate(date: Date): Date {
  const studyDate = new Date(date)

  // 3時より前の場合は1日戻す
  if (studyDate.getHours() < DAY_BOUNDARY_HOUR) {
    studyDate.setDate(studyDate.getDate() - 1)
  }

  // 時刻を0:00:00にリセット
  studyDate.setHours(0, 0, 0, 0)

  return studyDate
}

/**
 * 2つの日時が同じ学習日かどうかを判定
 *
 * @param date1 - 比較する日時1
 * @param date2 - 比較する日時2
 * @returns 同じ学習日の場合true
 */
export function isSameStudyDay(date1: Date, date2: Date): boolean {
  const studyDate1 = getStudyDate(date1)
  const studyDate2 = getStudyDate(date2)

  return studyDate1.getTime() === studyDate2.getTime()
}

/**
 * 2つの学習日の差（日数）を計算
 *
 * @param fromDate - 開始日時
 * @param toDate - 終了日時
 * @returns 経過日数
 */
export function getStudyDaysDiff(fromDate: Date, toDate: Date): number {
  const studyDate1 = getStudyDate(fromDate)
  const studyDate2 = getStudyDate(toDate)

  return Math.floor(
    (studyDate2.getTime() - studyDate1.getTime()) / (1000 * 60 * 60 * 24)
  )
}

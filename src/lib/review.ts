import { db } from './db'
import { getExcludedCategories, getExcludedSections, getExcludedProblems } from './storage'
import { getTodayStartTime, getStudyDate, getStudyDaysDiff } from './dateUtils'

import { calculateWeightedAverage } from './weakModeSession'
import type { StudyRecord, ReviewSchedule, Problem } from '@/types'

// 問題のセクションキーを取得
function getProblemSectionKey(problem: Problem): string {
  const category = problem.category || '未分類'
  const title = problem.sectionTitle || '問題'
  return `${category}-${title}`
}

// 除外設定の型定義
export interface Exclusions {
  categories: string[]
  sections: string[]
  problems: string[]
}

// 除外設定を一括取得
export async function getExclusions(): Promise<Exclusions> {
  const [categories, sections, problems] = await Promise.all([
    getExcludedCategories(),
    getExcludedSections(),
    getExcludedProblems()
  ])
  return { categories, sections, problems }
}

// 問題が除外対象かどうかをチェック
export function isProblemExcluded(problem: Problem, exclusions: Exclusions): boolean {
  // 問題ID単位で除外（最優先）
  if (exclusions.problems.includes(problem.id)) {
    return true
  }

  // カテゴリで除外
  const category = problem.category || '未分類'
  if (exclusions.categories.includes(category)) {
    return true
  }

  // セクションで除外
  const sectionKey = getProblemSectionKey(problem)
  if (exclusions.sections.includes(sectionKey)) {
    return true
  }

  return false
}

// 正答率の計算（直近3回の重み付け平均）
export function calculateAverageScore(records: StudyRecord[]): number {
  if (records.length === 0) return 0

  // 最新順にソート
  const sortedRecords = [...records].sort((a, b) =>
    b.studiedAt.getTime() - a.studiedAt.getTime()
  )

  // 直近3回の結果を取得
  const recent3 = sortedRecords.slice(0, 3)
  const results = recent3.map(r => r.result)

  // calculateWeightedAverageを使用（0-100の範囲で返される）
  return calculateWeightedAverage(results)
}

// 経過日数係数の計算（忘却曲線に基づく）
export function getDaysCoefficient(daysSinceLastStudy: number): number {
  if (daysSinceLastStudy < 1) return 0    // 今日学習済みは除外
  if (daysSinceLastStudy <= 1) return 1.0  // 1日経過
  if (daysSinceLastStudy <= 3) return 1.5  // 2-3日経過
  if (daysSinceLastStudy <= 7) return 2.5  // 4-7日経過
  if (daysSinceLastStudy <= 14) return 4.0 // 8-14日経過
  if (daysSinceLastStudy <= 30) return 6.0 // 15-30日経過
  return 8.0                               // 30日以上経過
}

// 復習優先度スコアの計算
export function calculatePriorityScore(averageScore: number, daysSinceLastStudy: number): number {
  const coefficient = getDaysCoefficient(daysSinceLastStudy)
  return (100 - averageScore) * coefficient
}

// 今日の復習リストを取得
export async function getTodayReviewList(): Promise<ReviewSchedule[]> {
  const allRecords = await db.studyRecords.toArray()
  const allProblems = await db.problems.toArray()

  // 除外設定を取得
  const exclusions = await getExclusions()

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p, exclusions))

  const allWorkbooks = await db.workbooks.toArray()

  // 親問題のIDを取得（子問題を持つ問題）
  const parentProblemIds = new Set<string>()
  activeProblems.forEach(p => {
    if (p.parentProblemId) {
      parentProblemIds.add(p.parentProblemId)
    }
  })

  // 問題ごとにグループ化
  const problemRecordsMap = new Map<string, StudyRecord[]>()

  allRecords.forEach((record) => {
    const records = problemRecordsMap.get(record.problemId) || []
    records.push(record)
    problemRecordsMap.set(record.problemId, records)
  })

  // 復習スケジュールを計算
  const reviewSchedules: ReviewSchedule[] = []
  const today = getStudyDate(new Date())  // 3時基準の今日の日付
  const processedProblems = new Set<string>() // 処理済み問題を記録

  for (const [problemId, records] of problemRecordsMap) {
    // 既に処理済みの問題はスキップ
    if (processedProblems.has(problemId)) {
      continue
    }

    const problem = activeProblems.find((p) => p.id === problemId)
    if (!problem) continue

    // 子問題の場合、親問題で処理するためスキップ
    if (problem.parentProblemId) {
      continue
    }

    const workbook = allWorkbooks.find((w) => w.id === problem?.workbookId)
    if (!workbook) continue

    // 親問題の場合、子問題全体の学習記録を集計
    let averageScore: number
    let lastStudiedAt: Date
    let reviewCount: number

    if (parentProblemIds.has(problemId)) {
      // 親問題: 子問題全体の学習記録を集計
      const subProblems = activeProblems.filter(p => p.parentProblemId === problemId)
      const allSubRecords: StudyRecord[] = [...records]

      // 子問題の学習記録を収集
      subProblems.forEach(subProblem => {
        const subRecords = problemRecordsMap.get(subProblem.id)
        if (subRecords) {
          allSubRecords.push(...subRecords)
          processedProblems.add(subProblem.id) // 子問題を処理済みとしてマーク
        }
      })

      // 全体の平均スコアを計算
      averageScore = calculateAverageScore(allSubRecords)

      // 最新の学習日時を取得
      const sortedRecords = allSubRecords.sort(
        (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
      )
      lastStudiedAt = sortedRecords[0].studiedAt
      reviewCount = allSubRecords.length
    } else {
      // 通常問題: 自身の学習記録のみを使用
      const sortedRecords = records.sort(
        (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
      )
      lastStudiedAt = sortedRecords[0].studiedAt
      averageScore = calculateAverageScore(records)
      reviewCount = records.length
    }

    // 3時基準で経過日数を計算
    const daysSince = getStudyDaysDiff(lastStudiedAt, new Date())
    const priorityScore = calculatePriorityScore(averageScore, daysSince)

    reviewSchedules.push({
      problemId,
      problemNumber: problem.problemNumber,
      sectionTitle: problem.sectionTitle,
      category: problem.category,
      workbookTitle: workbook.title,
      nextReviewDate: today,
      reviewCount,
      averageScore,
      lastStudiedAt,
      priorityScore,
    })

    processedProblems.add(problemId)
  }

  // 今日学習済み（priorityScore = 0）を除外し、優先度スコアの降順でソート
  return reviewSchedules
    .filter((schedule) => schedule.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
}

// 配列をシャッフルする
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// もう一周リストを取得（回答回数が少ない問題を優先）
export interface ReviewAgainOptions {
  maxReviewCount?: number  // 最大回答回数（例: 3 → 3回以下の問題）
  minAccuracy?: number     // 最低正答率（例: 80 → 80%以上の問題）
  sortBy?: 'count' | 'oldest' | 'newest' | 'random'  // 並び順
}

export async function getReviewAgainList(options?: ReviewAgainOptions): Promise<ReviewSchedule[]> {
  const allRecords = await db.studyRecords.toArray()
  const allProblems = await db.problems.toArray()

  // 除外設定を取得
  const exclusions = await getExclusions()

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p, exclusions))

  const allWorkbooks = await db.workbooks.toArray()

  // 親問題のIDを取得（子問題を持つ問題）
  const parentProblemIds = new Set<string>()
  activeProblems.forEach(p => {
    if (p.parentProblemId) {
      parentProblemIds.add(p.parentProblemId)
    }
  })

  // 問題ごとにグループ化
  const problemRecordsMap = new Map<string, StudyRecord[]>()

  allRecords.forEach((record) => {
    const records = problemRecordsMap.get(record.problemId) || []
    records.push(record)
    problemRecordsMap.set(record.problemId, records)
  })

  // 復習スケジュールを計算
  const reviewSchedules: ReviewSchedule[] = []
  const today = getStudyDate(new Date())  // 3時基準の今日の日付
  const processedProblems = new Set<string>() // 処理済み問題を記録

  for (const [problemId, records] of problemRecordsMap) {
    // 既に処理済みの問題はスキップ
    if (processedProblems.has(problemId)) {
      continue
    }

    const problem = activeProblems.find((p) => p.id === problemId)
    if (!problem) continue

    // 子問題の場合、親問題で処理するためスキップ
    if (problem.parentProblemId) {
      continue
    }

    const workbook = allWorkbooks.find((w) => w.id === problem?.workbookId)
    if (!workbook) continue

    // 親問題の場合、子問題全体の学習記録を集計
    let averageScore: number
    let lastStudiedAt: Date
    let reviewCount: number

    if (parentProblemIds.has(problemId)) {
      // 親問題: 子問題全体の学習記録を集計
      const subProblems = activeProblems.filter(p => p.parentProblemId === problemId)
      const allSubRecords: StudyRecord[] = [...records]

      // 子問題の学習記録を収集
      subProblems.forEach(subProblem => {
        const subRecords = problemRecordsMap.get(subProblem.id)
        if (subRecords) {
          allSubRecords.push(...subRecords)
          processedProblems.add(subProblem.id) // 子問題を処理済みとしてマーク
        }
      })

      // 全体の平均スコアを計算
      averageScore = calculateAverageScore(allSubRecords)

      // 最新の学習日時を取得
      const sortedRecords = allSubRecords.sort(
        (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
      )
      lastStudiedAt = sortedRecords[0].studiedAt
      reviewCount = allSubRecords.length
    } else {
      // 通常問題: 自身の学習記録のみを使用
      const sortedRecords = records.sort(
        (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
      )
      lastStudiedAt = sortedRecords[0].studiedAt
      averageScore = calculateAverageScore(records)
      reviewCount = records.length
    }

    // 3時基準で経過日数を計算
    const daysSince = getStudyDaysDiff(lastStudiedAt, new Date())
    const priorityScore = calculatePriorityScore(averageScore, daysSince)

    reviewSchedules.push({
      problemId,
      problemNumber: problem.problemNumber,
      sectionTitle: problem.sectionTitle,
      category: problem.category,
      workbookTitle: workbook.title,
      nextReviewDate: today,
      reviewCount,
      averageScore,
      lastStudiedAt,
      priorityScore,
    })

    processedProblems.add(problemId)
  }

  // フィルター適用（今日学習済みも含む）
  let filtered = reviewSchedules

  if (options?.maxReviewCount !== undefined) {
    filtered = filtered.filter(s => s.reviewCount <= options.maxReviewCount!)
  }

  if (options?.minAccuracy !== undefined) {
    filtered = filtered.filter(s => s.averageScore >= options.minAccuracy!)
  }

  // ソート
  switch (options?.sortBy) {
    case 'oldest':
      // 最終学習が古い順（新鮮に感じる）
      return filtered.sort((a, b) =>
        a.lastStudiedAt.getTime() - b.lastStudiedAt.getTime()
      )
    case 'newest':
      // 最終学習が新しい順
      return filtered.sort((a, b) =>
        b.lastStudiedAt.getTime() - a.lastStudiedAt.getTime()
      )
    case 'random':
      // ランダム
      return shuffleArray(filtered)
    case 'count':
    default:
      // デフォルト: 回答回数が少ない順
      return filtered.sort((a, b) => a.reviewCount - b.reviewCount)
  }
}

// 問題リストの推定学習時間を計算（秒単位）
export async function estimateReviewTime(problemIds: string[]): Promise<number> {
  if (problemIds.length === 0) return 0

  const allRecords = await db.studyRecords.toArray()

  // 各問題の復習時間を収集
  const reviewTimes: number[] = []

  for (const problemId of problemIds) {
    const records = allRecords.filter(r => r.problemId === problemId)

    if (records.length > 1) {
      // 2回目以降の学習時間を取得（復習時間）
      const sortedRecords = records.sort((a, b) => a.studiedAt.getTime() - b.studiedAt.getTime())
      for (let i = 1; i < sortedRecords.length; i++) {
        reviewTimes.push(sortedRecords[i].studyTime)
      }
    } else if (records.length === 1) {
      // 1回しか学習していない場合は初回時間を使う
      reviewTimes.push(records[0].studyTime)
    }
  }

  if (reviewTimes.length === 0) {
    // データがない場合はデフォルト（3分 = 180秒）
    return problemIds.length * 180
  }

  // 外れ値を除外して平均を計算
  const cleanedTimes = removeOutliers(reviewTimes)
  const averageTime = cleanedTimes.length > 0
    ? calculateWeightedMean(cleanedTimes)
    : 180

  return problemIds.length * averageTime
}

// 学習統計の計算
export async function calculateStudyStats() {
  const todayStart = getTodayStartTime()  // 今日の3時

  const weekStart = new Date(todayStart)
  weekStart.setDate(todayStart.getDate() - 6)

  const allRecords = await db.studyRecords.toArray()

  const todayRecords = allRecords.filter((r) => r.studiedAt >= todayStart)
  const weekRecords = allRecords.filter((r) => r.studiedAt >= weekStart)

  const totalStudyTime = allRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const todayStudyTime = todayRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const weekStudyTime = weekRecords.reduce((sum, r) => sum + r.studyTime, 0)

  // 正解率の計算（最新3回の重み付け平均）
  // 学習記録から問題IDを抽出し、各問題の最新3回で計算
  const problemIds = new Set(allRecords.map(r => r.problemId))
  const problems = await db.problems.where('id').anyOf([...problemIds]).toArray()
  const correctRate = await calculateRecentAccuracyForProblems(problems) || 0

  // 週間データ（3時基準）
  const weeklyData = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(todayStart)
    date.setDate(todayStart.getDate() - i)
    date.setHours(0, 0, 0, 0) // 時刻を00:00:00にリセット（getStudyDate()と同じ形式に）
    const dateStr = date.toISOString().split('T')[0]

    const dayRecords = allRecords.filter((r) => {
      const recordStudyDate = getStudyDate(r.studiedAt)
      return recordStudyDate.getTime() === date.getTime()
    })

    weeklyData.push({
      date: dateStr,
      studyTime: dayRecords.reduce((sum, r) => sum + r.studyTime, 0),
      problemsSolved: dayRecords.length,
    })
  }

  return {
    totalStudyTime,
    todayStudyTime,
    weekStudyTime,
    totalProblemsSolved: allRecords.length,
    correctRate: Math.round(correctRate),
    weeklyData,
  }
}

// 問題集別の学習統計の計算（日別正答率を含む）
export async function calculateStudyStatsByWorkbook(workbookId?: string) {
  const todayStart = getTodayStartTime()  // 今日の3時

  const weekStart = new Date(todayStart)
  weekStart.setDate(todayStart.getDate() - 6)

  let allRecords = await db.studyRecords.toArray()

  // 問題集でフィルタリング
  if (workbookId) {
    allRecords = allRecords.filter((r) => r.workbookId === workbookId)
  }

  const todayRecords = allRecords.filter((r) => r.studiedAt >= todayStart)
  const weekRecords = allRecords.filter((r) => r.studiedAt >= weekStart)

  const totalStudyTime = allRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const todayStudyTime = todayRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const weekStudyTime = weekRecords.reduce((sum, r) => sum + r.studyTime, 0)

  // 正解率の計算（最新3回の重み付け平均）
  // 学習記録から問題IDを抽出し、各問題の最新3回で計算
  const problemIds = new Set(allRecords.map(r => r.problemId))
  const problems = await db.problems.where('id').anyOf([...problemIds]).toArray()
  const correctRate = await calculateRecentAccuracyForProblems(problems) || 0

  // 週間データ（学習時間、問題数、正答率）- 3時基準
  const weeklyData = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(todayStart)
    date.setDate(todayStart.getDate() - i)
    date.setHours(0, 0, 0, 0) // 時刻を00:00:00にリセット（getStudyDate()と同じ形式に）
    const dateStr = date.toISOString().split('T')[0]

    const dayRecords = allRecords.filter((r) => {
      const recordStudyDate = getStudyDate(r.studiedAt)
      return recordStudyDate.getTime() === date.getTime()
    })

    // 日別正解率の計算（部分正解を0.5点として統一）
    const dayCorrectCount = dayRecords.filter((r) => r.result === 'correct').length
    const dayPartialCount = dayRecords.filter((r) => r.result === 'partial').length
    const dayTotalScore = dayCorrectCount + (dayPartialCount * 0.5)
    const dayAccuracy = dayRecords.length > 0 ? Math.round((dayTotalScore / dayRecords.length) * 100) : null

    weeklyData.push({
      date: dateStr,
      studyTime: dayRecords.reduce((sum, r) => sum + r.studyTime, 0),
      problemsSolved: dayRecords.length,
      accuracy: dayAccuracy,
    })
  }

  return {
    totalStudyTime,
    todayStudyTime,
    weekStudyTime,
    totalProblemsSolved: allRecords.length,
    correctRate: Math.round(correctRate),
    weeklyData,
  }
}

// 期間指定の統計を計算
export type DateRangeType = 'week' | 'month' | 'all' | 'custom'

export interface DateRange {
  type: DateRangeType
  startDate?: Date
  endDate?: Date
}

export async function calculateStudyStatsWithDateRange(
  workbookId?: string,
  dateRange?: DateRange
) {
  const todayStart = getTodayStartTime()

  let allRecords = await db.studyRecords.toArray()

  // 問題集でフィルタリング
  if (workbookId) {
    allRecords = allRecords.filter((r) => r.workbookId === workbookId)
  }

  // 期間の設定
  let startDate: Date
  let endDate: Date = new Date(todayStart)
  endDate.setDate(endDate.getDate() + 1) // 今日の終わり

  const rangeType = dateRange?.type || 'week'

  switch (rangeType) {
    case 'week':
      startDate = new Date(todayStart)
      startDate.setDate(startDate.getDate() - 6)
      break
    case 'month':
      startDate = new Date(todayStart)
      startDate.setDate(startDate.getDate() - 29) // 30日間
      break
    case 'all':
      // 最も古い記録の日付を取得
      if (allRecords.length > 0) {
        const sortedRecords = [...allRecords].sort(
          (a, b) => a.studiedAt.getTime() - b.studiedAt.getTime()
        )
        startDate = getStudyDate(sortedRecords[0].studiedAt)
      } else {
        startDate = new Date(todayStart)
        startDate.setDate(startDate.getDate() - 6)
      }
      break
    case 'custom':
      startDate = dateRange?.startDate || new Date(todayStart)
      if (dateRange?.endDate) {
        endDate = new Date(dateRange.endDate)
        endDate.setDate(endDate.getDate() + 1)
      }
      break
    default:
      startDate = new Date(todayStart)
      startDate.setDate(startDate.getDate() - 6)
  }

  // 期間内の記録をフィルタリング
  const periodRecords = allRecords.filter((r) => {
    const recordDate = getStudyDate(r.studiedAt)
    return recordDate >= getStudyDate(startDate) && recordDate <= endDate
  })

  // 今日の記録
  const todayRecords = allRecords.filter((r) => r.studiedAt >= todayStart)

  // 週の記録
  const weekStart = new Date(todayStart)
  weekStart.setDate(todayStart.getDate() - 6)
  const weekRecords = allRecords.filter((r) => r.studiedAt >= weekStart)

  const totalStudyTime = allRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const todayStudyTime = todayRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const weekStudyTime = weekRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const periodStudyTime = periodRecords.reduce((sum, r) => sum + r.studyTime, 0)

  // 期間内の問題IDから正解率を計算
  const problemIds = new Set(periodRecords.map(r => r.problemId))
  const problems = await db.problems.where('id').anyOf([...problemIds]).toArray()
  const correctRate = await calculateRecentAccuracyForProblems(problems) || 0

  // 期間に応じた日付データを生成
  const chartData: Array<{
    date: string
    studyTime: number
    problemsSolved: number
    accuracy: number | null
    isWeekly?: boolean
    isMonthly?: boolean
  }> = []
  const normalizedStartDate = getStudyDate(startDate)
  const normalizedEndDate = getStudyDate(endDate)
  const daysDiff = Math.ceil(
    (normalizedEndDate.getTime() - normalizedStartDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // データを集計する単位を決定（日、週、月）
  let aggregationType: 'day' | 'week' | 'month' = 'day'
  if (daysDiff > 90) {
    aggregationType = 'month'
  } else if (daysDiff > 31) {
    aggregationType = 'week'
  }

  if (aggregationType === 'day') {
    // 日別データ
    for (let i = 0; i < daysDiff; i++) {
      const date = new Date(normalizedStartDate)
      date.setDate(normalizedStartDate.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]

      const dayRecords = periodRecords.filter((r) => {
        const recordStudyDate = getStudyDate(r.studiedAt)
        return recordStudyDate.getTime() === date.getTime()
      })

      const dayCorrectCount = dayRecords.filter((r) => r.result === 'correct').length
      const dayPartialCount = dayRecords.filter((r) => r.result === 'partial').length
      const dayTotalScore = dayCorrectCount + (dayPartialCount * 0.5)
      const dayAccuracy = dayRecords.length > 0
        ? Math.round((dayTotalScore / dayRecords.length) * 100)
        : null

      chartData.push({
        date: dateStr,
        studyTime: dayRecords.reduce((sum, r) => sum + r.studyTime, 0),
        problemsSolved: dayRecords.length,
        accuracy: dayAccuracy,
      })
    }
  } else if (aggregationType === 'week') {
    // 週別データ
    let currentWeekStart = new Date(normalizedStartDate)
    while (currentWeekStart < normalizedEndDate) {
      const weekEnd = new Date(currentWeekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const weekRecordsInRange = periodRecords.filter((r) => {
        const recordStudyDate = getStudyDate(r.studiedAt)
        return recordStudyDate >= currentWeekStart && recordStudyDate <= weekEnd
      })

      const weekCorrectCount = weekRecordsInRange.filter((r) => r.result === 'correct').length
      const weekPartialCount = weekRecordsInRange.filter((r) => r.result === 'partial').length
      const weekTotalScore = weekCorrectCount + (weekPartialCount * 0.5)
      const weekAccuracy = weekRecordsInRange.length > 0
        ? Math.round((weekTotalScore / weekRecordsInRange.length) * 100)
        : null

      chartData.push({
        date: currentWeekStart.toISOString().split('T')[0],
        studyTime: weekRecordsInRange.reduce((sum, r) => sum + r.studyTime, 0),
        problemsSolved: weekRecordsInRange.length,
        accuracy: weekAccuracy,
        isWeekly: true,
      })

      currentWeekStart = new Date(weekEnd)
      currentWeekStart.setDate(currentWeekStart.getDate() + 1)
    }
  } else {
    // 月別データ
    let currentMonth = new Date(normalizedStartDate.getFullYear(), normalizedStartDate.getMonth(), 1)
    while (currentMonth < normalizedEndDate) {
      const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)

      const monthRecords = periodRecords.filter((r) => {
        const recordStudyDate = getStudyDate(r.studiedAt)
        return recordStudyDate >= currentMonth && recordStudyDate < nextMonth
      })

      const monthCorrectCount = monthRecords.filter((r) => r.result === 'correct').length
      const monthPartialCount = monthRecords.filter((r) => r.result === 'partial').length
      const monthTotalScore = monthCorrectCount + (monthPartialCount * 0.5)
      const monthAccuracy = monthRecords.length > 0
        ? Math.round((monthTotalScore / monthRecords.length) * 100)
        : null

      chartData.push({
        date: currentMonth.toISOString().split('T')[0],
        studyTime: monthRecords.reduce((sum, r) => sum + r.studyTime, 0),
        problemsSolved: monthRecords.length,
        accuracy: monthAccuracy,
        isMonthly: true,
      })

      currentMonth = nextMonth
    }
  }

  return {
    totalStudyTime,
    todayStudyTime,
    weekStudyTime,
    periodStudyTime,
    totalProblemsSolved: allRecords.length,
    periodProblemsSolved: periodRecords.length,
    correctRate: Math.round(correctRate),
    chartData,
    dateRange: {
      type: rangeType,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      aggregationType,
    },
  }
}

// 問題セットの直近回答の正解率を計算（重み付け平均）
export async function calculateRecentAccuracyForProblems(problems: Problem[]): Promise<number | null> {
  if (problems.length === 0) return null

  // 各問題の最新3回の学習記録を並列で取得
  const recordsPromises = problems.map(problem =>
    db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .reverse()
      .sortBy('studiedAt')
  )

  const allRecords = await Promise.all(recordsPromises)

  // 重み付け平均でスコア化
  const recentScores: number[] = []
  for (const records of allRecords) {
    if (records.length > 0) {
      // 最新3回の記録を取得してcalculateWeightedAverageを使用
      const recent3 = records.slice(0, 3)
      const results = recent3.map(r => r.result)
      const weightedScore = calculateWeightedAverage(results)
      recentScores.push(weightedScore)
    }
  }

  // 学習記録がある問題が1つもない場合はnullを返す
  if (recentScores.length === 0) return null

  // 平均を計算
  const average = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length
  return Math.round(average)
}

// セクション情報の型定義
export interface SectionStats {
  sectionKey: string
  category: string
  title: string
  problems: Problem[]
  accuracy: number | null
  studiedCount: number
  averageReviewCount: number  // 平均周回数（学習記録数の平均）
}

// セクション別の正解率を計算
export async function calculateSectionStats(): Promise<SectionStats[]> {
  const allProblems = await db.problems.toArray()

  // 除外設定を取得
  const exclusions = await getExclusions()

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p, exclusions))

  // 問題をセクション（カテゴリ×タイトル）でグルーピング
  const sectionMap = new Map<string, Problem[]>()

  activeProblems.forEach((problem) => {
    // categoryフィールドが設定されている場合はそれを優先
    const category = problem.category || '未分類'
    // sectionTitleフィールドを優先的に使用
    const title = problem.sectionTitle || '問題'

    const sectionKey = `${category}-${title}`
    const existing = sectionMap.get(sectionKey) || []
    existing.push(problem)
    sectionMap.set(sectionKey, existing)
  })

  // 各セクションの統計を計算
  const sectionStats: SectionStats[] = []

  for (const [sectionKey, problems] of sectionMap.entries()) {
    const [category, ...titleParts] = sectionKey.split('-')
    const title = titleParts.join('-')

    // このセクションの正解率を計算
    const accuracy = await calculateRecentAccuracyForProblems(problems)

    // 学習済みの問題数と平均周回数をカウント
    let studiedCount = 0
    let totalReviewCount = 0
    for (const problem of problems) {
      const records = await db.studyRecords
        .where('problemId')
        .equals(problem.id)
        .count()
      if (records > 0) {
        studiedCount++
        totalReviewCount += records
      }
    }

    // 平均周回数を計算（学習済み問題がある場合のみ）
    const averageReviewCount = studiedCount > 0
      ? Math.round(totalReviewCount / studiedCount)
      : 0

    sectionStats.push({
      sectionKey,
      category,
      title,
      problems,
      accuracy,
      studiedCount,
      averageReviewCount,
    })
  }

  // 学習済みセクションのみを、正解率の低い順にソート（nullは除外）
  return sectionStats
    .filter((s) => s.accuracy !== null)
    .sort((a, b) => {
      if (a.accuracy === null && b.accuracy === null) return 0
      if (a.accuracy === null) return 1
      if (b.accuracy === null) return -1
      return a.accuracy - b.accuracy
    })
}

// 苦手克服用の次の問題を取得（優先度スコア順）
export async function getNextWeakProblem(excludeProblemId?: string): Promise<Problem | null> {
  const reviewList = await getTodayReviewList()

  // 除外する問題をフィルタ（現在の問題を除外）
  const filteredList = excludeProblemId
    ? reviewList.filter(r => r.problemId !== excludeProblemId)
    : reviewList

  if (filteredList.length === 0) {
    return null
  }

  // 最も優先度の高い問題を取得
  const highestPriority = filteredList[0]
  const problem = await db.problems.get(highestPriority.problemId)

  return problem || null
}

// 問題集のセクション一覧を取得（正答率付き）
export async function getWorkbookSections(workbookId: string): Promise<SectionStats[]> {
  const allProblems = await db.problems
    .where('workbookId')
    .equals(workbookId)
    .toArray()

  // 削除された問題を除外
  const activeProblems = allProblems.filter(p => !p.deletedAt)

  // 問題をセクション（カテゴリ×タイトル）でグルーピング
  const sectionMap = new Map<string, Problem[]>()

  activeProblems.forEach((problem) => {
    const category = problem.category || '未分類'
    const title = problem.sectionTitle || '問題'

    const sectionKey = `${category}-${title}`
    const existing = sectionMap.get(sectionKey) || []
    existing.push(problem)
    sectionMap.set(sectionKey, existing)
  })

  // 各セクションの統計を計算
  const sectionStats: SectionStats[] = []

  for (const [sectionKey, problems] of sectionMap.entries()) {
    const [category, ...titleParts] = sectionKey.split('-')
    const title = titleParts.join('-')

    // このセクションの正解率を計算
    const accuracy = await calculateRecentAccuracyForProblems(problems)

    // 学習済みの問題数と平均周回数をカウント
    let studiedCount = 0
    let totalReviewCount = 0
    for (const problem of problems) {
      const records = await db.studyRecords
        .where('problemId')
        .equals(problem.id)
        .count()
      if (records > 0) {
        studiedCount++
        totalReviewCount += records
      }
    }

    // 平均周回数を計算（学習済み問題がある場合のみ）
    const averageReviewCount = studiedCount > 0
      ? Math.round(totalReviewCount / studiedCount)
      : 0

    sectionStats.push({
      sectionKey,
      category,
      title,
      problems,
      accuracy,
      studiedCount,
      averageReviewCount,
    })
  }

  // 正解率の低い順にソート（nullは最後）
  return sectionStats.sort((a, b) => {
    if (a.accuracy === null && b.accuracy === null) return 0
    if (a.accuracy === null) return 1
    if (b.accuracy === null) return -1
    return a.accuracy - b.accuracy
  })
}

// 旧関数（後方互換性のため残す）
export async function getWeakSectionProblem(): Promise<Problem | null> {
  return getNextWeakProblem()
}

// 今日の3時を基準とした学習時間を計算
export async function getTodayStudyTime(): Promise<number> {
  const todayStart = getTodayStartTime()

  // 3時以降の学習記録を取得
  const allRecords = await db.studyRecords.toArray()
  const todayRecords = allRecords.filter(record => {
    return record.studiedAt >= todayStart
  })

  // 合計学習時間を計算
  return todayRecords.reduce((sum, record) => sum + record.studyTime, 0)
}

// 外れ値を除外する（IQR法）
export function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values // データが少ない場合はそのまま

  const sorted = [...values].sort((a, b) => a - b)
  const q1Index = Math.floor(sorted.length * 0.25)
  const q3Index = Math.floor(sorted.length * 0.75)
  const q1 = sorted[q1Index]
  const q3 = sorted[q3Index]
  const iqr = q3 - q1
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr

  return values.filter(v => v >= lowerBound && v <= upperBound)
}

// ベイズ更新を考慮した重み付き平均（最新のデータを重視）
export function calculateWeightedMean(values: number[]): number {
  if (values.length === 0) return 0

  // 最新のデータほど重みを大きくする（指数的減衰）
  let weightedSum = 0
  let totalWeight = 0

  for (let i = 0; i < values.length; i++) {
    // 最新（末尾）ほど重みが大きい
    const weight = Math.exp(-(values.length - 1 - i) * 0.1)
    weightedSum += values[i] * weight
    totalWeight += weight
  }

  return Math.round(weightedSum / totalWeight)
}

// 問題集の統計情報を取得
export interface WorkbookStatistics {
  totalProblems: number              // 総問題数（除外・削除を除く）
  unstudiedProblems: number          // 未学習問題数
  averageStudyTime: number           // 1問あたりの平均学習時間（秒、整数）
  estimatedTimeToComplete: number    // 未学習完了までの見積もり時間（秒）
  oneCycleTime: number               // 1サイクル完了までの見積もり時間（秒）
  problemsBelow80: number            // 正解率80%未満の問題数
  averageReviewTime: number          // 1問あたりの平均復習時間（秒、整数）
  estimatedTimeTo80: number          // 正解率80%達成までの見積もり時間（秒）
  currentAccuracy: number | null     // 現在の正解率
}

export async function getWorkbookStatistics(workbookId: string): Promise<WorkbookStatistics> {
  // 問題集の全問題を取得（削除・除外を除く）
  const allProblems = await db.problems
    .where('workbookId')
    .equals(workbookId)
    .toArray()

  // 除外設定を取得
  const exclusions = await getExclusions()

  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p, exclusions))

  // 全学習記録を取得
  const allRecords = await db.studyRecords.toArray()
  const problemIds = activeProblems.map(p => p.id)
  const workbookRecords = allRecords.filter(r => problemIds.includes(r.problemId))

  // 問題ごとの学習記録をグループ化
  const recordsByProblem = new Map<string, StudyRecord[]>()
  for (const record of workbookRecords) {
    if (!recordsByProblem.has(record.problemId)) {
      recordsByProblem.set(record.problemId, [])
    }
    recordsByProblem.get(record.problemId)!.push(record)
  }

  // 未学習問題数を計算
  const unstudiedProblems = activeProblems.filter(
    p => !recordsByProblem.has(p.id) || recordsByProblem.get(p.id)!.length === 0
  ).length

  // 平均学習時間を計算（初回回答のみ、外れ値除外）
  const firstStudyTimes: number[] = []
  for (const [, records] of recordsByProblem) {
    if (records.length > 0) {
      const sortedRecords = [...records].sort((a, b) =>
        a.studiedAt.getTime() - b.studiedAt.getTime()
      )
      firstStudyTimes.push(sortedRecords[0].studyTime)
    }
  }

  const cleanedFirstTimes = removeOutliers(firstStudyTimes)
  const averageStudyTime = cleanedFirstTimes.length > 0
    ? calculateWeightedMean(cleanedFirstTimes)
    : 180 // デフォルト3分

  // 未学習完了までの見積もり時間
  const estimatedTimeToComplete = unstudiedProblems * averageStudyTime

  // 最新の回答時間をベースに1サイクル見積もりを計算
  const allStudyTimes: number[] = []
  for (const [, records] of recordsByProblem) {
    if (records.length > 0) {
      // 各問題の最新回答時間を取得
      const sortedRecords = [...records].sort((a, b) =>
        b.studiedAt.getTime() - a.studiedAt.getTime()
      )
      allStudyTimes.push(sortedRecords[0].studyTime)
    }
  }

  const cleanedAllTimes = removeOutliers(allStudyTimes)
  const averageLatestTime = cleanedAllTimes.length > 0
    ? calculateWeightedMean(cleanedAllTimes)
    : averageStudyTime

  const oneCycleTime = activeProblems.length * averageLatestTime

  // 正解率80%未満の問題数を計算
  let problemsBelow80 = 0
  for (const problem of activeProblems) {
    const records = recordsByProblem.get(problem.id) || []
    if (records.length > 0) {
      const accuracy = calculateAverageScore(records)
      if (accuracy < 80) {
        problemsBelow80++
      }
    }
  }

  // 平均復習時間を計算（2回目以降の回答、外れ値除外）
  const reviewTimes: number[] = []
  for (const [, records] of recordsByProblem) {
    if (records.length > 1) {
      const sortedRecords = [...records].sort((a, b) =>
        a.studiedAt.getTime() - b.studiedAt.getTime()
      )
      // 2回目以降を収集
      for (let i = 1; i < sortedRecords.length; i++) {
        reviewTimes.push(sortedRecords[i].studyTime)
      }
    }
  }

  const cleanedReviewTimes = removeOutliers(reviewTimes)
  const averageReviewTime = cleanedReviewTimes.length > 0
    ? calculateWeightedMean(cleanedReviewTimes)
    : averageStudyTime

  // 80%達成までの見積もり時間（平均3回の復習が必要と仮定）
  const estimatedTimeTo80 = problemsBelow80 * averageReviewTime * 3

  // 現在の正解率を計算
  const currentAccuracy = await calculateRecentAccuracyForProblems(activeProblems)

  return {
    totalProblems: activeProblems.length,
    unstudiedProblems,
    averageStudyTime,
    estimatedTimeToComplete,
    oneCycleTime,
    problemsBelow80,
    averageReviewTime,
    estimatedTimeTo80,
    currentAccuracy
  }
}

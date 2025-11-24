import { db } from './db'
import { getExcludedCategories, getExcludedSections } from './storage'
import type { StudyRecord, ReviewSchedule, Problem } from '@/types'

// 問題のセクションキーを取得
function getProblemSectionKey(problem: Problem): string {
  let category = problem.category || '未分類'
  let title = '問題'

  if (problem.category) {
    const parts = problem.problemNumber.split('-')
    title = parts.length > 1 ? parts.slice(0, -1).join('-') : '問題'
  } else {
    const match = problem.problemNumber.match(/^(\[.+?\])(.+?)-\d+$/)
    if (match) {
      category = match[1]
      title = match[2]
    } else {
      const parts = problem.problemNumber.split('-')
      if (parts[0].startsWith('[') && parts[0].endsWith(']')) {
        category = parts[0]
        title = parts.slice(1, -1).join('-') || '問題'
      } else {
        title = parts.length > 1 ? parts[0] : '問題'
      }
    }
  }

  return `${category}-${title}`
}

// 問題が除外対象かどうかをチェック
export function isProblemExcluded(problem: Problem): boolean {
  const excludedCategories = getExcludedCategories()
  const excludedSections = getExcludedSections()

  // カテゴリで除外
  const category = problem.category || '未分類'
  if (excludedCategories.includes(category)) {
    return true
  }

  // セクションで除外
  const sectionKey = getProblemSectionKey(problem)
  if (excludedSections.includes(sectionKey)) {
    return true
  }

  return false
}

// 正答率の計算
export function calculateAverageScore(records: StudyRecord[]): number {
  if (records.length === 0) return 0

  const totalScore = records.reduce((sum, record) => {
    const score = record.result === 'correct' ? 100 : record.result === 'partial' ? 50 : 0
    return sum + score
  }, 0)

  return totalScore / records.length
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

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p))

  const allWorkbooks = await db.workbooks.toArray()

  // 問題ごとにグループ化
  const problemRecordsMap = new Map<string, StudyRecord[]>()

  allRecords.forEach((record) => {
    const records = problemRecordsMap.get(record.problemId) || []
    records.push(record)
    problemRecordsMap.set(record.problemId, records)
  })

  // 復習スケジュールを計算
  const reviewSchedules: ReviewSchedule[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)  // 今日の0時0分0秒

  for (const [problemId, records] of problemRecordsMap) {
    const sortedRecords = records.sort(
      (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
    )

    const lastRecord = sortedRecords[0]
    // 日付ベースで経過日数を計算（時刻を無視）
    const lastStudyDate = new Date(lastRecord.studiedAt)
    lastStudyDate.setHours(0, 0, 0, 0)
    const daysSince = Math.floor(
      (today.getTime() - lastStudyDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    const averageScore = calculateAverageScore(records)
    const priorityScore = calculatePriorityScore(averageScore, daysSince)

    const problem = activeProblems.find((p) => p.id === problemId)
    const workbook = allWorkbooks.find((w) => w.id === problem?.workbookId)

    if (problem && workbook) {
      reviewSchedules.push({
        problemId,
        problemNumber: problem.problemNumber,
        workbookTitle: workbook.title,
        nextReviewDate: today,
        reviewCount: records.length,
        averageScore,
        lastStudiedAt: lastRecord.studiedAt,
        priorityScore,
      })
    }
  }

  // 今日学習済み（priorityScore = 0）を除外し、優先度スコアの降順でソート
  return reviewSchedules
    .filter((schedule) => schedule.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
}

// 学習統計の計算
export async function calculateStudyStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - 6)

  const allRecords = await db.studyRecords.toArray()

  const todayRecords = allRecords.filter((r) => r.studiedAt >= today)
  const weekRecords = allRecords.filter((r) => r.studiedAt >= weekStart)

  const totalStudyTime = allRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const todayStudyTime = todayRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const weekStudyTime = weekRecords.reduce((sum, r) => sum + r.studyTime, 0)

  const correctCount = allRecords.filter((r) => r.result === 'correct').length
  const correctRate = allRecords.length > 0 ? (correctCount / allRecords.length) * 100 : 0

  // 週間データ
  const weeklyData = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    const dayRecords = allRecords.filter((r) => {
      const recordDate = new Date(r.studiedAt)
      recordDate.setHours(0, 0, 0, 0)
      return recordDate.getTime() === date.getTime()
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
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - 6)

  let allRecords = await db.studyRecords.toArray()

  // 問題集でフィルタリング
  if (workbookId) {
    allRecords = allRecords.filter((r) => r.workbookId === workbookId)
  }

  const todayRecords = allRecords.filter((r) => r.studiedAt >= today)
  const weekRecords = allRecords.filter((r) => r.studiedAt >= weekStart)

  const totalStudyTime = allRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const todayStudyTime = todayRecords.reduce((sum, r) => sum + r.studyTime, 0)
  const weekStudyTime = weekRecords.reduce((sum, r) => sum + r.studyTime, 0)

  const correctCount = allRecords.filter((r) => r.result === 'correct').length
  const correctRate = allRecords.length > 0 ? (correctCount / allRecords.length) * 100 : 0

  // 週間データ（学習時間、問題数、正答率）
  const weeklyData = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    const dayRecords = allRecords.filter((r) => {
      const recordDate = new Date(r.studiedAt)
      recordDate.setHours(0, 0, 0, 0)
      return recordDate.getTime() === date.getTime()
    })

    const dayCorrectCount = dayRecords.filter((r) => r.result === 'correct').length
    const dayAccuracy = dayRecords.length > 0 ? Math.round((dayCorrectCount / dayRecords.length) * 100) : null

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

// 問題セットの直近回答の正解率を計算（重み付け平均）
export async function calculateRecentAccuracyForProblems(problems: Problem[]): Promise<number | null> {
  if (problems.length === 0) return null

  const recentScores: number[] = []

  // 各問題の最新3回の学習記録を取得して重み付け平均でスコア化
  for (const problem of problems) {
    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .reverse()
      .sortBy('studiedAt')

    if (records.length > 0) {
      // 最新3回の記録を取得
      const recent3 = records.slice(0, 3)

      // スコア化
      const scores = recent3.map(record =>
        record.result === 'correct' ? 100
        : record.result === 'partial' ? 50
        : 0
      )

      // 重み付け平均を計算
      // 最新: 50%, 1つ前: 30%, 2つ前: 20%
      let weightedScore: number
      if (scores.length === 1) {
        weightedScore = scores[0]
      } else if (scores.length === 2) {
        // 2回の場合: 最新62.5%, 1つ前37.5%（比率を維持）
        weightedScore = scores[0] * 0.625 + scores[1] * 0.375
      } else {
        // 3回以上: 最新50%, 1つ前30%, 2つ前20%
        weightedScore = scores[0] * 0.5 + scores[1] * 0.3 + scores[2] * 0.2
      }

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
}

// セクション別の正解率を計算
export async function calculateSectionStats(): Promise<SectionStats[]> {
  const allProblems = await db.problems.toArray()

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p))

  // 問題をセクション（カテゴリ×タイトル）でグルーピング
  const sectionMap = new Map<string, Problem[]>()

  activeProblems.forEach((problem) => {
    // categoryフィールドが設定されている場合はそれを優先
    let category = problem.category || '未分類'
    let title = '問題'

    if (problem.category) {
      // カテゴリが設定されている場合、問題番号からタイトルを抽出
      const parts = problem.problemNumber.split('-')
      title = parts.length > 1 ? parts.slice(0, -1).join('-') : '問題'
    } else {
      // カテゴリがない場合は問題番号から抽出（後方互換性）
      const match = problem.problemNumber.match(/^(\[.+?\])(.+?)-\d+$/)
      if (match) {
        category = match[1]
        title = match[2]
      } else {
        const parts = problem.problemNumber.split('-')
        if (parts[0].startsWith('[') && parts[0].endsWith(']')) {
          category = parts[0]
          title = parts.slice(1, -1).join('-') || '問題'
        } else {
          title = parts.length > 1 ? parts[0] : '問題'
        }
      }
    }

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

    // 学習済みの問題数をカウント
    let studiedCount = 0
    for (const problem of problems) {
      const records = await db.studyRecords
        .where('problemId')
        .equals(problem.id)
        .count()
      if (records > 0) studiedCount++
    }

    sectionStats.push({
      sectionKey,
      category,
      title,
      problems,
      accuracy,
      studiedCount,
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

// 旧関数（後方互換性のため残す）
export async function getWeakSectionProblem(): Promise<Problem | null> {
  return getNextWeakProblem()
}

import { db } from './db'
import type { StudyRecord, ReviewSchedule } from '@/types'

// 正答率の計算
export function calculateAverageScore(records: StudyRecord[]): number {
  if (records.length === 0) return 0

  const totalScore = records.reduce((sum, record) => {
    const score = record.result === 'correct' ? 100 : record.result === 'partial' ? 50 : 0
    return sum + score
  }, 0)

  return totalScore / records.length
}

// 経過日数係数の計算
export function getDaysCoefficient(daysSinceLastStudy: number): number {
  if (daysSinceLastStudy <= 1) return 0.5
  if (daysSinceLastStudy <= 3) return 1.0
  if (daysSinceLastStudy <= 7) return 1.5
  if (daysSinceLastStudy <= 14) return 2.0
  return 2.5
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

  for (const [problemId, records] of problemRecordsMap) {
    const sortedRecords = records.sort(
      (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
    )

    const lastRecord = sortedRecords[0]
    const daysSince = Math.floor(
      (today.getTime() - lastRecord.studiedAt.getTime()) / (1000 * 60 * 60 * 24)
    )

    const averageScore = calculateAverageScore(records)
    const priorityScore = calculatePriorityScore(averageScore, daysSince)

    const problem = allProblems.find((p) => p.id === problemId)
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

  // 優先度スコアの降順でソート
  return reviewSchedules.sort((a, b) => b.priorityScore - a.priorityScore)
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

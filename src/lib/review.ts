import { db } from './db'
import { getExcludedCategories, getExcludedSections } from './storage'
import { getTodayStartTime, getStudyDate, getStudyDaysDiff } from './dateUtils'
import { calculateWeightedAverage } from './weakModeSession'
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
  const today = getStudyDate(new Date())  // 3時基準の今日の日付

  for (const [problemId, records] of problemRecordsMap) {
    const sortedRecords = records.sort(
      (a, b) => b.studiedAt.getTime() - a.studiedAt.getTime()
    )

    const lastRecord = sortedRecords[0]
    // 3時基準で経過日数を計算
    const daysSince = getStudyDaysDiff(lastRecord.studiedAt, new Date())

    const averageScore = calculateAverageScore(records)
    const priorityScore = calculatePriorityScore(averageScore, daysSince)

    const problem = activeProblems.find((p) => p.id === problemId)
    const workbook = allWorkbooks.find((w) => w.id === problem?.workbookId)

    if (problem && workbook) {
      reviewSchedules.push({
        problemId,
        problemNumber: problem.problemNumber,
        sectionTitle: problem.sectionTitle,
        category: problem.category,
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
function removeOutliers(values: number[]): number[] {
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
function calculateWeightedMean(values: number[]): number {
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

  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p))

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

import { db } from './db'
import { getTodayReviewList } from './review'
import type { Problem } from '@/types'

// 学習セットの生成
export async function generateStudySet(targetMinutes: number): Promise<Problem[]> {
  const targetSeconds = targetMinutes * 60

  // 復習が必要な問題を取得
  const reviewList = await getTodayReviewList()

  // 問題IDから実際の問題を取得
  const reviewProblems: Problem[] = []
  for (const review of reviewList) {
    const problem = await db.problems.get(review.problemId)
    if (problem) {
      reviewProblems.push(problem)
    }
  }

  // 過去の学習記録から平均解答時間を計算
  const problemsWithEstimatedTime: Array<{
    problem: Problem
    estimatedTime: number
    isReview: boolean
    priorityScore: number
  }> = []

  for (const problem of reviewProblems) {
    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .toArray()

    const avgTime =
      records.length > 0
        ? records.reduce((sum, r) => sum + r.studyTime, 0) / records.length
        : 180 // デフォルト3分

    const review = reviewList.find((r) => r.problemId === problem.id)
    problemsWithEstimatedTime.push({
      problem,
      estimatedTime: avgTime,
      isReview: true,
      priorityScore: review?.priorityScore || 0,
    })
  }

  // 復習問題で時間が足りない場合は新規問題を追加
  const allProblems = await db.problems.toArray()
  const newProblems = allProblems.filter(
    (p) => !reviewProblems.some((rp) => rp.id === p.id)
  )

  for (const problem of newProblems) {
    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .toArray()

    if (records.length === 0) {
      // 未学習の問題
      problemsWithEstimatedTime.push({
        problem,
        estimatedTime: 180, // デフォルト3分
        isReview: false,
        priorityScore: -1, // 新規問題は優先度低め
      })
    }
  }

  // 優先度順にソート（復習問題優先、その中では優先度スコア順）
  problemsWithEstimatedTime.sort((a, b) => {
    if (a.isReview && !b.isReview) return -1
    if (!a.isReview && b.isReview) return 1
    return b.priorityScore - a.priorityScore
  })

  // 時間内に収まる問題セットを作成
  const selectedProblems: Problem[] = []
  let totalTime = 0

  for (const item of problemsWithEstimatedTime) {
    if (totalTime + item.estimatedTime <= targetSeconds) {
      selectedProblems.push(item.problem)
      totalTime += item.estimatedTime
    }
    if (totalTime >= targetSeconds * 0.9) {
      // 90%以上埋まったら終了
      break
    }
  }

  // ランダムにシャッフル
  return shuffleArray(selectedProblems)
}

// 配列をシャッフル
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

import { db, isParentProblem } from './db'
import { getTodayReviewList, isProblemExcluded, getExclusions } from './review'
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

  // 除外設定を取得
  const exclusions = await getExclusions()

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p, exclusions))

  // 親問題（箱）を除外
  const learnableProblems: Problem[] = []
  for (const problem of activeProblems) {
    const isParent = await isParentProblem(problem.id)
    if (!isParent) {
      learnableProblems.push(problem)
    }
  }

  const newProblems = learnableProblems.filter(
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

// 初回学習用の学習セット生成（順番に問題を解く）
export async function generateFirstTimeStudySet(targetMinutes: number): Promise<Problem[]> {
  const targetSeconds = targetMinutes * 60

  // 未学習の問題をすべて取得
  const allProblems = await db.problems.toArray()

  // 除外設定を取得
  const exclusions = await getExclusions()

  // 削除された問題と除外設定された問題を除外
  const activeProblems = allProblems
    .filter(p => !p.deletedAt)
    .filter(p => !isProblemExcluded(p, exclusions))

  // 親問題（箱）を除外
  const learnableProblems: Problem[] = []
  for (const problem of activeProblems) {
    const isParent = await isParentProblem(problem.id)
    if (!isParent) {
      learnableProblems.push(problem)
    }
  }

  const unstudiedProblems: Problem[] = []

  for (const problem of learnableProblems) {
    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .toArray()

    if (records.length === 0) {
      unstudiedProblems.push(problem)
    }
  }

  // ページ番号と問題番号で順番にソート
  unstudiedProblems.sort((a, b) => {
    // ページ番号でソート（優先）
    if (a.page !== undefined && b.page !== undefined) {
      if (a.page !== b.page) {
        return a.page - b.page
      }
    }
    // ページ番号がある方を優先
    if (a.page !== undefined && b.page === undefined) return -1
    if (a.page === undefined && b.page !== undefined) return 1

    // 問題番号を階層的に比較（例: 1-1, 1-2, 2-1, 2-2の順）
    const partsA = a.problemNumber.split('-')
    const partsB = b.problemNumber.split('-')

    // 各階層を順番に数値として比較
    const maxLength = Math.max(partsA.length, partsB.length)
    for (let i = 0; i < maxLength; i++) {
      const partA = partsA[i] || ''
      const partB = partsB[i] || ''

      // 数値として解釈できる場合は数値比較
      const numA = parseInt(partA)
      const numB = parseInt(partB)

      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) {
          return numA - numB
        }
      } else {
        // 数値でない場合は文字列比較
        const cmp = partA.localeCompare(partB)
        if (cmp !== 0) {
          return cmp
        }
      }
    }

    // 完全に同じ
    return 0
  })

  // 時間内に収まる問題数を計算（1問3分と仮定）
  const estimatedTimePerProblem = 180 // 3分
  const maxProblems = Math.max(1, Math.floor(targetSeconds / estimatedTimePerProblem))

  // 先頭から指定数の問題を返す（シャッフルせず順番に）
  return unstudiedProblems.slice(0, maxProblems)
}

// 未学習問題があるかチェック
export async function hasUnstudiedProblems(): Promise<boolean> {
  const allProblems = await db.problems.toArray()

  // 削除された問題を除外
  const activeProblems = allProblems.filter(p => !p.deletedAt)

  for (const problem of activeProblems) {
    // 親問題（箱）はスキップ
    const isParent = await isParentProblem(problem.id)
    if (isParent) {
      continue
    }

    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .toArray()

    if (records.length === 0) {
      return true
    }
  }

  return false
}

// 未学習問題数を取得
export async function getUnstudiedProblemsCount(): Promise<number> {
  const allProblems = await db.problems.toArray()

  // 削除された問題を除外
  const activeProblems = allProblems.filter(p => !p.deletedAt)

  let count = 0

  for (const problem of activeProblems) {
    // 親問題（箱）はスキップ
    const isParent = await isParentProblem(problem.id)
    if (isParent) {
      continue
    }

    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .toArray()

    if (records.length === 0) {
      count++
    }
  }

  return count
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

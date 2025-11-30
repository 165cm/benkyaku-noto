import { useState, useEffect } from 'react'
import { getWorkbook, getProblems, getSubProblems, getCategoriesForWorkbook, db } from '@/lib/db'
import type { Workbook, Problem } from '@/types'

/**
 * 問題集のデータ管理フック
 *
 * - 問題集の基本情報
 * - 問題リスト
 * - 小問のマッピング
 * - 利用可能なカテゴリ一覧
 */
export function useWorkbookData(workbookId: string | undefined) {
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [subProblemsMap, setSubProblemsMap] = useState<Map<string, Problem[]>>(new Map())
  const [availableCategories, setAvailableCategories] = useState<string[]>([])

  const loadData = async () => {
    if (!workbookId) return

    const workbookData = await getWorkbook(workbookId)
    let problemsData = await getProblems(workbookId)

    // ページ数でソート（ページ数がある場合）、なければ問題番号でソート
    problemsData = problemsData.sort((a, b) => {
      if (a.page && b.page) {
        return a.page - b.page
      }
      return a.problemNumber.localeCompare(b.problemNumber)
    })

    setWorkbook(workbookData || null)
    setProblems(problemsData)

    // 各親問題の小問を読み込む
    const subProblemsMapTemp = new Map<string, Problem[]>()
    for (const problem of problemsData) {
      const subProblems = await getSubProblems(problem.id)
      if (subProblems.length > 0) {
        subProblemsMapTemp.set(problem.id, subProblems)
      }
    }
    setSubProblemsMap(subProblemsMapTemp)

    // 既存のカテゴリを読み込む
    const categories = await getCategoriesForWorkbook(workbookId)
    setAvailableCategories(categories)

    // 問題数を更新
    if (workbookData && workbookData.totalProblems !== problemsData.length) {
      await db.workbooks.update(workbookId, {
        totalProblems: problemsData.length,
        updatedAt: new Date(),
      })
    }
  }

  useEffect(() => {
    if (workbookId) {
      loadData()
    }
  }, [workbookId])

  return {
    workbook,
    setWorkbook,
    problems,
    setProblems,
    subProblemsMap,
    setSubProblemsMap,
    availableCategories,
    setAvailableCategories,
    loadData,
  }
}

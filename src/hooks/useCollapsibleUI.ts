import { useState, useEffect } from 'react'
import type { Problem } from '@/types'

/**
 * 折りたたみUIの状態管理フック
 *
 * - カテゴリの展開/折りたたみ
 * - タイトルの展開/折りたたみ
 * - 親問題の展開/折りたたみ
 */
export function useCollapsibleUI(problems: Problem[]) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set())
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  // 問題が読み込まれたら、カテゴリをデフォルトで展開状態にする
  useEffect(() => {
    const categorySet = new Set<string>()
    problems.forEach((problem) => {
      if (!problem.parentProblemId) {
        const category = problem.category || '未分類'
        categorySet.add(category)
      }
    })
    setExpandedCategories(categorySet)
  }, [problems])

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleTitle = (titleKey: string) => {
    const newExpanded = new Set(expandedTitles)
    if (newExpanded.has(titleKey)) {
      newExpanded.delete(titleKey)
    } else {
      newExpanded.add(titleKey)
    }
    setExpandedTitles(newExpanded)
  }

  const toggleParent = (problemId: string) => {
    const newExpanded = new Set(expandedParents)
    if (newExpanded.has(problemId)) {
      newExpanded.delete(problemId)
    } else {
      newExpanded.add(problemId)
    }
    setExpandedParents(newExpanded)
  }

  return {
    expandedCategories,
    expandedTitles,
    expandedParents,
    toggleCategory,
    toggleTitle,
    toggleParent,
  }
}

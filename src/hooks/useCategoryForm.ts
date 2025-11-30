import { useState } from 'react'
import { db } from '@/lib/db'
import type { Problem } from '@/types'

/**
 * カテゴリフォームの状態管理フック
 *
 * - カテゴリ編集の管理
 * - カテゴリ内全問題への一括更新
 */
export function useCategoryForm() {
  const [editingCategory, setEditingCategory] = useState<{
    oldCategory: string
    problems: Problem[]
  } | null>(null)
  const [categoryFormData, setCategoryFormData] = useState({
    categoryName: '',
  })

  const handleEditCategory = (category: string, categoryProblems: Problem[][]) => {
    // カテゴリ内のすべての問題をフラット化
    const allProblems = categoryProblems.flat()

    setEditingCategory({
      oldCategory: category,
      problems: allProblems,
    })
    setCategoryFormData({ categoryName: category })
  }

  const handleCategorySubmit = async (e: React.FormEvent, onSuccess: () => void) => {
    e.preventDefault()
    if (!editingCategory) return

    const newCategory = categoryFormData.categoryName.trim()
    if (!newCategory) return

    // カテゴリ内のすべての問題のcategoryフィールドを更新
    for (const problem of editingCategory.problems) {
      await db.problems.update(problem.id, {
        category: newCategory,
      })
    }

    resetForm()
    onSuccess()
  }

  const resetForm = () => {
    setEditingCategory(null)
    setCategoryFormData({ categoryName: '' })
  }

  return {
    editingCategory,
    categoryFormData,
    setCategoryFormData,
    handleEditCategory,
    handleCategorySubmit,
    resetForm,
  }
}

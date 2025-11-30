import { useState } from 'react'
import { db } from '@/lib/db'
import type { Problem } from '@/types'

/**
 * グループ（目次タイトル）フォームの状態管理フック
 *
 * - グループ編集の管理
 * - グループ内全問題への一括更新
 */
export function useGroupForm() {
  const [editingGroup, setEditingGroup] = useState<{
    groupKey: string
    problems: Problem[]
  } | null>(null)
  const [groupFormData, setGroupFormData] = useState({
    groupName: '',
    category: '',
    page: '',
  })

  const handleEditGroup = (groupKey: string, groupProblems: Problem[]) => {
    setEditingGroup({ groupKey, problems: groupProblems })

    // グループ内の最初の問題のページ数とカテゴリを取得
    const firstProblemWithPage = groupProblems.find((p) => p.page !== undefined)
    const firstProblemWithCategory = groupProblems.find((p) => p.category !== undefined)

    setGroupFormData({
      groupName: groupKey,
      category: firstProblemWithCategory?.category || '',
      page: firstProblemWithPage?.page?.toString() || '',
    })
  }

  const handleGroupSubmit = async (e: React.FormEvent, onSuccess: () => void) => {
    e.preventDefault()
    if (!editingGroup) return

    const newPage = groupFormData.page ? parseInt(groupFormData.page) : undefined
    const newCategory = groupFormData.category || undefined

    // グループ内のすべての問題のページ数とカテゴリを更新
    for (const problem of editingGroup.problems) {
      await db.problems.update(problem.id, {
        category: newCategory,
        page: newPage,
      })
    }

    // グループ名が変更された場合、問題番号のプレフィックスを更新
    if (groupFormData.groupName !== editingGroup.groupKey) {
      for (const problem of editingGroup.problems) {
        const parts = problem.problemNumber.split('-')
        if (parts.length > 1) {
          parts[0] = groupFormData.groupName
          await db.problems.update(problem.id, {
            problemNumber: parts.join('-'),
          })
        }
      }
    }

    resetForm()
    onSuccess()
  }

  const resetForm = () => {
    setEditingGroup(null)
    setGroupFormData({ groupName: '', category: '', page: '' })
  }

  return {
    editingGroup,
    groupFormData,
    setGroupFormData,
    handleEditGroup,
    handleGroupSubmit,
    resetForm,
  }
}

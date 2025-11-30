import { useState } from 'react'
import { addProblem, deleteProblem, db, getStudyRecords } from '@/lib/db'
import { calculateRecentAccuracyForProblems } from '@/lib/review'
import type { Problem, StudyRecord } from '@/types'

/**
 * 問題フォームの状態管理フック
 *
 * - 問題の追加・編集・削除
 * - フォームデータの管理
 * - 学習記録と正答率の表示
 */
export function useProblemsForm(workbookId: string | undefined, availableCategories: string[]) {
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)
  const [formData, setFormData] = useState({
    problemNumber: '',
    category: '',
    page: '',
    memo: '',
  })
  const [studyRecords, setStudyRecords] = useState<StudyRecord[]>([])
  const [problemAccuracy, setProblemAccuracy] = useState<number | null>(null)
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false)

  const handleSubmit = async (e: React.FormEvent, onSuccess: () => void) => {
    e.preventDefault()
    if (!workbookId) return

    if (editingProblem) {
      // 編集モード
      await db.problems.update(editingProblem.id, {
        problemNumber: formData.problemNumber,
        category: formData.category || undefined,
        page: formData.page ? parseInt(formData.page) : undefined,
        memo: formData.memo || undefined,
      })
    } else {
      // 新規追加モード
      await addProblem({
        workbookId,
        problemNumber: formData.problemNumber,
        category: formData.category || undefined,
        page: formData.page ? parseInt(formData.page) : undefined,
        memo: formData.memo || undefined,
      })
    }

    resetForm()
    onSuccess()
  }

  const handleEdit = async (problem: Problem) => {
    setEditingProblem(problem)
    setFormData({
      problemNumber: problem.problemNumber,
      category: problem.category || '',
      page: problem.page?.toString() || '',
      memo: problem.memo || '',
    })

    // 学習記録と正答率を読み込む
    const records = await getStudyRecords(problem.id)
    const accuracy = await calculateRecentAccuracyForProblems([problem])
    setStudyRecords(records)
    setProblemAccuracy(accuracy)

    // カテゴリが既存のものでない場合、カスタム入力を表示
    setShowCustomCategoryInput(
      problem.category !== undefined &&
        problem.category !== '' &&
        !availableCategories.includes(problem.category)
    )
  }

  const handleDelete = async (problemId: string, onSuccess: () => void) => {
    if (confirm('この問題を削除しますか？学習記録もすべて削除されます。')) {
      await deleteProblem(problemId)
      onSuccess()
    }
  }

  const resetForm = () => {
    setFormData({ problemNumber: '', category: '', page: '', memo: '' })
    setEditingProblem(null)
    setStudyRecords([])
    setProblemAccuracy(null)
    setShowCustomCategoryInput(false)
  }

  return {
    editingProblem,
    formData,
    setFormData,
    studyRecords,
    problemAccuracy,
    showCustomCategoryInput,
    setShowCustomCategoryInput,
    handleSubmit,
    handleEdit,
    handleDelete,
    resetForm,
  }
}

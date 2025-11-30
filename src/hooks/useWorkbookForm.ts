import { useState } from 'react'
import { db } from '@/lib/db'
import type { Workbook } from '@/types'

/**
 * 問題集フォームの状態管理フック
 *
 * - 問題集のタイトル・科目の編集
 */
export function useWorkbookForm(workbookId: string | undefined) {
  const [isEditingWorkbook, setIsEditingWorkbook] = useState(false)
  const [workbookFormData, setWorkbookFormData] = useState({
    title: '',
    subject: '',
  })

  const handleEditWorkbook = (workbook: Workbook) => {
    setWorkbookFormData({
      title: workbook.title,
      subject: workbook.subject,
    })
    setIsEditingWorkbook(true)
  }

  const handleSaveWorkbook = async (onSuccess: () => void) => {
    if (!workbookId || !workbookFormData.title.trim()) return

    try {
      await db.workbooks.update(workbookId, {
        title: workbookFormData.title.trim(),
        subject: workbookFormData.subject.trim(),
        updatedAt: new Date(),
      })
      setIsEditingWorkbook(false)
      onSuccess()
    } catch (error) {
      console.error('問題集の更新に失敗しました:', error)
      alert('問題集の更新に失敗しました')
    }
  }

  const handleCancelEditWorkbook = () => {
    setIsEditingWorkbook(false)
    setWorkbookFormData({ title: '', subject: '' })
  }

  return {
    isEditingWorkbook,
    workbookFormData,
    setWorkbookFormData,
    handleEditWorkbook,
    handleSaveWorkbook,
    handleCancelEditWorkbook,
  }
}

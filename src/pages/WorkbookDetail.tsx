import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Play, Trash2, Edit2, ChevronDown, ChevronRight, Download, Upload, RotateCcw, Undo2, Star, Tag } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import {
  db,
  makeSubProblem,
  makeIndependentProblem,
  isParentProblem,
  deleteStudyRecordsForWorkbook,
  addProblem,
} from '@/lib/db'
import { exportProblemsToCSV, downloadCSV, parseCSV } from '@/lib/csvExport'
import { validateCSVData, ValidationError } from '@/lib/validation'
import { calculateRecentAccuracyForProblems } from '@/lib/review'
import { getExcludedSections } from '@/lib/storage'
// import { deletePDF } from '@/lib/storage' // PDF機能一時無効化
import { createStudySession } from '@/lib/studySession'
import type { Problem } from '@/types'
import { useWorkbookData } from '@/hooks/useWorkbookData'
import { useProblemsForm } from '@/hooks/useProblemsForm'
import { useGroupForm } from '@/hooks/useGroupForm'
import { useCategoryForm } from '@/hooks/useCategoryForm'
import { useWorkbookForm } from '@/hooks/useWorkbookForm'
import { useCollapsibleUI } from '@/hooks/useCollapsibleUI'

export default function WorkbookDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Custom hooks for data and form management
  const {
    workbook,
    problems,
    subProblemsMap,
    availableCategories,
    loadData,
  } = useWorkbookData(id)

  const {
    editingProblem,
    formData,
    setFormData,
    studyRecords,
    problemAccuracy,
    showCustomCategoryInput,
    setShowCustomCategoryInput,
    handleSubmit: handleProblemSubmit,
    handleEdit,
    handleDelete: handleProblemDelete,
    resetForm: resetProblemForm,
  } = useProblemsForm(id, availableCategories)

  const {
    editingGroup,
    groupFormData,
    setGroupFormData,
    handleEditGroup,
    handleGroupSubmit: handleGroupSubmitOriginal,
    resetForm: resetGroupForm,
  } = useGroupForm()

  const {
    editingCategory,
    categoryFormData,
    setCategoryFormData,
    handleEditCategory,
    handleCategorySubmit: handleCategorySubmitOriginal,
    resetForm: resetCategoryForm,
  } = useCategoryForm()

  const {
    isEditingWorkbook,
    workbookFormData,
    setWorkbookFormData,
    handleEditWorkbook: handleEditWorkbookOriginal,
    handleSaveWorkbook: handleSaveWorkbookOriginal,
    handleCancelEditWorkbook,
  } = useWorkbookForm(id)

  const {
    expandedCategories,
    expandedTitles,
    expandedParents,
    toggleCategory,
    toggleTitle,
    toggleParent,
  } = useCollapsibleUI(problems)

  // Local state for modals and UI
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)

  // フィルタリング用state
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)
  const [showTaggedOnly, setShowTaggedOnly] = useState(false)
  const [sectionAccuracyRates, setSectionAccuracyRates] = useState<Map<string, number | null>>(new Map())
  const [categoryAccuracyRates, setCategoryAccuracyRates] = useState<Map<string, number | null>>(new Map())
  const [excludedSections, setExcludedSections] = useState<string[]>([])

  // 除外設定を読み込む
  useEffect(() => {
    setExcludedSections(getExcludedSections())
  }, [])
  const [draggedProblem, setDraggedProblem] = useState<Problem | null>(null)
  const [lastDragOperation, setLastDragOperation] = useState<{
    problemId: string
    originalParentId: string | undefined
    originalProblemNumber: string
    originalSectionTitle: string | undefined
    originalSortOrder: number
  } | null>(null)
  const [skipConfirmUntil, setSkipConfirmUntil] = useState<number>(0)
  const [importProgress, setImportProgress] = useState<{
    current: number
    total: number
    phase: 'importing' | 'relations'
  } | null>(null)

  // 各セクションおよびカテゴリの直近回答の正解率を計算
  useEffect(() => {
    const calculateAccuracyRates = async () => {
      const hierarchy = groupProblemsByHierarchy()
      const sectionAccuracyMap = new Map<string, number | null>()
      const categoryAccuracyMap = new Map<string, number | null>()

      // セクション別の正解率とカテゴリ別の問題リストを計算
      const categoryProblemsMap = new Map<string, Problem[]>()

      for (const [category, titles] of Object.entries(hierarchy)) {
        const categoryLearnableProblems: Problem[] = []

        for (const [title, titleProblems] of Object.entries(titles)) {
          const sectionKey = `${category}-${title}`

          // 学習可能な問題を抽出（親問題を除外し、小問を含める）
          const learnableProblems: Problem[] = []
          for (const problem of titleProblems) {
            const hasSubProblems = await isParentProblem(problem.id)
            if (!hasSubProblems) {
              // 親問題でない場合、そのまま追加
              learnableProblems.push(problem)
            }
          }

          // 親問題の小問を追加
          for (const problem of titleProblems) {
            const subProblems = subProblemsMap.get(problem.id) || []
            learnableProblems.push(...subProblems)
          }

          // セクション正解率を計算
          const accuracy = await calculateRecentAccuracyForProblems(learnableProblems)
          sectionAccuracyMap.set(sectionKey, accuracy)

          // カテゴリ全体の問題リストに追加
          categoryLearnableProblems.push(...learnableProblems)
        }

        // カテゴリ別の問題リストを保存
        categoryProblemsMap.set(category, categoryLearnableProblems)
      }

      // カテゴリ別の正解率を計算
      for (const [category, categoryProblems] of categoryProblemsMap.entries()) {
        const categoryAccuracy = await calculateRecentAccuracyForProblems(categoryProblems)
        categoryAccuracyMap.set(category, categoryAccuracy)
      }

      setSectionAccuracyRates(sectionAccuracyMap)
      setCategoryAccuracyRates(categoryAccuracyMap)
    }

    if (problems.length > 0) {
      calculateAccuracyRates()
    } else {
      setSectionAccuracyRates(new Map())
      setCategoryAccuracyRates(new Map())
    }
  }, [problems, subProblemsMap])

  // Wrapper handlers that close modals and reload data
  const handleSubmit = useCallback((e: React.FormEvent) => {
    handleProblemSubmit(e, () => {
      setIsModalOpen(false)
      loadData()
    })
  }, [handleProblemSubmit, loadData])

  const handleDelete = useCallback((problemId: string) => {
    handleProblemDelete(problemId, loadData)
  }, [handleProblemDelete, loadData])

  const handleEditProblem = useCallback(async (problem: Problem) => {
    await handleEdit(problem)
    setIsModalOpen(true)
  }, [handleEdit])

  const handleStartGroupStudy = async (groupProblems: Problem[]) => {
    if (groupProblems.length === 0) return

    // 親問題（箱）を除外して学習可能な問題のみを抽出
    const learnableProblems: Problem[] = []
    for (const problem of groupProblems) {
      const hasSubProblems = await isParentProblem(problem.id)
      if (!hasSubProblems) {
        learnableProblems.push(problem)
      }
    }

    // 学習可能な小問も追加
    for (const problem of groupProblems) {
      const subProblems = subProblemsMap.get(problem.id) || []
      learnableProblems.push(...subProblems)
    }

    if (learnableProblems.length === 0) {
      alert('学習可能な問題がありません')
      return
    }

    // 問題番号を階層的にソート（若い番号順）
    learnableProblems.sort((a, b) => {
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

    // セクション学習用のセッションを作成（時間制限なし=999分）
    createStudySession(999, learnableProblems)

    // 最初の問題に遷移
    const firstProblem = learnableProblems[0]
    navigate(`/study/${firstProblem.id}`)
  }

  const handleEditGroupWrapper = (groupKey: string, groupProblems: Problem[]) => {
    handleEditGroup(groupKey, groupProblems)
    setIsGroupModalOpen(true)
  }

  const handleGroupSubmit = (e: React.FormEvent) => {
    handleGroupSubmitOriginal(e, () => {
      setIsGroupModalOpen(false)
      loadData()
    })
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    resetProblemForm()
  }

  const handleCloseGroupModal = () => {
    setIsGroupModalOpen(false)
    resetGroupForm()
  }

  // 問題からカテゴリとセクションタイトルを抽出
  const parseGroupInfo = (problem: Problem) => {
    // sectionTitleフィールドがある場合はそれを使用（新データ構造）
    if (problem.sectionTitle) {
      return {
        category: problem.category || '未分類',
        title: problem.sectionTitle,
      }
    }

    // sectionTitleがない場合は後方互換性のため問題番号から抽出
    // categoryフィールドが設定されている場合
    if (problem.category) {
      const parts = problem.problemNumber.split('-')
      return {
        category: problem.category,
        title: parts.length > 1 ? parts.slice(0, -1).join('-') : '問題',
      }
    }

    // 旧データ形式：問題番号から抽出
    const problemNumber = problem.problemNumber

    // "[言語]熟語の成り立ち-109" → { category: "[言語]", title: "熟語の成り立ち" }
    const match = problemNumber.match(/^(\[.+?\])(.+?)-\d+$/)
    if (match) {
      return {
        category: match[1],
        title: match[2],
      }
    }

    // デフォルト
    return {
      category: '未分類',
      title: '問題',
    }
  }

  // 問題を3階層構造にグループ化（親カテゴリ → 目次タイトル → 問題）
  const groupProblemsByHierarchy = () => {
    const hierarchy: {
      [category: string]: {
        [title: string]: Problem[]
      }
    } = {}

    problems.forEach((problem) => {
      // 小問（parentProblemIdがある問題）はスキップ
      // 小問は親問題の下に表示されるため、セクションレベルでグループ化しない
      if (problem.parentProblemId) {
        return
      }

      const { category, title } = parseGroupInfo(problem)

      if (!hierarchy[category]) {
        hierarchy[category] = {}
      }

      if (!hierarchy[category][title]) {
        hierarchy[category][title] = []
      }

      hierarchy[category][title].push(problem)
    })

    // 各グループ内の問題をページ数と数値でソート
    Object.keys(hierarchy).forEach((category) => {
      Object.keys(hierarchy[category]).forEach((title) => {
        hierarchy[category][title].sort((a, b) => {
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
      })
    })

    return hierarchy
  }

  const problemHierarchy = useMemo(() => groupProblemsByHierarchy(), [problems])

  // フィルタリングされた問題階層
  const filteredProblemHierarchy = useMemo(() => {
    if (!showBookmarkedOnly && !showTaggedOnly) {
      return problemHierarchy
    }

    const filtered: typeof problemHierarchy = {}

    for (const [category, titles] of Object.entries(problemHierarchy)) {
      const filteredTitles: typeof titles = {}

      for (const [title, titleProblems] of Object.entries(titles)) {
        const filteredProblems = titleProblems.filter(problem => {
          if (showBookmarkedOnly && !problem.isBookmarked) {
            return false
          }
          if (showTaggedOnly && (!problem.tags || problem.tags.length === 0)) {
            return false
          }
          return true
        })

        if (filteredProblems.length > 0) {
          filteredTitles[title] = filteredProblems
        }
      }

      if (Object.keys(filteredTitles).length > 0) {
        filtered[category] = filteredTitles
      }
    }

    return filtered
  }, [problemHierarchy, showBookmarkedOnly, showTaggedOnly])

  // 実際の学習可能な問題数を計算（親問題を除き、小問を含む）
  const getActualProblemCount = useCallback((problems: Problem[]) => {
    let count = 0
    for (const problem of problems) {
      const subProblems = subProblemsMap.get(problem.id) || []
      if (subProblems.length > 0) {
        // 親問題（箱）の場合は、小問の数だけカウント
        count += subProblems.length
      } else {
        // 通常の問題の場合は1つカウント
        count += 1
      }
    }
    return count
  }, [subProblemsMap])


  const handleEditCategoryWrapper = useCallback((category: string, categoryProblems: Problem[][]) => {
    handleEditCategory(category, categoryProblems)
    setIsCategoryModalOpen(true)
  }, [handleEditCategory])

  const handleCategorySubmit = useCallback((e: React.FormEvent) => {
    handleCategorySubmitOriginal(e, () => {
      setIsCategoryModalOpen(false)
      loadData()
    })
  }, [handleCategorySubmitOriginal, loadData])

  const handleCloseCategoryModal = useCallback(() => {
    setIsCategoryModalOpen(false)
    resetCategoryForm()
  }, [resetCategoryForm])


  // ドラッグアンドドロップのハンドラー
  const handleDragStart = useCallback((problem: Problem) => {
    setDraggedProblem(problem)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault() // ドロップを有効にする
  }, [])

  const handleDrop = useCallback(async (targetProblem: Problem) => {
    if (!draggedProblem || draggedProblem.id === targetProblem.id) {
      setDraggedProblem(null)
      return
    }

    // 確認をスキップするかどうか
    const now = Date.now()
    const shouldSkipConfirm = skipConfirmUntil > now

    if (!shouldSkipConfirm) {
      // 確認ポップアップ
      const confirmMessage = `「${draggedProblem.problemNumber}」を「${targetProblem.problemNumber}」の小問にしますか？\n\n※ OKを押しながらShiftキーを押すと10分間確認を省略できます`
      if (!confirm(confirmMessage)) {
        setDraggedProblem(null)
        return
      }
    }

    try {
      // 元の状態を保存（Undo用）
      setLastDragOperation({
        problemId: draggedProblem.id,
        originalParentId: draggedProblem.parentProblemId,
        originalProblemNumber: draggedProblem.problemNumber,
        originalSectionTitle: draggedProblem.sectionTitle,
        originalSortOrder: draggedProblem.sortOrder,
      })

      // ドラッグした問題を対象問題の小問にする
      await makeSubProblem(draggedProblem.id, targetProblem.id)
      setDraggedProblem(null)
      loadData()
    } catch (error) {
      console.error('小問の設定に失敗しました:', error)
      alert(error instanceof Error ? error.message : '小問の設定に失敗しました')
      setDraggedProblem(null)
      setLastDragOperation(null)
    }
  }, [draggedProblem, skipConfirmUntil, loadData])

  const handleUndoLastDrag = async () => {
    if (!lastDragOperation) return

    try {
      if (lastDragOperation.originalParentId) {
        // 元々小問だった場合、元の親に戻す
        await makeSubProblem(lastDragOperation.problemId, lastDragOperation.originalParentId)
      } else {
        // 元々独立した問題だった場合
        await makeIndependentProblem(lastDragOperation.problemId)
      }
      setLastDragOperation(null)
      loadData()
    } catch (error) {
      console.error('元に戻すに失敗しました:', error)
      alert('元に戻すに失敗しました')
    }
  }

  const handleSkipConfirmFor10Min = () => {
    setSkipConfirmUntil(Date.now() + 10 * 60 * 1000)
  }

  const handleDropToIndependent = async (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedProblem) return

    // 小問を独立した問題にする
    if (draggedProblem.parentProblemId) {
      await makeIndependentProblem(draggedProblem.id)
      setDraggedProblem(null)
      loadData()
    }
  }


  // 小問を追加
  const handleAddSubProblem = async (parentProblem: Problem) => {
    if (!id) return

    const subProblems = subProblemsMap.get(parentProblem.id) || []
    const nextSubNumber = subProblems.length + 1

    const newProblemNumber = `${parentProblem.problemNumber}-${nextSubNumber}`

    await addProblem({
      workbookId: id,
      problemNumber: newProblemNumber,
      sectionTitle: parentProblem.sectionTitle,
      category: parentProblem.category,
      page: parentProblem.page,
      parentProblemId: parentProblem.id,
    })

    loadData()
  }

  const handleExportCSV = async () => {
    if (!workbook) return

    const csvContent = await exportProblemsToCSV(problems)
    const filename = `${workbook.title}_問題集_${new Date().toISOString().split('T')[0]}.csv`
    downloadCSV(csvContent, filename)
  }

  const handleResetStudyRecords = async () => {
    if (!id || !workbook) return

    const confirmMessage = `「${workbook.title}」の学習履歴を全て削除しますか？\n\nこの操作は取り消せません。`
    if (!confirm(confirmMessage)) return

    try {
      await deleteStudyRecordsForWorkbook(id)
      alert('学習履歴をリセットしました')
      loadData() // データを再読み込み
    } catch (error) {
      console.error('学習履歴のリセットに失敗しました:', error)
      alert('学習履歴のリセットに失敗しました')
    }
  }

  const handleEditWorkbook = () => {
    if (!workbook) return
    handleEditWorkbookOriginal(workbook)
  }

  const handleSaveWorkbook = () => {
    handleSaveWorkbookOriginal(loadData)
  }

  // PDF削除 - 一時的に無効化
  // const handleDeletePDF = async () => {
  //   if (!id || !workbook?.pdfFileName) return
  //   if (!confirm('PDFファイルを削除しますか？')) return
  //   try {
  //     await deletePDF(id, workbook.pdfFileName)
  //     await db.workbooks.update(id, {
  //       pdfUrl: undefined,
  //       pdfFileName: undefined,
  //       updatedAt: new Date(),
  //     })
  //     alert('PDFを削除しました')
  //     loadData()
  //   } catch (error) {
  //     console.error('PDF削除エラー:', error)
  //     alert('PDFの削除に失敗しました')
  //   }
  // }

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !id) return

    // ファイルサイズチェック（5MB制限）
    if (file.size > 5 * 1024 * 1024) {
      alert('ファイルサイズが大きすぎます（5MB以下にしてください）')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const csvText = e.target?.result as string
        const parsedProblems = parseCSV(csvText)

        // バリデーション
        validateCSVData(parsedProblems)

        // インポート前に確認
        if (!confirm(`${parsedProblems.length}問の問題をインポートします。よろしいですか？`)) {
          return
        }

        // 問題を追加（まず親問題なしで全て追加）
        let successCount = 0
        let errorCount = 0
        const errors: string[] = []
        const problemNumberToId = new Map<string, string>()

        setImportProgress({ current: 0, total: parsedProblems.length, phase: 'importing' })

        for (let i = 0; i < parsedProblems.length; i++) {
          try {
            const problemData = parsedProblems[i]
            const newProblemId = await addProblem({
              workbookId: id,
              problemNumber: problemData.problemNumber,
              sectionTitle: problemData.sectionTitle,
              category: problemData.category,
              page: problemData.page,
              memo: problemData.memo,
            })
            // 問題番号とIDのマッピングを保存
            problemNumberToId.set(problemData.problemNumber, newProblemId)
            successCount++
          } catch (error) {
            errorCount++
            const errorMsg = error instanceof Error ? error.message : '不明なエラー'
            errors.push(`${i + 1}行目: ${errorMsg}`)
          }
          setImportProgress({ current: i + 1, total: parsedProblems.length, phase: 'importing' })
        }

        // 親子関係を設定（makeSubProblemを使わず直接設定）
        const problemsWithParent = parsedProblems.filter(p => p.parentProblemNumber)
        if (problemsWithParent.length > 0) {
          setImportProgress({ current: 0, total: problemsWithParent.length, phase: 'relations' })
        }

        let relationCount = 0
        for (let i = 0; i < problemsWithParent.length; i++) {
          const problemData = problemsWithParent[i]
          const childId = problemNumberToId.get(problemData.problemNumber)
          const parentId = problemNumberToId.get(problemData.parentProblemNumber!)
          if (childId && parentId) {
            try {
              // 直接parentProblemIdを設定（makeSubProblemは使わない）
              await db.problems.update(childId, {
                parentProblemId: parentId,
              })
              relationCount++
            } catch (error) {
              console.error('親子関係の設定に失敗:', error)
            }
          }
          setImportProgress({ current: i + 1, total: problemsWithParent.length, phase: 'relations' })
        }

        setImportProgress(null)

        // データを再読み込み
        await loadData()

        if (errorCount > 0) {
          const errorSummary = errors.slice(0, 5).join('\n')
          const moreErrors = errors.length > 5 ? `\n...他${errors.length - 5}件` : ''
          alert(
            `${successCount}問の問題をインポートしました。\n${errorCount}問でエラーが発生しました：\n\n${errorSummary}${moreErrors}`
          )
        } else {
          alert(`${successCount}問の問題をインポートしました`)
        }
      } catch (error) {
        console.error('CSV import error:', error)
        if (error instanceof ValidationError) {
          alert(`バリデーションエラー: ${error.message}`)
        } else {
          alert(error instanceof Error ? error.message : 'CSVのインポートに失敗しました')
        }
      }
    }

    reader.readAsText(file, 'UTF-8')

    // ファイル選択をリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (!workbook) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      {/* インポート進捗オーバーレイ */}
      {importProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {importProgress.phase === 'importing' ? 'インポート中...' : '親子関係を設定中...'}
            </h3>
            <div className="mb-2">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-150"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-gray-600 text-center">
              {importProgress.current} / {importProgress.total}
            </p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/workbooks')}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          戻る
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            {isEditingWorkbook ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={workbookFormData.title}
                  onChange={(e) => setWorkbookFormData({ ...workbookFormData, title: e.target.value })}
                  className="w-full px-3 py-2 text-xl font-bold border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="問題集のタイトル"
                  autoFocus
                />
                <input
                  type="text"
                  value={workbookFormData.subject}
                  onChange={(e) => setWorkbookFormData({ ...workbookFormData, subject: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="科目・説明"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveWorkbook}>
                    保存
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleCancelEditWorkbook}>
                    キャンセル
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{workbook.title}</h1>
                  <p className="text-gray-600">{workbook.subject}</p>
                </div>
                <button
                  onClick={handleEditWorkbook}
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors mt-1"
                  title="問題集を編集"
                >
                  <Edit2 size={16} className="text-gray-500" />
                </button>
              </div>
            )}
            {/* PDF機能は一時的に無効化
            {workbook.pdfFileName && (
              <p className="text-sm text-blue-600 flex items-center gap-1 mt-1">
                <FileText size={14} />
                {workbook.pdfFileName}
              </p>
            )}
            */}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {/* フィルタボタン */}
            <Button
              variant={showBookmarkedOnly ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
              title={showBookmarkedOnly ? 'すべての問題を表示' : 'ブックマークのみ表示'}
            >
              <Star size={16} fill={showBookmarkedOnly ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline ml-1">ブックマーク</span>
            </Button>
            <Button
              variant={showTaggedOnly ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowTaggedOnly(!showTaggedOnly)}
              title={showTaggedOnly ? 'すべての問題を表示' : 'タグ付き問題のみ表示'}
            >
              <Tag size={16} />
              <span className="hidden sm:inline ml-1">タグ付き</span>
            </Button>

            {/* PDF関連ボタン - 一時的に無効化
            {workbook.pdfUrl && (
              <Button
                variant="error"
                size="sm"
                onClick={handleDeletePDF}
                title="PDF削除"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline ml-1">PDF削除</span>
              </Button>
            )}
            */}
            {/* CSV関連ボタン */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCSV}
              disabled={problems.length === 0}
              title="CSV出力"
            >
              <Download size={16} />
              <span className="hidden sm:inline ml-1">CSV出力</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              title="CSV取込"
            >
              <Upload size={16} />
              <span className="hidden sm:inline ml-1">CSV取込</span>
            </Button>
            <Button
              variant="error"
              size="sm"
              onClick={handleResetStudyRecords}
              disabled={problems.length === 0}
              title="学習履歴リセット"
            >
              <RotateCcw size={16} />
              <span className="hidden sm:inline ml-1">リセット</span>
            </Button>
            <Button onClick={() => setIsModalOpen(true)} title="問題を追加">
              <Plus size={20} />
              <span className="hidden sm:inline ml-1">問題を追加</span>
            </Button>
          </div>
        </div>

      </div>

      {/* Undo通知バーと確認スキップ */}
      {problems.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {lastDragOperation && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleUndoLastDrag}
              >
                <Undo2 size={14} className="mr-1" />
                元に戻す
              </Button>
              <button
                onClick={() => setLastDragOperation(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>
          )}
          {skipConfirmUntil > Date.now() ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
              <span className="text-blue-700">確認省略中</span>
              <button
                onClick={() => setSkipConfirmUntil(0)}
                className="text-blue-500 hover:text-blue-700 underline"
              >
                解除
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked) {
                    handleSkipConfirmFor10Min()
                  }
                }}
                className="rounded"
              />
              10分間確認を省略
            </label>
          )}
        </div>
      )}

      {problems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">問題がありません</p>
          <Button onClick={() => setIsModalOpen(true)}>
            最初の問題を追加
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(filteredProblemHierarchy).map(([category, titles]) => {
            const isCategoryExpanded = expandedCategories.has(category)
            const totalProblems = Object.values(titles).reduce(
              (sum, problems) => sum + getActualProblemCount(problems),
              0
            )

            // カテゴリ全体が除外されているか判定（全セクションが除外されている場合）
            const allSectionsExcluded = Object.keys(titles).every((title) => {
              const titleKey = `${category}-${title}`
              return excludedSections.includes(titleKey)
            })

            return (
              <div key={category}>
                {/* 親カテゴリヘッダー */}
                <div className={`flex items-center justify-between p-4 rounded-lg transition-colors ${allSectionsExcluded ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => toggleCategory(category)}
                  >
                    {isCategoryExpanded ? (
                      <ChevronDown size={20} className={allSectionsExcluded ? "text-gray-400" : "text-gray-600"} />
                    ) : (
                      <ChevronRight size={20} className={allSectionsExcluded ? "text-gray-400" : "text-gray-600"} />
                    )}
                    <h2 className={`text-xl font-bold ${allSectionsExcluded ? 'text-gray-400' : ''}`}>{category}</h2>
                    {allSectionsExcluded && (
                      <span className="text-xs bg-gray-300 text-gray-600 px-2 py-0.5 rounded whitespace-nowrap">
                        復習から除外
                      </span>
                    )}
                    <span className={`text-sm ${allSectionsExcluded ? 'text-gray-400' : 'text-gray-500'}`}>
                      {Object.keys(titles).length}セクション · {totalProblems}問
                    </span>
                    {(() => {
                      const categoryAccuracy = categoryAccuracyRates.get(category)
                      if (categoryAccuracy !== null && categoryAccuracy !== undefined) {
                        const colorClass = categoryAccuracy >= 80
                          ? 'bg-green-100 text-green-700'
                          : categoryAccuracy >= 50
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                        return (
                          <span
                            className={`text-sm px-2 py-1 rounded font-medium ${colorClass}`}
                            title="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）"
                          >
                            正解率 {categoryAccuracy}%
                          </span>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditCategoryWrapper(category, Object.values(titles))
                    }}
                    className="p-2 hover:bg-blue-100 rounded transition-colors"
                  >
                    <Edit2 size={16} className="text-primary" />
                  </button>
                </div>

                {/* 目次タイトルリスト */}
                {isCategoryExpanded && (
                  <div className="ml-8 mt-2 space-y-2">
                    {Object.entries(titles).map(([title, titleProblems]) => {
                      const titleKey = `${category}-${title}`
                      const isTitleExpanded = expandedTitles.has(titleKey)
                      const firstProblemWithPage = titleProblems.find(
                        (p) => p.page !== undefined
                      )

                      const isExcluded = excludedSections.includes(titleKey)

                      return (
                        <div key={titleKey}>
                          {/* 目次タイトルヘッダー */}
                          <div className={`border border-border rounded-lg ${isExcluded ? 'bg-gray-100' : 'bg-white'}`}>
                            <div
                              className={`flex items-center justify-between p-3 transition-colors ${isExcluded ? 'hover:bg-gray-200' : 'hover:bg-secondary/50'}`}
                            >
                              {/* 左側：展開アイコン、タイトル */}
                              <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleTitle(titleKey)}>
                                {isTitleExpanded ? (
                                  <ChevronDown size={16} className={isExcluded ? "text-gray-400" : "text-gray-600"} />
                                ) : (
                                  <ChevronRight size={16} className={isExcluded ? "text-gray-400" : "text-gray-600"} />
                                )}
                                <h3 className={`font-semibold ${isExcluded ? 'text-gray-400' : ''}`}>{title}</h3>
                              </div>
                              {/* 右側：ラベル群とボタン（固定位置） */}
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isExcluded && (
                                  <span className="text-xs bg-gray-300 text-gray-600 px-2 py-0.5 rounded whitespace-nowrap">
                                    復習から除外
                                  </span>
                                )}
                                {firstProblemWithPage?.page && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded whitespace-nowrap">
                                    p.{firstProblemWithPage.page}
                                  </span>
                                )}
                                {(() => {
                                  const accuracy = sectionAccuracyRates.get(titleKey)
                                  if (accuracy !== null && accuracy !== undefined) {
                                    const colorClass = accuracy >= 80
                                      ? 'bg-green-100 text-green-700'
                                      : accuracy >= 50
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                                    return (
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${colorClass}`}
                                        title="最新3回の重み付け平均（最新50%、1つ前30%、2つ前20%）"
                                      >
                                        正解率 {accuracy}%
                                      </span>
                                    )
                                  }
                                  return null
                                })()}
                                <span className="text-sm text-gray-500 whitespace-nowrap">
                                  {getActualProblemCount(titleProblems)}問
                                </span>
                                <Button
                                  size="sm"
                                  onClick={() => handleStartGroupStudy(titleProblems)}
                                >
                                  <Play size={14} className="mr-1" />
                                  学習
                                </Button>
                                <button
                                  onClick={() =>
                                    handleEditGroupWrapper(
                                      `${category}${title}`,
                                      titleProblems
                                    )
                                  }
                                  className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                                >
                                  <Edit2 size={14} className="text-primary" />
                                </button>
                              </div>
                            </div>

                            {/* 問題リスト（折りたたみ可能） */}
                            {isTitleExpanded && (
                              <div className="border-t border-border p-3 space-y-2 bg-gray-50">
                                {titleProblems.map((problem) => {
                                  const subProblems = subProblemsMap.get(problem.id) || []
                                  const hasSubProblems = subProblems.length > 0
                                  const isParentExpanded = expandedParents.has(problem.id)

                                  return (
                                    <div key={problem.id}>
                                      {/* 親問題 */}
                                      <div
                                        draggable
                                        onDragStart={() => handleDragStart(problem)}
                                        onDragOver={handleDragOver}
                                        onDrop={() => handleDrop(problem)}
                                        className="flex items-center justify-between p-2 bg-white rounded hover:bg-secondary/50 transition-colors cursor-move border-2 border-transparent hover:border-blue-200"
                                      >
                                        <div className="flex items-center gap-2 flex-1">
                                          {hasSubProblems && (
                                            <button
                                              onClick={() => toggleParent(problem.id)}
                                              className="p-0.5 hover:bg-gray-200 rounded"
                                            >
                                              {isParentExpanded ? (
                                                <ChevronDown size={14} className="text-gray-600" />
                                              ) : (
                                                <ChevronRight size={14} className="text-gray-600" />
                                              )}
                                            </button>
                                          )}
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-medium">
                                                {problem.problemNumber}
                                              </span>
                                              {problem.sectionTitle && (
                                                <span className="text-xs text-gray-600">
                                                  {problem.sectionTitle}
                                                </span>
                                              )}
                                              {hasSubProblems && (
                                                <span className="text-xs text-gray-500">
                                                  ({subProblems.length}小問)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => handleAddSubProblem(problem)}
                                            className="p-1.5 hover:bg-green-100 rounded transition-colors"
                                            title="小問を追加"
                                          >
                                            <Plus size={14} className="text-green-600" />
                                          </button>
                                          <button
                                            onClick={() => handleEditProblem(problem)}
                                            className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                                          >
                                            <Edit2 size={14} className="text-primary" />
                                          </button>
                                          <button
                                            onClick={() => handleDelete(problem.id)}
                                            className="p-1.5 hover:bg-red-100 rounded transition-colors"
                                          >
                                            <Trash2 size={14} className="text-error" />
                                          </button>
                                        </div>
                                      </div>

                                      {/* 小問リスト */}
                                      {hasSubProblems && isParentExpanded && (
                                        <div className="ml-6 mt-1 space-y-1">
                                          {subProblems.map((subProblem) => (
                                            <div
                                              key={subProblem.id}
                                              draggable
                                              onDragStart={() => handleDragStart(subProblem)}
                                              onDragOver={handleDragOver}
                                              onDrop={handleDropToIndependent}
                                              className="flex items-center justify-between p-2 bg-blue-50 rounded hover:bg-blue-100 transition-colors cursor-move border-2 border-transparent hover:border-blue-300"
                                            >
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-sm font-medium text-blue-700">
                                                    {subProblem.problemNumber}
                                                  </span>
                                                  {subProblem.sectionTitle && (
                                                    <span className="text-xs text-gray-600">
                                                      {subProblem.sectionTitle}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => handleEditProblem(subProblem)}
                                                  className="p-1.5 hover:bg-blue-200 rounded transition-colors"
                                                >
                                                  <Edit2 size={14} className="text-primary" />
                                                </button>
                                                <button
                                                  onClick={() => handleDelete(subProblem.id)}
                                                  className="p-1.5 hover:bg-red-100 rounded transition-colors"
                                                >
                                                  <Trash2 size={14} className="text-error" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingProblem ? '問題の編集' : '問題の追加'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 学習履歴と正答率を表示（編集モード時のみ） */}
          {editingProblem && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-sm text-blue-900">学習状況</h3>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-xs text-gray-600">学習回数: </span>
                  <span className="text-sm font-medium">{studyRecords.length}回</span>
                </div>
                {problemAccuracy !== null && (
                  <div>
                    <span className="text-xs text-gray-600">正答率: </span>
                    <span className={`text-sm font-medium ${
                      problemAccuracy >= 80
                        ? 'text-green-600'
                        : problemAccuracy >= 50
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}>
                      {problemAccuracy}%
                    </span>
                  </div>
                )}
              </div>
              {studyRecords.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-1">最近の学習記録:</p>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {studyRecords.slice(0, 5).map((record) => (
                      <div key={record.id} className="text-xs flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded ${
                          record.result === 'correct'
                            ? 'bg-green-100 text-green-700'
                            : record.result === 'partial'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {record.result === 'correct' ? '◯' : record.result === 'partial' ? '△' : '×'}
                        </span>
                        <span className="text-gray-600">
                          {new Date(record.studiedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              問題番号（出題時の表示名） <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.problemNumber}
              onChange={(e) =>
                setFormData({ ...formData, problemNumber: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 第1章-基本問題-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              ハイフン（-）で区切ると階層表示され、出題時は最後の番号（例: 1）が表示されます
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">カテゴリ（出題時のセクション名）</label>
            {!showCustomCategoryInput && availableCategories.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={formData.category}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setShowCustomCategoryInput(true)
                      setFormData({ ...formData, category: '' })
                    } else {
                      setFormData({ ...formData, category: e.target.value })
                    }
                  }}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">選択してください</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__">+ 新しいカテゴリを作成</option>
                </select>
                <p className="text-xs text-gray-500">
                  出題時にこのカテゴリ名がセクション名として表示されます
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="例: 言語"
                />
                {availableCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCustomCategoryInput(false)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    既存のカテゴリから選択
                  </button>
                )}
                <p className="text-xs text-gray-500">
                  出題時にこのカテゴリ名がセクション名として表示されます（空欄の場合は問題番号から自動抽出）
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ページ番号</label>
            <input
              type="number"
              min="1"
              value={formData.page}
              onChange={(e) =>
                setFormData({ ...formData, page: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 45"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">メモ</label>
            <textarea
              value={formData.memo}
              onChange={(e) =>
                setFormData({ ...formData, memo: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary h-24"
              placeholder="問題の内容や注意点など（任意）"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseModal}
            >
              キャンセル
            </Button>
            <Button type="submit">
              {editingProblem ? '更新' : '追加'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isGroupModalOpen}
        onClose={handleCloseGroupModal}
        title="目次タイトルの編集"
      >
        <form onSubmit={handleGroupSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              タイトル <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={groupFormData.groupName}
              onChange={(e) =>
                setGroupFormData({ ...groupFormData, groupName: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 第1章"
            />
            <p className="text-xs text-gray-500 mt-1">
              このグループ内のすべての問題番号のプレフィックスが更新されます
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">カテゴリ（出題時のセクション名）</label>
            <input
              type="text"
              value={groupFormData.category}
              onChange={(e) =>
                setGroupFormData({ ...groupFormData, category: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 言語"
            />
            <p className="text-xs text-gray-500 mt-1">
              出題時にこのカテゴリ名がセクション名として表示されます（グループ内すべての問題に適用）
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">ページ番号</label>
            <input
              type="number"
              min="1"
              value={groupFormData.page}
              onChange={(e) =>
                setGroupFormData({ ...groupFormData, page: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 45"
            />
            <p className="text-xs text-gray-500 mt-1">
              このグループ内のすべての問題に同じページ数が設定されます
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              このグループには {editingGroup?.problems.length || 0} 問が含まれています
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseGroupModal}
            >
              キャンセル
            </Button>
            <Button type="submit">更新</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCategoryModalOpen}
        onClose={handleCloseCategoryModal}
        title="親カテゴリの編集"
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              カテゴリ名（出題時のセクション名） <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={categoryFormData.categoryName}
              onChange={(e) =>
                setCategoryFormData({ categoryName: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 言語"
            />
            <p className="text-xs text-gray-500 mt-1">
              出題時にこのカテゴリ名がセクション名として表示されます（カテゴリ内すべての問題に適用）
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              このカテゴリには {editingCategory?.problems.length || 0} 問が含まれています
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseCategoryModal}
            >
              キャンセル
            </Button>
            <Button type="submit">更新</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

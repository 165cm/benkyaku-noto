import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Play, Trash2, Edit2, ChevronDown, ChevronRight, Download, Upload } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import {
  getWorkbook,
  getProblems,
  addProblem,
  deleteProblem,
  db,
  makeSubProblem,
  makeIndependentProblem,
  getSubProblems,
} from '@/lib/db'
import { exportProblemsToCSV, downloadCSV, parseCSV } from '@/lib/csvExport'
import { calculateRecentAccuracyForProblems } from '@/lib/review'
import type { Workbook, Problem } from '@/types'

export default function WorkbookDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)
  const [formData, setFormData] = useState({
    problemNumber: '',
    category: '',
    page: '',
    memo: '',
  })
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<{
    groupKey: string
    problems: Problem[]
  } | null>(null)
  const [groupFormData, setGroupFormData] = useState({
    groupName: '',
    category: '',
    page: '',
  })
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set())
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<{
    oldCategory: string
    problems: Problem[]
  } | null>(null)
  const [categoryFormData, setCategoryFormData] = useState({
    categoryName: '',
  })
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [isBulkCategoryModalOpen, setIsBulkCategoryModalOpen] = useState(false)
  const [bulkCategoryValue, setBulkCategoryValue] = useState('')
  const [sectionAccuracyRates, setSectionAccuracyRates] = useState<Map<string, number | null>>(new Map())
  const [subProblemsMap, setSubProblemsMap] = useState<Map<string, Problem[]>>(new Map())
  const [draggedProblem, setDraggedProblem] = useState<Problem | null>(null)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

  // 各セクションの直近回答の正解率を計算
  useEffect(() => {
    const calculateAccuracyRates = async () => {
      const hierarchy = groupProblemsByHierarchy()
      const accuracyMap = new Map<string, number | null>()

      for (const [category, titles] of Object.entries(hierarchy)) {
        for (const [title, titleProblems] of Object.entries(titles)) {
          const sectionKey = `${category}-${title}`
          const accuracy = await calculateRecentAccuracyForProblems(titleProblems)
          accuracyMap.set(sectionKey, accuracy)
        }
      }

      setSectionAccuracyRates(accuracyMap)
    }

    if (problems.length > 0) {
      calculateAccuracyRates()
    } else {
      setSectionAccuracyRates(new Map())
    }
  }, [problems])

  const loadData = async () => {
    if (!id) return

    const workbookData = await getWorkbook(id)
    let problemsData = await getProblems(id)

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

    // 問題数を更新
    if (workbookData && workbookData.totalProblems !== problemsData.length) {
      await db.workbooks.update(id, {
        totalProblems: problemsData.length,
        updatedAt: new Date(),
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

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
        workbookId: id,
        problemNumber: formData.problemNumber,
        category: formData.category || undefined,
        page: formData.page ? parseInt(formData.page) : undefined,
        memo: formData.memo || undefined,
      })
    }

    setFormData({ problemNumber: '', category: '', page: '', memo: '' })
    setEditingProblem(null)
    setIsModalOpen(false)
    loadData()
  }

  const handleEdit = (problem: Problem) => {
    setEditingProblem(problem)
    setFormData({
      problemNumber: problem.problemNumber,
      category: problem.category || '',
      page: problem.page?.toString() || '',
      memo: problem.memo || '',
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (problemId: string) => {
    if (confirm('この問題を削除しますか？学習記録もすべて削除されます。')) {
      await deleteProblem(problemId)
      loadData()
    }
  }

  const handleStartGroupStudy = (groupProblems: Problem[]) => {
    if (groupProblems.length === 0) return

    // グループ内の問題からランダムに1つ選択
    const randomProblem = groupProblems[Math.floor(Math.random() * groupProblems.length)]
    navigate(`/study/${randomProblem.id}`)
  }

  const handleEditGroup = (groupKey: string, groupProblems: Problem[]) => {
    setEditingGroup({ groupKey, problems: groupProblems })

    // グループ内の最初の問題のページ数とカテゴリを取得
    const firstProblemWithPage = groupProblems.find(p => p.page !== undefined)
    const firstProblemWithCategory = groupProblems.find(p => p.category !== undefined)

    setGroupFormData({
      groupName: groupKey,
      category: firstProblemWithCategory?.category || '',
      page: firstProblemWithPage?.page?.toString() || '',
    })
    setIsGroupModalOpen(true)
  }

  const handleGroupSubmit = async (e: React.FormEvent) => {
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

    setIsGroupModalOpen(false)
    setEditingGroup(null)
    setGroupFormData({ groupName: '', category: '', page: '' })
    loadData()
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProblem(null)
    setFormData({ problemNumber: '', category: '', page: '', memo: '' })
  }

  const handleCloseGroupModal = () => {
    setIsGroupModalOpen(false)
    setEditingGroup(null)
    setGroupFormData({ groupName: '', category: '', page: '' })
  }

  // 問題からカテゴリと目次タイトルを抽出
  const parseGroupInfo = (problem: Problem) => {
    // categoryフィールドが設定されている場合はそれを優先
    if (problem.category) {
      const parts = problem.problemNumber.split('-')
      return {
        category: problem.category,
        title: parts.length > 1 ? parts.slice(0, -1).join('-') : '問題',
      }
    }

    // categoryフィールドがない場合は問題番号から抽出（後方互換性）
    const problemNumber = problem.problemNumber

    // "[言語]熟語の成り立ち-109" → { category: "[言語]", title: "熟語の成り立ち" }
    const match = problemNumber.match(/^(\[.+?\])(.+?)-\d+$/)
    if (match) {
      return {
        category: match[1],
        title: match[2],
      }
    }

    // "[言語]" だけの場合や、ハイフンがない場合
    const parts = problemNumber.split('-')
    if (parts[0].startsWith('[') && parts[0].endsWith(']')) {
      return {
        category: parts[0],
        title: parts.slice(1, -1).join('-') || '問題',
      }
    }

    // デフォルト
    return {
      category: '未分類',
      title: parts.length > 1 ? parts[0] : '問題',
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

          // ページ番号が同じ（または両方なし）場合は問題番号の最後の数値部分で比較
          const getLastNumber = (problemNumber: string) => {
            const parts = problemNumber.split('-')
            const lastPart = parts[parts.length - 1]
            const num = parseInt(lastPart)
            return isNaN(num) ? 0 : num
          }

          const numA = getLastNumber(a.problemNumber)
          const numB = getLastNumber(b.problemNumber)

          if (numA !== numB) {
            return numA - numB
          }

          // 最後の手段として文字列で比較
          return a.problemNumber.localeCompare(b.problemNumber)
        })
      })
    })

    return hierarchy
  }

  const problemHierarchy = groupProblemsByHierarchy()

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

  const handleEditCategory = (category: string, categoryProblems: Problem[][]) => {
    // カテゴリ内のすべての問題をフラット化
    const allProblems = categoryProblems.flat()

    setEditingCategory({
      oldCategory: category,
      problems: allProblems,
    })
    setCategoryFormData({ categoryName: category })
    setIsCategoryModalOpen(true)
  }

  const handleCategorySubmit = async (e: React.FormEvent) => {
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

    setIsCategoryModalOpen(false)
    setEditingCategory(null)
    setCategoryFormData({ categoryName: '' })
    loadData()
  }

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false)
    setEditingCategory(null)
    setCategoryFormData({ categoryName: '' })
  }

  const toggleSectionSelection = (sectionKey: string) => {
    const newSelected = new Set(selectedSections)
    if (newSelected.has(sectionKey)) {
      newSelected.delete(sectionKey)
    } else {
      newSelected.add(sectionKey)
    }
    setSelectedSections(newSelected)
  }

  const toggleAllSections = () => {
    const problemHierarchy = groupProblemsByHierarchy()
    const allSectionKeys: string[] = []
    Object.entries(problemHierarchy).forEach(([category, titles]) => {
      Object.keys(titles).forEach((title) => {
        allSectionKeys.push(`${category}-${title}`)
      })
    })

    if (selectedSections.size === allSectionKeys.length) {
      setSelectedSections(new Set())
    } else {
      setSelectedSections(new Set(allSectionKeys))
    }
  }

  const getSelectedProblems = (): Problem[] => {
    const problemHierarchy = groupProblemsByHierarchy()
    const selectedProblems: Problem[] = []

    selectedSections.forEach((sectionKey) => {
      const [category, ...titleParts] = sectionKey.split('-')
      const title = titleParts.join('-')
      if (problemHierarchy[category] && problemHierarchy[category][title]) {
        selectedProblems.push(...problemHierarchy[category][title])
      }
    })

    return selectedProblems
  }

  const handleBulkCategoryChange = async () => {
    if (selectedSections.size === 0) return

    setIsBulkCategoryModalOpen(true)
  }

  const handleBulkCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const categoryToSet = bulkCategoryValue.trim() !== '' ? bulkCategoryValue.trim() : undefined
    const problemsToUpdate = getSelectedProblems()

    for (const problem of problemsToUpdate) {
      await db.problems.update(problem.id, {
        category: categoryToSet,
      })
    }

    setIsBulkCategoryModalOpen(false)
    setBulkCategoryValue('')
    setSelectedSections(new Set())
    loadData()
  }

  const handleBulkDelete = async () => {
    if (selectedSections.size === 0) return

    const problemsToDelete = getSelectedProblems()

    if (!confirm(`選択した${selectedSections.size}セクション（${problemsToDelete.length}問）の問題を削除しますか？学習記録もすべて削除されます。`)) {
      return
    }

    for (const problem of problemsToDelete) {
      await deleteProblem(problem.id)
    }

    setSelectedSections(new Set())
    loadData()
  }

  // ドラッグアンドドロップのハンドラー
  const handleDragStart = (problem: Problem) => {
    setDraggedProblem(problem)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() // ドロップを有効にする
  }

  const handleDrop = async (targetProblem: Problem) => {
    if (!draggedProblem || draggedProblem.id === targetProblem.id) {
      setDraggedProblem(null)
      return
    }

    // ドラッグした問題を対象問題の小問にする
    await makeSubProblem(draggedProblem.id, targetProblem.id)
    setDraggedProblem(null)
    loadData()
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

  // 親問題の折りたたみ切り替え
  const toggleParent = (problemId: string) => {
    const newExpanded = new Set(expandedParents)
    if (newExpanded.has(problemId)) {
      newExpanded.delete(problemId)
    } else {
      newExpanded.add(problemId)
    }
    setExpandedParents(newExpanded)
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
      category: parentProblem.category,
      page: parentProblem.page,
      parentProblemId: parentProblem.id,
    })

    loadData()
  }

  const handleExportCSV = () => {
    if (!workbook) return

    const csvContent = exportProblemsToCSV(problems)
    const filename = `${workbook.title}_問題集_${new Date().toISOString().split('T')[0]}.csv`
    downloadCSV(csvContent, filename)
  }

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !id) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const csvText = e.target?.result as string
        const parsedProblems = parseCSV(csvText)

        // インポート前に確認
        if (!confirm(`${parsedProblems.length}問の問題をインポートします。よろしいですか？`)) {
          return
        }

        // 問題を追加
        for (const problemData of parsedProblems) {
          await addProblem({
            workbookId: id,
            problemNumber: problemData.problemNumber,
            category: problemData.category,
            page: problemData.page,
            memo: problemData.memo,
          })
        }

        // データを再読み込み
        await loadData()
        alert(`${parsedProblems.length}問の問題をインポートしました`)
      } catch (error) {
        console.error('CSV import error:', error)
        alert(error instanceof Error ? error.message : 'CSVのインポートに失敗しました')
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

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{workbook.title}</h1>
            <p className="text-gray-600">{workbook.subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCSV}
              disabled={problems.length === 0}
            >
              <Download size={16} className="mr-1" />
              CSV出力
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
            >
              <Upload size={16} className="mr-1" />
              CSV取込
            </Button>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus size={20} className="mr-2" />
              問題を追加
            </Button>
          </div>
        </div>

        {/* 一括操作バー */}
        {problems.length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSections.size > 0 && selectedSections.size === Object.entries(groupProblemsByHierarchy()).reduce((count, [, titles]) => count + Object.keys(titles).length, 0)}
                    onChange={toggleAllSections}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">
                    すべて選択
                  </span>
                </label>
                {selectedSections.size > 0 && (
                  <span className="text-sm text-gray-600">
                    {selectedSections.size}セクション（{getSelectedProblems().length}問）選択中
                  </span>
                )}
              </div>
              {selectedSections.size > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBulkCategoryChange}
                  >
                    <Edit2 size={14} className="mr-1" />
                    カテゴリ変更
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="hover:bg-red-100"
                  >
                    <Trash2 size={14} className="mr-1" />
                    削除
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {problems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">問題がありません</p>
          <Button onClick={() => setIsModalOpen(true)}>
            最初の問題を追加
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(problemHierarchy).map(([category, titles]) => {
            const isCategoryExpanded = expandedCategories.has(category)
            const totalProblems = Object.values(titles).reduce(
              (sum, problems) => sum + problems.length,
              0
            )

            return (
              <div key={category}>
                {/* 親カテゴリヘッダー */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => toggleCategory(category)}
                  >
                    {isCategoryExpanded ? (
                      <ChevronDown size={20} className="text-gray-600" />
                    ) : (
                      <ChevronRight size={20} className="text-gray-600" />
                    )}
                    <h2 className="text-xl font-bold">{category}</h2>
                    <span className="text-sm text-gray-500">
                      {Object.keys(titles).length}セクション · {totalProblems}問
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEditCategory(category, Object.values(titles))
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

                      return (
                        <div key={titleKey}>
                          {/* 目次タイトルヘッダー */}
                          <div className="bg-white border border-border rounded-lg">
                            <div
                              className="flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors"
                            >
                              {/* 左側：チェックボックス、展開アイコン、タイトル */}
                              <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleTitle(titleKey)}>
                                <input
                                  type="checkbox"
                                  checked={selectedSections.has(titleKey)}
                                  onChange={() => toggleSectionSelection(titleKey)}
                                  className="w-4 h-4 rounded border-gray-300"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {isTitleExpanded ? (
                                  <ChevronDown size={16} className="text-gray-600" />
                                ) : (
                                  <ChevronRight size={16} className="text-gray-600" />
                                )}
                                <h3 className="font-semibold">{title}</h3>
                              </div>
                              {/* 右側：ラベル群とボタン（固定位置） */}
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
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
                                      <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${colorClass}`}>
                                        正解率 {accuracy}%
                                      </span>
                                    )
                                  }
                                  return null
                                })()}
                                <span className="text-sm text-gray-500 whitespace-nowrap">
                                  {titleProblems.length}問
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
                                    handleEditGroup(
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
                                                {problem.problemNumber.split('-').pop()}
                                              </span>
                                              {hasSubProblems && (
                                                <span className="text-xs text-gray-500">
                                                  ({subProblems.length}小問)
                                                </span>
                                              )}
                                            </div>
                                            {problem.memo && (
                                              <p className="text-xs text-gray-600 mt-1">
                                                {problem.memo}
                                              </p>
                                            )}
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
                                            onClick={() => handleEdit(problem)}
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
                                                    {subProblem.problemNumber.split('-').pop()}
                                                  </span>
                                                </div>
                                                {subProblem.memo && (
                                                  <p className="text-xs text-gray-600 mt-1">
                                                    {subProblem.memo}
                                                  </p>
                                                )}
                                              </div>

                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => handleEdit(subProblem)}
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
          <div>
            <label className="block text-sm font-medium mb-2">
              問題番号 <span className="text-error">*</span>
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
              ハイフン（-）で区切ると自動的に階層表示されます
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">カテゴリ</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 言語"
            />
            <p className="text-xs text-gray-500 mt-1">
              親カテゴリを指定（空欄の場合は問題番号から自動抽出）
            </p>
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
            <label className="block text-sm font-medium mb-2">カテゴリ</label>
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
              このグループ内のすべての問題に同じカテゴリが設定されます
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
              カテゴリ名 <span className="text-error">*</span>
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
              このカテゴリ内のすべての問題に適用されます
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

      <Modal
        isOpen={isBulkCategoryModalOpen}
        onClose={() => {
          setIsBulkCategoryModalOpen(false)
          setBulkCategoryValue('')
        }}
        title="選択した問題のカテゴリを変更"
      >
        <form onSubmit={handleBulkCategorySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              カテゴリ名
            </label>
            <input
              type="text"
              value={bulkCategoryValue}
              onChange={(e) => setBulkCategoryValue(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 言語（空欄の場合はカテゴリをクリア）"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              選択した問題すべてに同じカテゴリを設定します
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              {selectedSections.size}セクション（{getSelectedProblems().length}問）が選択されています
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsBulkCategoryModalOpen(false)
                setBulkCategoryValue('')
              }}
            >
              キャンセル
            </Button>
            <Button type="submit">変更</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

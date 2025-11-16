import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Play, Trash2, Edit2, ChevronDown, ChevronRight } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import {
  getWorkbook,
  getProblems,
  addProblem,
  deleteProblem,
  db,
} from '@/lib/db'
import type { Workbook, Problem } from '@/types'

export default function WorkbookDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)
  const [formData, setFormData] = useState({
    problemNumber: '',
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
    page: '',
  })
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

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
        page: formData.page ? parseInt(formData.page) : undefined,
        memo: formData.memo || undefined,
      })
    } else {
      // 新規追加モード
      await addProblem({
        workbookId: id,
        problemNumber: formData.problemNumber,
        page: formData.page ? parseInt(formData.page) : undefined,
        memo: formData.memo || undefined,
      })
    }

    setFormData({ problemNumber: '', page: '', memo: '' })
    setEditingProblem(null)
    setIsModalOpen(false)
    loadData()
  }

  const handleEdit = (problem: Problem) => {
    setEditingProblem(problem)
    setFormData({
      problemNumber: problem.problemNumber,
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

    // グループ内の最初の問題のページ数を取得
    const firstProblemWithPage = groupProblems.find(p => p.page !== undefined)

    setGroupFormData({
      groupName: groupKey,
      page: firstProblemWithPage?.page?.toString() || '',
    })
    setIsGroupModalOpen(true)
  }

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingGroup) return

    const newPage = groupFormData.page ? parseInt(groupFormData.page) : undefined

    // グループ内のすべての問題のページ数を更新
    for (const problem of editingGroup.problems) {
      await db.problems.update(problem.id, {
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
    setGroupFormData({ groupName: '', page: '' })
    loadData()
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProblem(null)
    setFormData({ problemNumber: '', page: '', memo: '' })
  }

  const handleCloseGroupModal = () => {
    setIsGroupModalOpen(false)
    setEditingGroup(null)
    setGroupFormData({ groupName: '', page: '' })
  }

  // 問題番号から親カテゴリと目次タイトルを抽出
  const parseGroupInfo = (problemNumber: string) => {
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
      const { category, title } = parseGroupInfo(problem.problemNumber)

      if (!hierarchy[category]) {
        hierarchy[category] = {}
      }

      if (!hierarchy[category][title]) {
        hierarchy[category][title] = []
      }

      hierarchy[category][title].push(problem)
    })

    // 各グループ内の問題を数値でソート
    Object.keys(hierarchy).forEach((category) => {
      Object.keys(hierarchy[category]).forEach((title) => {
        hierarchy[category][title].sort((a, b) => {
          // 問題番号の最後の数値部分を抽出して比較
          const getLastNumber = (problemNumber: string) => {
            const parts = problemNumber.split('-')
            const lastPart = parts[parts.length - 1]
            const num = parseInt(lastPart)
            return isNaN(num) ? 0 : num
          }

          const numA = getLastNumber(a.problemNumber)
          const numB = getLastNumber(b.problemNumber)

          // 数値で比較
          if (numA !== numB) {
            return numA - numB
          }

          // 数値が同じ場合はページ番号で比較
          if (a.page !== undefined && b.page !== undefined) {
            return a.page - b.page
          }

          // ページ番号がない場合は文字列で比較
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
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={20} className="mr-2" />
            問題を追加
          </Button>
        </div>
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
                <div
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center gap-3">
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
                              className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/50 transition-colors"
                              onClick={() => toggleTitle(titleKey)}
                            >
                              <div className="flex items-center gap-3">
                                {isTitleExpanded ? (
                                  <ChevronDown size={16} className="text-gray-600" />
                                ) : (
                                  <ChevronRight size={16} className="text-gray-600" />
                                )}
                                <h3 className="font-semibold">{title}</h3>
                                {firstProblemWithPage?.page && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                    p.{firstProblemWithPage.page}
                                  </span>
                                )}
                                <span className="text-sm text-gray-500">
                                  {titleProblems.length}問
                                </span>
                              </div>
                              <div
                                className="flex items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
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
                                {titleProblems.map((problem) => (
                                  <div
                                    key={problem.id}
                                    className="flex items-center justify-between p-2 bg-white rounded hover:bg-secondary/50 transition-colors"
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                          {problem.problemNumber.split('-').pop()}
                                        </span>
                                      </div>
                                      {problem.memo && (
                                        <p className="text-xs text-gray-600 mt-1">
                                          {problem.memo}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1">
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
                                ))}
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
    </div>
  )
}

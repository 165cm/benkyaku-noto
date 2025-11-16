import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, Play, Trash2, Edit2 } from 'lucide-react'
import Card from '@/components/Card'
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

  const handleStartStudy = (problemId: string) => {
    navigate(`/study/${problemId}`)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProblem(null)
    setFormData({ problemNumber: '', page: '', memo: '' })
  }

  // 問題を階層構造にグループ化
  const groupProblemsByHierarchy = () => {
    const groups: { [key: string]: Problem[] } = {}

    problems.forEach((problem) => {
      // 問題番号から章や節を抽出（例: "第1章-基本問題-1" → "第1章"）
      const parts = problem.problemNumber.split('-')
      const groupKey = parts.length > 1 ? parts[0] : '問題'

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(problem)
    })

    return groups
  }

  const problemGroups = groupProblemsByHierarchy()

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
        <div className="space-y-6">
          {Object.entries(problemGroups).map(([groupName, groupProblems]) => (
            <div key={groupName}>
              <h2 className="text-lg font-semibold mb-3 pb-2 border-b border-border">
                {groupName}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({groupProblems.length}問)
                </span>
              </h2>
              <div className="space-y-2">
                {groupProblems.map((problem) => (
                  <Card
                    key={problem.id}
                    className="flex items-center justify-between hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{problem.problemNumber}</h3>
                        {problem.page && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            p.{problem.page}
                          </span>
                        )}
                      </div>
                      {problem.memo && (
                        <p className="text-sm text-gray-600 mt-1">{problem.memo}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleStartStudy(problem.id)}
                      >
                        <Play size={16} className="mr-1" />
                        学習
                      </Button>
                      <button
                        onClick={() => handleEdit(problem)}
                        className="p-2 hover:bg-blue-100 rounded transition-colors"
                      >
                        <Edit2 size={16} className="text-primary" />
                      </button>
                      <button
                        onClick={() => handleDelete(problem.id)}
                        className="p-2 hover:bg-red-100 rounded transition-colors"
                      >
                        <Trash2 size={16} className="text-error" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
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
    </div>
  )
}

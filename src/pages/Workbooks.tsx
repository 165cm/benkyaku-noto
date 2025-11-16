import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Image } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { getWorkbooks, addWorkbook, deleteWorkbook, getProblems } from '@/lib/db'
import { calculateRecentAccuracyForProblems } from '@/lib/review'
import type { Workbook } from '@/types'

export default function Workbooks() {
  const navigate = useNavigate()
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
  })
  const [workbookAccuracies, setWorkbookAccuracies] = useState<Map<string, number | null>>(new Map())

  useEffect(() => {
    loadWorkbooks()
  }, [])

  // 各問題集の直近回答の正解率を計算
  useEffect(() => {
    const calculateAccuracies = async () => {
      const accuracyMap = new Map<string, number | null>()

      for (const workbook of workbooks) {
        const problems = await getProblems(workbook.id)
        if (problems.length > 0) {
          const accuracy = await calculateRecentAccuracyForProblems(problems)
          accuracyMap.set(workbook.id, accuracy)
        } else {
          accuracyMap.set(workbook.id, null)
        }
      }

      setWorkbookAccuracies(accuracyMap)
    }

    if (workbooks.length > 0) {
      calculateAccuracies()
    } else {
      setWorkbookAccuracies(new Map())
    }
  }, [workbooks])

  const loadWorkbooks = async () => {
    const data = await getWorkbooks()
    setWorkbooks(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    await addWorkbook({
      title: formData.title,
      subject: formData.subject,
      totalProblems: 0,
    })

    setFormData({ title: '', subject: '' })
    setIsModalOpen(false)
    loadWorkbooks()
  }

  const handleDelete = async (id: string) => {
    if (confirm('この問題集を削除しますか？関連する問題と学習記録もすべて削除されます。')) {
      await deleteWorkbook(id)
      loadWorkbooks()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">問題集</h1>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/workbooks/import')}
          >
            <Image size={20} className="mr-2" />
            目次からインポート
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={20} className="mr-2" />
            新規作成
          </Button>
        </div>
      </div>

      {workbooks.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">問題集がありません</p>
          <Button onClick={() => setIsModalOpen(true)}>
            最初の問題集を作成
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {workbooks.map((workbook) => (
            <div
              key={workbook.id}
              className="bg-white border border-border rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between p-4">
                {/* 左側：タイトルと科目 */}
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/workbooks/${workbook.id}`)}
                >
                  <h3 className="font-semibold text-lg">{workbook.title}</h3>
                  <p className="text-sm text-gray-600">{workbook.subject}</p>
                </div>

                {/* 右側：ラベル群 */}
                <div className="flex items-center gap-2">
                  {/* 正解率 */}
                  {(() => {
                    const accuracy = workbookAccuracies.get(workbook.id)
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

                  {/* 問題数 */}
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    {workbook.totalProblems}問
                  </span>

                  {/* 削除ボタン */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(workbook.id)
                    }}
                    className="p-2 hover:bg-red-100 rounded transition-colors"
                  >
                    <Trash2 size={16} className="text-error" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="問題集の新規作成"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              問題集名 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 数学I・A 総合問題集"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              科目 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.subject}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: 数学"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="submit">作成</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

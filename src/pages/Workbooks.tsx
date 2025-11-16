import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2 } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { getWorkbooks, addWorkbook, deleteWorkbook } from '@/lib/db'
import type { Workbook } from '@/types'

export default function Workbooks() {
  const navigate = useNavigate()
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
  })

  useEffect(() => {
    loadWorkbooks()
  }, [])

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
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={20} className="mr-2" />
          新規作成
        </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workbooks.map((workbook) => (
            <Card
              key={workbook.id}
              hover
              className="cursor-pointer relative group"
            >
              <div onClick={() => navigate(`/workbooks/${workbook.id}`)}>
                <h3 className="font-semibold text-lg mb-2">{workbook.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{workbook.subject}</p>
                <p className="text-sm text-gray-500">
                  問題数: {workbook.totalProblems}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(workbook.id)
                }}
                className="absolute top-2 right-2 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
              >
                <Trash2 size={16} className="text-error" />
              </button>
            </Card>
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

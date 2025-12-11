import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { getDeletedProblems, restoreProblem, permanentlyDeleteProblem, getWorkbook, emptyTrash } from '@/lib/db'
import { toast } from '@/store/toastStore'
import type { Problem } from '@/types'

export default function Trash() {
  const navigate = useNavigate()
  const { confirm, dialogProps } = useConfirmDialog()
  const [deletedProblems, setDeletedProblems] = useState<Problem[]>([])
  const [workbookNames, setWorkbookNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const problems = await getDeletedProblems()
    setDeletedProblems(problems)

    // 問題集名を取得
    const names = new Map<string, string>()
    for (const problem of problems) {
      if (!names.has(problem.workbookId)) {
        const workbook = await getWorkbook(problem.workbookId)
        if (workbook) {
          names.set(problem.workbookId, workbook.title)
        }
      }
    }
    setWorkbookNames(names)
    setLoading(false)
  }

  const handleRestore = async (id: string) => {
    const confirmed = await confirm({
      title: '問題の復元',
      message: 'この問題を復元しますか？',
      confirmText: '復元',
    })
    if (confirmed) {
      await restoreProblem(id)
      await loadData()
      toast.success('復元完了', '問題を復元しました')
    }
  }

  const handlePermanentDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '完全削除の確認',
      message: 'この問題を完全に削除しますか？\n\nこの操作は元に戻せません。学習記録も削除されます。',
      confirmText: '完全削除',
      variant: 'danger',
    })
    if (confirmed) {
      await permanentlyDeleteProblem(id)
      await loadData()
      toast.success('削除完了', '問題を完全に削除しました')
    }
  }

  const handleEmptyTrash = async () => {
    const confirmed = await confirm({
      title: 'ゴミ箱を空にする',
      message: `${deletedProblems.length}件の問題と学習記録が完全に削除されます。\n\nこの操作は取り消せません。`,
      confirmText: '空にする',
      variant: 'danger',
    })
    if (confirmed) {
      await emptyTrash()
      await loadData()
      toast.success('ゴミ箱を空にしました', `${deletedProblems.length}件の問題を削除しました`)
    }
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <div className="mb-6">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/settings')}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          設定に戻る
        </Button>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">ゴミ箱</h1>
            <p className="text-gray-600">削除した問題を復元または完全に削除できます</p>
          </div>
          {deletedProblems.length > 0 && (
            <Button
              variant="error"
              onClick={handleEmptyTrash}
            >
              <Trash2 size={16} className="mr-2" />
              ゴミ箱を空にする
            </Button>
          )}
        </div>
      </div>

      {deletedProblems.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Trash2 size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">ゴミ箱は空です</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {deletedProblems.map((problem) => (
            <Card key={problem.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">
                      問題 {problem.problemNumber}
                    </h3>
                    {problem.page && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded whitespace-nowrap">
                        p.{problem.page}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">
                    {workbookNames.get(problem.workbookId) || '不明な問題集'}
                  </p>
                  {problem.memo && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{problem.memo}</p>
                  )}
                  {problem.deletedAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      削除日時: {formatDate(problem.deletedAt)}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestore(problem.id)}
                  >
                    <RotateCcw size={16} className="mr-1" />
                    復元
                  </Button>
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => handlePermanentDelete(problem.id)}
                  >
                    <Trash2 size={16} className="mr-1" />
                    完全削除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="font-semibold text-yellow-900 mb-2">💡 ヒント</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• 削除した問題はここに30日間保管されます</li>
          <li>• 「復元」ボタンで問題を元に戻せます</li>
          <li>• 「完全削除」すると学習記録も含めて削除されます（復元不可）</li>
        </ul>
      </div>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

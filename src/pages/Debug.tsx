import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { db } from '@/lib/db'
import type { Problem, Workbook } from '@/types'

interface ProblemWithWorkbook extends Problem {
  workbookTitle?: string
}

export default function Debug() {
  const navigate = useNavigate()
  const [problems, setProblems] = useState<ProblemWithWorkbook[]>([])
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const allProblems = await db.problems.toArray()
    const allWorkbooks = await db.workbooks.toArray()

    // 問題集のタイトルを追加
    const problemsWithWorkbook = allProblems.map(p => ({
      ...p,
      workbookTitle: allWorkbooks.find(w => w.id === p.workbookId)?.title
    }))

    // 作成日時順にソート
    problemsWithWorkbook.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    setProblems(problemsWithWorkbook)
    setWorkbooks(allWorkbooks)
  }

  const filteredProblems = selectedWorkbookId === 'all'
    ? problems
    : problems.filter(p => p.workbookId === selectedWorkbookId)

  const activeProblems = filteredProblems.filter(p => !p.deletedAt)
  const deletedProblems = filteredProblems.filter(p => p.deletedAt)

  return (
    <div>
      <div className="mb-6">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/')}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          戻る
        </Button>

        <h1 className="text-2xl font-bold mb-4">デバッグ - 問題データ一覧</h1>

        <div className="flex gap-4 mb-4">
          <select
            value={selectedWorkbookId}
            onChange={(e) => setSelectedWorkbookId(e.target.value)}
            className="px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">全ての問題集</option>
            {workbooks.map(w => (
              <option key={w.id} value={w.id}>{w.title}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-gray-600">総問題数</p>
            <p className="text-3xl font-bold">{filteredProblems.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-600">有効な問題</p>
            <p className="text-3xl font-bold text-green-600">{activeProblems.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-600">削除済み</p>
            <p className="text-3xl font-bold text-red-600">{deletedProblems.length}</p>
          </Card>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">有効な問題 ({activeProblems.length})</h2>
      <div className="space-y-2 mb-8">
        {activeProblems.map(problem => (
          <Card key={problem.id} className="p-4">
            <div className="grid grid-cols-12 gap-2 text-sm">
              <div className="col-span-3">
                <p className="text-xs text-gray-500">問題集</p>
                <p className="font-medium">{problem.workbookTitle}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500">問題番号</p>
                <p className="font-medium">{problem.problemNumber}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500">カテゴリ</p>
                <p className="font-medium">{problem.category || '-'}</p>
              </div>
              <div className="col-span-1">
                <p className="text-xs text-gray-500">ページ</p>
                <p className="font-medium">{problem.page || '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500">親問題ID</p>
                <p className="font-mono text-xs">{problem.parentProblemId ? problem.parentProblemId.slice(0, 8) : '-'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-500">メモ</p>
                <p className="truncate">{problem.memo || '-'}</p>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              ID: {problem.id} | 作成: {problem.createdAt.toLocaleString()}
            </div>
          </Card>
        ))}
      </div>

      {deletedProblems.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-4 text-red-600">削除済みの問題 ({deletedProblems.length})</h2>
          <div className="space-y-2">
            {deletedProblems.map(problem => (
              <Card key={problem.id} className="p-4 bg-red-50">
                <div className="grid grid-cols-12 gap-2 text-sm">
                  <div className="col-span-3">
                    <p className="text-xs text-gray-500">問題集</p>
                    <p className="font-medium">{problem.workbookTitle}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">問題番号</p>
                    <p className="font-medium">{problem.problemNumber}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">カテゴリ</p>
                    <p className="font-medium">{problem.category || '-'}</p>
                  </div>
                  <div className="col-span-1">
                    <p className="text-xs text-gray-500">ページ</p>
                    <p className="font-medium">{problem.page || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">親問題ID</p>
                    <p className="font-mono text-xs">{problem.parentProblemId ? problem.parentProblemId.slice(0, 8) : '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">削除日時</p>
                    <p className="text-xs">{problem.deletedAt?.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ID: {problem.id} | 作成: {problem.createdAt.toLocaleString()}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

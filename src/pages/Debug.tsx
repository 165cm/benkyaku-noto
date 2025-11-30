import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { db } from '@/lib/db'
import type { Problem, Workbook, StudyRecord } from '@/types'

interface ProblemWithWorkbook extends Problem {
  workbookTitle?: string
}

interface StudyRecordWithInfo extends StudyRecord {
  problemNumber?: string
  workbookTitle?: string
}

export default function Debug() {
  const navigate = useNavigate()
  const [problems, setProblems] = useState<ProblemWithWorkbook[]>([])
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [studyRecords, setStudyRecords] = useState<StudyRecordWithInfo[]>([])
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'problems' | 'records'>('problems')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const allProblems = await db.problems.toArray()
    const allWorkbooks = await db.workbooks.toArray()
    const allRecords = await db.studyRecords.toArray()

    // 問題集のタイトルを追加
    const problemsWithWorkbook = allProblems.map(p => ({
      ...p,
      workbookTitle: allWorkbooks.find(w => w.id === p.workbookId)?.title
    }))

    // 作成日時順にソート
    problemsWithWorkbook.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // 学習記録に問題番号と問題集タイトルを追加
    const recordsWithInfo = allRecords.map(r => ({
      ...r,
      problemNumber: allProblems.find(p => p.id === r.problemId)?.problemNumber,
      workbookTitle: allWorkbooks.find(w => w.id === r.workbookId)?.title
    }))

    // 学習日時の新しい順にソート
    recordsWithInfo.sort((a, b) => b.studiedAt.getTime() - a.studiedAt.getTime())

    setProblems(problemsWithWorkbook)
    setWorkbooks(allWorkbooks)
    setStudyRecords(recordsWithInfo)
  }

  const filteredProblems = selectedWorkbookId === 'all'
    ? problems
    : problems.filter(p => p.workbookId === selectedWorkbookId)

  const filteredRecords = selectedWorkbookId === 'all'
    ? studyRecords
    : studyRecords.filter(r => r.workbookId === selectedWorkbookId)

  const activeProblems = filteredProblems.filter(p => !p.deletedAt)
  const deletedProblems = filteredProblems.filter(p => p.deletedAt)

  const resultLabel = (result: string) => {
    switch(result) {
      case 'correct': return '◯'
      case 'partial': return '△'
      case 'incorrect': return '×'
      default: return result
    }
  }

  const resultColor = (result: string) => {
    switch(result) {
      case 'correct': return 'text-green-600'
      case 'partial': return 'text-yellow-600'
      case 'incorrect': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

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

        <h1 className="text-2xl font-bold mb-4">デバッグ - データ一覧</h1>

        <div className="flex gap-4 mb-4">
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'problems' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('problems')}
            >
              問題データ
            </Button>
            <Button
              variant={viewMode === 'records' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('records')}
            >
              学習記録
            </Button>
          </div>
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

        {viewMode === 'problems' ? (
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
        ) : (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-sm text-gray-600">学習記録数</p>
              <p className="text-3xl font-bold">{filteredRecords.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-600">正解</p>
              <p className="text-3xl font-bold text-green-600">
                {filteredRecords.filter(r => r.result === 'correct').length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-600">不正解</p>
              <p className="text-3xl font-bold text-red-600">
                {filteredRecords.filter(r => r.result === 'incorrect').length}
              </p>
            </Card>
          </div>
        )}
      </div>

      {viewMode === 'problems' ? (
        <>
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
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold mb-4">学習記録 ({filteredRecords.length})</h2>
          {filteredRecords.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-500">学習記録がありません</p>
              <p className="text-sm text-gray-400 mt-2">問題を学習すると、ここに記録が表示されます</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredRecords.map(record => (
                <Card key={record.id} className="p-4">
                  <div className="grid grid-cols-12 gap-2 text-sm">
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">問題集</p>
                      <p className="font-medium truncate">{record.workbookTitle}</p>
                    </div>
                    <div className="col-span-1">
                      <p className="text-xs text-gray-500">問題</p>
                      <p className="font-medium">{record.problemNumber}</p>
                    </div>
                    <div className="col-span-1">
                      <p className="text-xs text-gray-500">結果</p>
                      <p className={`font-bold text-lg ${resultColor(record.result)}`}>
                        {resultLabel(record.result)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">学習時間</p>
                      <p className="font-medium">{Math.floor(record.studyTime / 60)}分{record.studyTime % 60}秒</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs text-gray-500">学習日時</p>
                      <p className="font-medium">{record.studiedAt.toLocaleString('ja-JP')}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs text-gray-500">メモ</p>
                      <p className="truncate">{record.memo || '-'}</p>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    ID: {record.id}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Circle, Triangle, X, Clock } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { getProblem, getWorkbook, addStudyRecord, getStudyRecords } from '@/lib/db'
import type { Problem, Workbook, StudyRecord, StudyResult } from '@/types'

export default function Study() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [problem, setProblem] = useState<Problem | null>(null)
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [studyRecords, setStudyRecords] = useState<StudyRecord[]>([])
  const [startTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(timer)
  }, [startTime])

  const loadData = async () => {
    if (!id) return

    const problemData = await getProblem(id)
    if (problemData) {
      setProblem(problemData)

      const workbookData = await getWorkbook(problemData.workbookId)
      setWorkbook(workbookData || null)

      const records = await getStudyRecords(id)
      setStudyRecords(records)
    }
  }

  const handleRecord = async (result: StudyResult) => {
    if (!problem) return

    const studyTime = elapsedTime

    await addStudyRecord({
      problemId: problem.id,
      workbookId: problem.workbookId,
      result,
      studyTime,
      memo: memo || undefined,
    })

    // 戻る
    navigate(`/workbooks/${problem.workbookId}`)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getResultIcon = (result: StudyResult) => {
    switch (result) {
      case 'correct':
        return <Circle className="text-success" size={16} />
      case 'partial':
        return <Triangle className="text-warning" size={16} />
      case 'incorrect':
        return <X className="text-error" size={16} />
    }
  }

  const getResultText = (result: StudyResult) => {
    switch (result) {
      case 'correct':
        return '正解'
      case 'partial':
        return '部分正解'
      case 'incorrect':
        return '不正解'
    }
  }

  if (!problem || !workbook) {
    return <div>読み込み中...</div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate(`/workbooks/${problem.workbookId}`)}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        戻る
      </Button>

      <Card className="mb-6">
        <div className="mb-4">
          <p className="text-sm text-gray-600">{workbook.title}</p>
          <h1 className="text-2xl font-bold">問題 {problem.problemNumber}</h1>
          {problem.memo && (
            <p className="text-gray-600 mt-2">{problem.memo}</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-gray-600">
          <Clock size={20} />
          <span className="text-lg font-mono">{formatTime(elapsedTime)}</span>
        </div>
      </Card>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">解答結果を記録</h2>
        <div className="grid grid-cols-3 gap-3">
          <Button
            variant="success"
            size="lg"
            onClick={() => handleRecord('correct')}
            className="flex flex-col items-center gap-2 h-24"
          >
            <Circle size={32} />
            <span>正解</span>
          </Button>
          <Button
            variant="warning"
            size="lg"
            onClick={() => handleRecord('partial')}
            className="flex flex-col items-center gap-2 h-24"
          >
            <Triangle size={32} />
            <span>部分正解</span>
          </Button>
          <Button
            variant="error"
            size="lg"
            onClick={() => handleRecord('incorrect')}
            className="flex flex-col items-center gap-2 h-24"
          >
            <X size={32} />
            <span>不正解</span>
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">メモ</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary h-24"
          placeholder="間違えた点や気づきなど（任意）"
        />
      </div>

      {studyRecords.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">学習履歴</h2>
          <div className="space-y-2">
            {studyRecords.map((record) => (
              <Card key={record.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getResultIcon(record.result)}
                  <div>
                    <p className="font-medium">{getResultText(record.result)}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(record.studiedAt).toLocaleString('ja-JP')} ·{' '}
                      {formatTime(record.studyTime)}
                    </p>
                    {record.memo && (
                      <p className="text-sm text-gray-600 mt-1">{record.memo}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

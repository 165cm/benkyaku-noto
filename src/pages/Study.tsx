import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Circle, Triangle, X, Clock, Pause, Play, Edit2, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { getProblem, getWorkbook, addStudyRecord, getStudyRecords, updateStudyRecord, deleteStudyRecord, db } from '@/lib/db'
import {
  getSession,
  addResult,
  isSessionComplete,
  getNextProblemId,
} from '@/lib/studySession'
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
  const [timeExpired, setTimeExpired] = useState(false)

  // 一時停止機能
  const [isPaused, setIsPaused] = useState(false)
  const [pausedTime, setPausedTime] = useState(0) // 累計一時停止時間（秒）
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null) // 一時停止開始時刻（ミリ秒）

  // 編集機能
  const [editingRecord, setEditingRecord] = useState<StudyRecord | null>(null)
  const [editResult, setEditResult] = useState<StudyResult>('correct')
  const [editTime, setEditTime] = useState('')
  const [editMemo, setEditMemo] = useState('')

  useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

  useEffect(() => {
    if (isPaused) return // 一時停止中は何もしない

    const timer = setInterval(() => {
      // 一時停止中でない場合のみ時間を更新
      const rawElapsed = Math.floor((Date.now() - startTime) / 1000)
      const actualElapsed = rawElapsed - pausedTime
      setElapsedTime(actualElapsed)

      // セッションがある場合、制限時間をチェック
      const session = getSession()
      if (session && !timeExpired) {
        const targetSeconds = session.targetMinutes * 60
        if (actualElapsed >= targetSeconds) {
          setTimeExpired(true)
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [startTime, timeExpired, isPaused, pausedTime])

  // キーボードショートカット
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // テキスト入力中は無効
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (e.key === '1') {
        handleRecord('correct')
      } else if (e.key === '2') {
        handleRecord('partial')
      } else if (e.key === '3') {
        handleRecord('incorrect')
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [problem, elapsedTime, memo])

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

  // 一時停止/再開のハンドラー
  const togglePause = () => {
    if (isPaused) {
      // 再開
      if (pauseStartTime !== null) {
        const pauseDuration = Math.floor((Date.now() - pauseStartTime) / 1000)
        setPausedTime((prev) => prev + pauseDuration)
        setPauseStartTime(null)
      }
      setIsPaused(false)
    } else {
      // 一時停止
      setPauseStartTime(Date.now())
      setIsPaused(true)
    }
  }

  // 編集モーダルを開く
  const openEditModal = (record: StudyRecord) => {
    setEditingRecord(record)
    setEditResult(record.result)
    setEditTime(formatTime(record.studyTime))
    setEditMemo(record.memo || '')
  }

  // 編集を保存
  const handleSaveEdit = async () => {
    if (!editingRecord) return

    // 時間を秒に変換
    const [mins, secs] = editTime.split(':').map(Number)
    const studyTime = (mins || 0) * 60 + (secs || 0)

    await updateStudyRecord(editingRecord.id, {
      result: editResult,
      studyTime,
      memo: editMemo || undefined,
    })

    setEditingRecord(null)
    await loadData()
  }

  // 編集をキャンセル
  const cancelEdit = () => {
    setEditingRecord(null)
  }

  // 学習記録を削除
  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('この学習記録を削除しますか？')) return

    await deleteStudyRecord(recordId)
    await loadData()
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

    // セッション管理の確認
    const session = getSession()
    if (session) {
      // セッション結果に追加
      addResult(problem.id, result, studyTime)

      // セッションが完了したかチェック
      if (isSessionComplete(session)) {
        // レポートページへ
        navigate('/study-report')
        return
      }

      // 次の問題へ
      const nextProblemId = getNextProblemId(session)
      if (nextProblemId) {
        navigate(`/study/${nextProblemId}`)
        return
      }

      // 問題がない場合はレポートへ
      navigate('/study-report')
      return
    }

    // セッションがない場合（初回学習モード）は次の未学習問題を探す
    const allProblems = await db.problems
      .where('workbookId')
      .equals(problem.workbookId)
      .toArray()

    // ページ番号と問題番号でソート
    allProblems.sort((a, b) => {
      // ページ番号でソート（優先）
      if (a.page !== undefined && b.page !== undefined) {
        if (a.page !== b.page) {
          return a.page - b.page
        }
      }
      // ページ番号がある方を優先
      if (a.page !== undefined && b.page === undefined) return -1
      if (a.page === undefined && b.page !== undefined) return 1

      // 問題番号の最後の数値部分で比較
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

    // 次の未学習問題を探す
    for (const p of allProblems) {
      const records = await db.studyRecords
        .where('problemId')
        .equals(p.id)
        .toArray()

      if (records.length === 0) {
        // 未学習の問題が見つかった
        navigate(`/study/${p.id}`)
        return
      }
    }

    // 未学習問題がない場合は問題集詳細ページに戻る
    navigate(`/workbooks/${problem.workbookId}`)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(Math.abs(seconds) / 60)
    const secs = Math.abs(seconds) % 60
    const sign = seconds < 0 ? '-' : ''
    return `${sign}${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 表示する時間を計算（セッションがある場合はカウントダウン）
  const getDisplayTime = () => {
    const session = getSession()
    if (session) {
      const targetSeconds = session.targetMinutes * 60
      const remaining = targetSeconds - elapsedTime
      return remaining
    }
    return elapsedTime
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
      {/* 時間終了メッセージ */}
      {timeExpired && (
        <div className="mb-4 p-4 bg-orange-50 border-2 border-orange-400 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-orange-600" />
            <div>
              <p className="text-lg font-bold text-orange-900">時間です！</p>
              <p className="text-sm text-orange-700">
                この問題がとき終わったら終了してください
              </p>
            </div>
          </div>
        </div>
      )}

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

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-600">
            <Clock size={20} />
            <span className={`text-lg font-mono ${getDisplayTime() < 0 ? 'text-red-600 font-bold' : ''}`}>
              {getSession() ? '残り ' : '経過 '}
              {formatTime(getDisplayTime())}
            </span>
            {isPaused && (
              <span className="text-sm text-orange-600 font-medium ml-2">
                一時停止中
              </span>
            )}
          </div>

          <Button
            variant={isPaused ? "primary" : "secondary"}
            size="sm"
            onClick={togglePause}
          >
            {isPaused ? (
              <>
                <Play size={16} className="mr-1" />
                再開
              </>
            ) : (
              <>
                <Pause size={16} className="mr-1" />
                一時停止
              </>
            )}
          </Button>
        </div>
      </Card>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">解答結果を記録</h2>
          <p className="text-xs text-gray-500">
            キーボード: 1=正解, 2=部分正解, 3=不正解
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Button
            variant="success"
            size="lg"
            onClick={() => handleRecord('correct')}
            className="flex flex-col items-center gap-2 h-24 relative"
          >
            <Circle size={32} />
            <span>正解</span>
            <span className="absolute top-2 right-2 text-xs opacity-70">1</span>
          </Button>
          <Button
            variant="warning"
            size="lg"
            onClick={() => handleRecord('partial')}
            className="flex flex-col items-center gap-2 h-24 relative"
          >
            <Triangle size={32} />
            <span>部分正解</span>
            <span className="absolute top-2 right-2 text-xs opacity-70">2</span>
          </Button>
          <Button
            variant="error"
            size="lg"
            onClick={() => handleRecord('incorrect')}
            className="flex flex-col items-center gap-2 h-24 relative"
          >
            <X size={32} />
            <span>不正解</span>
            <span className="absolute top-2 right-2 text-xs opacity-70">3</span>
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
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditModal(record)}
                  >
                    <Edit2 size={16} />
                  </Button>
                  <Button
                    variant="error"
                    size="sm"
                    onClick={() => handleDeleteRecord(record.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">学習記録を編集</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">結果</label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={editResult === 'correct' ? 'success' : 'secondary'}
                    size="sm"
                    onClick={() => setEditResult('correct')}
                    className="flex flex-col items-center gap-1 h-16"
                  >
                    <Circle size={20} />
                    <span className="text-xs">正解</span>
                  </Button>
                  <Button
                    variant={editResult === 'partial' ? 'warning' : 'secondary'}
                    size="sm"
                    onClick={() => setEditResult('partial')}
                    className="flex flex-col items-center gap-1 h-16"
                  >
                    <Triangle size={20} />
                    <span className="text-xs">部分正解</span>
                  </Button>
                  <Button
                    variant={editResult === 'incorrect' ? 'error' : 'secondary'}
                    size="sm"
                    onClick={() => setEditResult('incorrect')}
                    className="flex flex-col items-center gap-1 h-16"
                  >
                    <X size={20} />
                    <span className="text-xs">不正解</span>
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  学習時間（分:秒）
                </label>
                <input
                  type="text"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="例: 5:30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">メモ</label>
                <textarea
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary h-20"
                  placeholder="メモ（任意）"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={cancelEdit}>
                  キャンセル
                </Button>
                <Button variant="primary" onClick={handleSaveEdit}>
                  保存
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Circle, Triangle, X, Pause, Play, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import PDFViewer from '@/components/PDFViewer'
import { getProblem, getWorkbook, addStudyRecord, getStudyRecords, updateStudyRecord, deleteStudyRecord, db, isParentProblem } from '@/lib/db'
import { getPDFUrl } from '@/lib/storage'
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [studyRecords, setStudyRecords] = useState<StudyRecord[]>([])
  const [startTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [sessionElapsedTime, setSessionElapsedTime] = useState(0)
  const [memo, setMemo] = useState('')
  const [timeExpired, setTimeExpired] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

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

  // ウィンドウがフォーカスされた時にデータを再読み込み（問題番号の編集が反映されるように）
  useEffect(() => {
    const handleFocus = () => {
      if (id) {
        loadData()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [id])

  useEffect(() => {
    if (isPaused) return // 一時停止中は何もしない

    const timer = setInterval(() => {
      // 一時停止中でない場合のみ時間を更新
      const rawElapsed = Math.floor((Date.now() - startTime) / 1000)
      const actualElapsed = rawElapsed - pausedTime
      setElapsedTime(actualElapsed)

      // セッション全体の経過時間を計算
      const session = getSession()
      if (session) {
        const sessionElapsed = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000)
        setSessionElapsedTime(sessionElapsed)

        // 制限時間をチェック
        if (!timeExpired) {
          const targetSeconds = session.targetMinutes * 60
          if (sessionElapsed >= targetSeconds) {
            setTimeExpired(true)
          }
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

      // PDF URLを動的に取得（期限切れ対策）
      if (workbookData?.pdfFileName) {
        try {
          const url = await getPDFUrl(problemData.workbookId, workbookData.pdfFileName)
          setPdfUrl(url)
        } catch (error) {
          console.error('PDF URL取得エラー:', error)
          setPdfUrl(null)
        }
      } else if (workbookData?.pdfUrl) {
        // 後方互換: pdfFileNameがない場合はpdfUrlから抽出して再取得
        try {
          const urlParts = decodeURIComponent(workbookData.pdfUrl).match(/\/([^/?]+)\?/)
          if (urlParts && urlParts[1]) {
            const fileName = urlParts[1]
            const url = await getPDFUrl(problemData.workbookId, fileName)
            setPdfUrl(url)
          } else {
            setPdfUrl(null)
          }
        } catch (error) {
          console.error('PDF URL取得エラー:', error)
          setPdfUrl(null)
        }
      } else {
        setPdfUrl(null)
      }

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

      // 更新後のセッションを再取得（currentIndexが更新されているため）
      const updatedSession = getSession()
      if (!updatedSession) {
        navigate('/study-report')
        return
      }

      // セッションが完了したかチェック
      if (isSessionComplete(updatedSession)) {
        // レポートページへ
        navigate('/study-report')
        return
      }

      // 次の問題へ
      const nextProblemId = getNextProblemId(updatedSession)
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

    // 削除された問題を除外
    const activeProblems = allProblems.filter(p => !p.deletedAt)

    // ページ番号と問題番号でソート
    activeProblems.sort((a, b) => {
      // ページ番号でソート（優先）
      if (a.page !== undefined && b.page !== undefined) {
        if (a.page !== b.page) {
          return a.page - b.page
        }
      }
      // ページ番号がある方を優先
      if (a.page !== undefined && b.page === undefined) return -1
      if (a.page === undefined && b.page !== undefined) return 1

      // 問題番号を階層的に比較（例: 1-1, 1-2, 2-1, 2-2の順）
      const partsA = a.problemNumber.split('-')
      const partsB = b.problemNumber.split('-')

      // 各階層を順番に数値として比較
      const maxLength = Math.max(partsA.length, partsB.length)
      for (let i = 0; i < maxLength; i++) {
        const partA = partsA[i] || ''
        const partB = partsB[i] || ''

        // 数値として解釈できる場合は数値比較
        const numA = parseInt(partA)
        const numB = parseInt(partB)

        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) {
            return numA - numB
          }
        } else {
          // 数値でない場合は文字列比較
          const cmp = partA.localeCompare(partB)
          if (cmp !== 0) {
            return cmp
          }
        }
      }

      // 完全に同じ
      return 0
    })

    // 次の未学習問題を探す
    for (const p of activeProblems) {
      // 親問題（箱）はスキップ
      const hasSubProblems = await isParentProblem(p.id)
      if (hasSubProblems) {
        continue
      }

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

  // 問題番号の表示用フォーマット
  const getDisplayProblemNumber = (problem: Problem) => {
    // sectionTitleがある場合は「セクション名-連番」形式
    if (problem.sectionTitle) {
      return `${problem.sectionTitle}-${problem.problemNumber}`
    }
    // sectionTitleがない場合はそのまま
    return problem.problemNumber
  }

  // セクションタイトルを取得
  const getSectionTitle = (problem: Problem) => {
    // sectionTitleフィールドがある場合はそれを使用（新データ構造）
    if (problem.sectionTitle) {
      return problem.sectionTitle
    }

    // categoryフィールドがある場合はそれを使用
    if (problem.category) {
      return problem.category
    }

    // 後方互換性：問題番号から抽出
    const parts = problem.problemNumber.split('-')

    // 小問の場合（例: "代金精算-3-1" → "代金精算"）
    if (parts.length >= 3) {
      return parts.slice(0, -2).join('-')
    }

    // 通常の問題（例: "代金精算-3" → "代金精算"）
    if (parts.length >= 2) {
      return parts.slice(0, -1).join('-')
    }

    // ハイフンがない場合は空文字
    return ''
  }

  if (!problem || !workbook) {
    return <div>読み込み中...</div>
  }

  // PDF機能は一時的に無効化（内部実装は保持）
  // const hasPDF = !!pdfUrl
  const hasPDF = false

  return (
    <div className={`mx-auto px-2 sm:px-4 max-w-2xl`}>
      <div>
        {/* 問題情報エリア */}
        <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/workbooks/${problem.workbookId}`)}
        >
          <ArrowLeft size={16} />
        </Button>
        <p className="text-sm text-gray-600 truncate mx-2">{workbook.title}</p>
        <button
          onClick={togglePause}
          className="p-2 rounded hover:bg-gray-100 transition-colors"
        >
          {isPaused ? <Play size={20} className="text-primary" /> : <Pause size={20} className="text-gray-600" />}
        </button>
      </div>

      {/* 時間終了メッセージ */}
      {timeExpired && (
        <div className="mb-3 p-3 bg-orange-50 border border-orange-400 rounded-lg">
          <p className="text-sm font-bold text-orange-900">⏰ 時間です！この問題で終了してください</p>
        </div>
      )}

      {/* 問題情報カード */}
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {getSectionTitle(problem) && (
              <p className="text-xs sm:text-sm text-gray-500 mb-1 truncate">
                {getSectionTitle(problem)}
              </p>
            )}
            <h1 className="text-xl sm:text-2xl font-bold truncate">
              問題 {getDisplayProblemNumber(problem)}
            </h1>
            {problem.memo && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{problem.memo}</p>
            )}
          </div>
          {/* ページ数を大きく表示 */}
          {problem.page && (
            <div className="flex-shrink-0 text-center bg-blue-50 border-2 border-blue-200 rounded-lg px-4 py-2">
              <p className="text-xs text-blue-600 font-medium">ページ</p>
              <p className="text-3xl sm:text-4xl font-bold text-blue-700">{problem.page}</p>
            </div>
          )}
        </div>

        {/* 時間表示 */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-3 text-center">
            {getSession() && (
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-xs text-purple-600">セッション時間</p>
                <p className="text-lg font-bold font-mono text-purple-700">
                  {formatTime(sessionElapsedTime)}
                </p>
              </div>
            )}
            <div className={`bg-gray-50 rounded-lg p-2 ${!getSession() ? 'col-span-2' : ''}`}>
              <p className="text-xs text-gray-600">この問題</p>
              <p className={`text-lg font-bold font-mono ${isPaused ? 'text-orange-600' : 'text-gray-700'}`}>
                {isPaused && '⏸ '}{formatTime(elapsedTime)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 解答ボタン */}
      <div className="space-y-2 mb-4">
        {/* 正解・不正解ボタン（大きめ、横並び） */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Button
            variant="success"
            size="lg"
            onClick={() => handleRecord('correct')}
            className="flex flex-col items-center gap-1 sm:gap-2 h-24 sm:h-28"
          >
            <Circle size={28} className="sm:w-10 sm:h-10" />
            <span className="text-base sm:text-lg font-bold">正解</span>
          </Button>
          <Button
            variant="error"
            size="lg"
            onClick={() => handleRecord('incorrect')}
            className="flex flex-col items-center gap-1 sm:gap-2 h-24 sm:h-28"
          >
            <X size={28} className="sm:w-10 sm:h-10" />
            <span className="text-base sm:text-lg font-bold">不正解</span>
          </Button>
        </div>
        {/* 部分正解ボタン（小さめ、中央配置） */}
        <div className="flex justify-center">
          <Button
            variant="warning"
            size="lg"
            onClick={() => handleRecord('partial')}
            className="flex items-center gap-2 h-12 sm:h-14 px-6"
          >
            <Triangle size={18} className="sm:w-5 sm:h-5" />
            <span className="text-sm sm:text-base">部分正解</span>
          </Button>
        </div>
      </div>

      {/* メモ入力（コンパクト） */}
      <div className="mb-4">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="メモ（任意）"
          rows={2}
        />
      </div>

      {/* 学習履歴（折りたたみ可能） */}
      {studyRecords.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors mb-2"
          >
            <span className="text-sm font-medium text-gray-700">
              学習履歴 ({studyRecords.length}回)
            </span>
            {showHistory ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {showHistory && (
            <div className="space-y-2 mb-4">
              {studyRecords.map((record) => (
                <Card key={record.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getResultIcon(record.result)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{getResultText(record.result)}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(record.studiedAt).toLocaleDateString('ja-JP')} · {formatTime(record.studyTime)}
                        </p>
                        {record.memo && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{record.memo}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(record)}
                        className="p-1.5 hover:bg-blue-100 rounded transition-colors"
                      >
                        <Edit2 size={14} className="text-primary" />
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="p-1.5 hover:bg-red-100 rounded transition-colors"
                      >
                        <Trash2 size={14} className="text-error" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
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

        {/* PDFビューアエリア */}
        {hasPDF && pdfUrl && (
          <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
            <PDFViewer
              pdfUrl={pdfUrl}
              initialPage={problem.page || 1}
            />
          </div>
        )}
      </div>
    </div>
  )
}

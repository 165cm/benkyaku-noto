import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Circle, Triangle, X, Pause, Play, Edit2, Trash2, LogOut, Star, Undo2, Tags } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import PDFViewer from '@/components/PDFViewer'
import { getProblem, getWorkbook, addStudyRecord, getStudyRecords, updateStudyRecord, deleteStudyRecord, db, isParentProblem, toggleBookmark, addTagToProblem, removeTagFromProblem } from '@/lib/db'
import { getPDFUrl } from '@/lib/storage'
import { getNextWeakProblem, getTodayStudyTime } from '@/lib/review'
import {
  createWeakModeSession,
  getWeakModeSession,
  addWeakModeResult,
} from '@/lib/weakModeSession'
import {
  getSession,
  addResult,
  isSessionComplete,
  getNextProblemId,
  clearSession,
} from '@/lib/studySession'
import type { Problem, Workbook, StudyRecord, StudyResult } from '@/types'

export default function Study() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isWeakMode = searchParams.get('mode') === 'weak'
  const [problem, setProblem] = useState<Problem | null>(null)
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [studyRecords, setStudyRecords] = useState<StudyRecord[]>([])
  const [startTime, setStartTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [sessionElapsedTime, setSessionElapsedTime] = useState(0)
  const [todayStudyTime, setTodayStudyTime] = useState(0) // 1日の学習時間（3時リセット）
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

  // 回答処理中フラグ（二重クリック防止）
  const [isProcessing, setIsProcessing] = useState(false)

  // Undo機能（履歴スタック）
  const [problemHistory, setProblemHistory] = useState<string[]>([])

  // タグ入力（インライン）
  const [showCustomTagInput, setShowCustomTagInput] = useState(false)
  const [customTag, setCustomTag] = useState('')

  // よく使うタグのプリセット
  const COMMON_TAGS = [
    '計算ミス',
    '解き方を調べた',
    'ケアレスミス',
    '時間がかかる',
    '要復習',
  ]

  useEffect(() => {
    if (id) {
      // 古いセッションをクリア（6時間以上前のセッション）
      const session = getSession()
      if (session) {
        const sessionAge = Date.now() - new Date(session.startTime).getTime()
        const sixHoursInMs = 6 * 60 * 60 * 1000
        if (sessionAge > sixHoursInMs) {
          console.log('古いセッションをクリアしました（6時間以上経過）')
          clearSession()
        }
      }

      loadData()
      // 問題が変わったらタイマーをリセット
      setStartTime(Date.now())
      setElapsedTime(0)
      setPausedTime(0)
      setPauseStartTime(null)
      setIsPaused(false)
      setMemo('')
      setShowHistory(false)

      // 1日の学習時間を初回ロード
      getTodayStudyTime().then(setTodayStudyTime)

      // 苦手克服モードの場合、セッションがなければ作成
      if (isWeakMode && !getWeakModeSession()) {
        createWeakModeSession()
      }
    }
  }, [id, isWeakMode])

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

    const timer = setInterval(async () => {
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

      // 1日の学習時間を更新（現在の問題の経過時間を含める）
      const baseTodayTime = await getTodayStudyTime()
      setTodayStudyTime(baseTodayTime + actualElapsed)
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
  }, [problem, elapsedTime, memo, isWeakMode])

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

  // ブックマークをトグル
  const handleToggleBookmark = async () => {
    if (!problem) return
    await toggleBookmark(problem.id)
    await loadData()
  }

  // タグをトグル（追加/削除）
  const handleToggleTag = async (tag: string) => {
    if (!problem) return
    const currentTags = problem.tags || []
    if (currentTags.includes(tag)) {
      await removeTagFromProblem(problem.id, tag)
    } else {
      await addTagToProblem(problem.id, tag)
    }
    await loadData()
  }

  // カスタムタグを追加
  const handleAddCustomTag = async () => {
    if (!problem || !customTag.trim()) return
    await addTagToProblem(problem.id, customTag.trim())
    setCustomTag('')
    setShowCustomTagInput(false)
    await loadData()
  }

  // 前の問題に戻る（Undo）
  const handleUndo = () => {
    if (problemHistory.length === 0) return
    const previousProblemId = problemHistory[problemHistory.length - 1]
    setProblemHistory(prev => prev.slice(0, -1))
    navigate(`/study/${previousProblemId}${isWeakMode ? '?mode=weak' : ''}`)
  }

  // 学習記録を削除
  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('この学習記録を削除しますか？')) return

    await deleteStudyRecord(recordId)
    await loadData()
  }

  const handleRecord = async (result: StudyResult) => {
    if (!problem || isProcessing) return

    setIsProcessing(true)
    try {
      // 履歴に現在の問題を追加（Undo用）
      setProblemHistory(prev => [...prev, problem.id])

      const studyTime = elapsedTime
      const currentProblemId = problem.id
      const currentWorkbookId = problem.workbookId
      const currentMemo = memo

    // 苦手克服モードの場合、前回の結果と回答数を取得
    let previousResult: StudyResult | null = null
    let previousAttempts = 0
    if (isWeakMode) {
      const records = await getStudyRecords(currentProblemId)
      previousAttempts = records.length
      if (records.length > 0) {
        previousResult = records[0].result // 最新の記録
      }
    }

    // 学習記録を非同期で保存（画面遷移をブロックしない）
    const saveRecord = addStudyRecord({
      problemId: currentProblemId,
      workbookId: currentWorkbookId,
      result,
      studyTime,
      memo: currentMemo || undefined,
    })

    // 苦手克服モードの場合は次の優先度の高い問題へ（セッションより優先）
    if (isWeakMode) {
      // セッションに結果を保存
      addWeakModeResult(currentProblemId, result, previousResult, studyTime, previousAttempts)

      const nextProblem = await getNextWeakProblem(currentProblemId)

      // 学習記録の保存を待たずに画面遷移
      if (nextProblem) {
        navigate(`/study/${nextProblem.id}?mode=weak`)
      } else {
        navigate('/weak-mode-report')
      }
      // バックグラウンドで保存を完了
      await saveRecord
      return
    }

    // セッション管理の確認
    const session = getSession()
    if (session) {
      // セッション結果に追加
      addResult(currentProblemId, result, studyTime)

      // 更新後のセッションを再取得（currentIndexが更新されているため）
      const updatedSession = getSession()
      if (!updatedSession) {
        navigate('/study-report')
        await saveRecord
        return
      }

      // セッションが完了したかチェック
      if (isSessionComplete(updatedSession)) {
        // レポートページへ
        navigate('/study-report')
        await saveRecord
        return
      }

      // 次の問題へ
      const nextProblemId = getNextProblemId(updatedSession)
      if (nextProblemId) {
        navigate(`/study/${nextProblemId}`)
        await saveRecord
        return
      }

      // 問題がない場合はレポートへ
      navigate('/study-report')
      await saveRecord
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
        await saveRecord
        return
      }
    }

    // 未学習問題がない場合は問題集詳細ページに戻る
    navigate(`/workbooks/${currentWorkbookId}`)
    await saveRecord
    } finally {
      setIsProcessing(false)
    }
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

  // 問題の表示用タイトルを取得（sectionTitle-problemNumber形式）
  const getProblemDisplayTitle = (problem: Problem) => {
    if (problem.sectionTitle) {
      return `${problem.sectionTitle}-${problem.problemNumber}`
    }
    // 後方互換性：sectionTitleがない場合はproblemNumberのみ
    return problem.problemNumber
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
        <p className="text-sm text-gray-600 truncate mx-2 flex-1 text-center">{workbook.title}</p>
        <div className="flex items-center gap-2">
          {isWeakMode && (
            <button
              onClick={() => navigate('/weak-mode-report')}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 transition-colors text-red-700 text-sm font-medium"
              title="学習を終了してレポートを見る"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">終了</span>
            </button>
          )}
          <button
            onClick={togglePause}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
              isPaused
                ? 'bg-green-50 hover:bg-green-100 text-green-700'
                : 'bg-orange-50 hover:bg-orange-100 text-orange-700'
            }`}
            title={isPaused ? 'タイマーを再開' : 'タイマーを一時停止'}
          >
            {isPaused ? (
              <>
                <Play size={16} />
                <span className="hidden sm:inline">再開</span>
              </>
            ) : (
              <>
                <Pause size={16} />
                <span className="hidden sm:inline">一時停止</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 一時停止中のメッセージ */}
      {isPaused && (
        <div className="mb-3 p-3 bg-orange-50 border border-orange-400 rounded-lg">
          <p className="text-sm font-bold text-orange-900">⏸ タイマーが一時停止中です</p>
          <p className="text-xs text-orange-700 mt-1">再開ボタンを押すと、タイマーが動き出します</p>
        </div>
      )}

      {/* 時間終了メッセージ */}
      {timeExpired && (
        <div className="mb-3 p-3 bg-red-50 border border-red-400 rounded-lg">
          <p className="text-sm font-bold text-red-900">⏰ 目標時間に到達しました！</p>
          <p className="text-xs text-red-700 mt-1">キリの良いところで終了しましょう</p>
        </div>
      )}

      {/* 問題情報カード */}
      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {problem.category && (
              <p className="text-xs text-gray-500 mb-1 truncate">
                {problem.category}
              </p>
            )}
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {getProblemDisplayTitle(problem)}
              </h1>
              <button
                onClick={handleToggleBookmark}
                className={`p-1.5 rounded-lg transition-all ${
                  problem.isBookmarked
                    ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
                title={problem.isBookmarked ? '苦手マークを外す' : '苦手な問題としてマーク'}
              >
                <Star size={20} fill={problem.isBookmarked ? 'currentColor' : 'none'} />
              </button>
            </div>
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
          <div className={`grid gap-3 text-center ${getSession() ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-xs text-blue-600">今日の学習</p>
              <p className="text-lg font-bold font-mono text-blue-700">
                {formatTime(todayStudyTime)}
              </p>
            </div>
            {getSession() && (
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-xs text-purple-600">セッション</p>
                <p className="text-lg font-bold font-mono text-purple-700">
                  {formatTime(sessionElapsedTime)}
                </p>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-2">
              <p className="text-xs text-gray-600">この問題</p>
              <p className={`text-lg font-bold font-mono ${isPaused ? 'text-orange-600' : 'text-gray-700'}`}>
                {isPaused && '⏸ '}{formatTime(elapsedTime)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 解答ボタン */}
      <div className="space-y-3 mb-4">
        {/* Undoボタン */}
        {problemHistory.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleUndo}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700 text-sm font-medium"
            >
              <Undo2 size={16} />
              <span>1問前に戻る {problemHistory.length > 1 && `(履歴: ${problemHistory.length}問)`}</span>
            </button>
          </div>
        )}

        {/* 正解・不正解ボタン（大きめ、横並び） */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="success"
            size="lg"
            onClick={() => handleRecord('correct')}
            disabled={isProcessing}
            className="flex flex-col items-center gap-2 h-28 sm:h-32 shadow-md hover:shadow-lg transition-all"
          >
            <Circle size={32} className="sm:w-12 sm:h-12" />
            <span className="text-lg sm:text-xl font-bold">正解</span>
            <span className="text-xs opacity-75">キー: 1</span>
          </Button>
          <Button
            variant="error"
            size="lg"
            onClick={() => handleRecord('incorrect')}
            disabled={isProcessing}
            className="flex flex-col items-center gap-2 h-28 sm:h-32 shadow-md hover:shadow-lg transition-all"
          >
            <X size={32} className="sm:w-12 sm:h-12" />
            <span className="text-lg sm:text-xl font-bold">不正解</span>
            <span className="text-xs opacity-75">キー: 3</span>
          </Button>
        </div>

        {/* 部分正解ボタン */}
        <div className="flex justify-center">
          <Button
            variant="warning"
            size="lg"
            onClick={() => handleRecord('partial')}
            disabled={isProcessing}
            className="flex items-center gap-2 h-14 px-8 shadow-md hover:shadow-lg transition-all"
          >
            <Triangle size={20} />
            <span className="text-base font-bold">部分正解</span>
            <span className="text-xs opacity-75 ml-2">キー: 2</span>
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

      {/* タグセクション（インライン） */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Tags size={16} className="text-purple-600" />
          <h3 className="text-sm font-medium text-gray-700">タグで整理</h3>
        </div>

        {/* よく使うタグ（トグルボタン） */}
        <div className="flex flex-wrap gap-2 mb-3">
          {COMMON_TAGS.map(tag => {
            const isActive = problem?.tags?.includes(tag)
            return (
              <button
                key={tag}
                onClick={() => handleToggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            )
          })}
        </div>

        {/* カスタムタグ表示 */}
        {problem?.tags && problem.tags.filter(tag => !COMMON_TAGS.includes(tag)).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="text-xs text-gray-500">その他:</span>
            {problem.tags
              .filter(tag => !COMMON_TAGS.includes(tag))
              .map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                >
                  {tag}
                  <button
                    onClick={() => handleToggleTag(tag)}
                    className="hover:text-blue-900"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
          </div>
        )}

        {/* カスタムタグ入力 */}
        {showCustomTagInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddCustomTag()}
              className="flex-1 px-3 py-1.5 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="カスタムタグを入力"
              autoFocus
            />
            <button
              onClick={handleAddCustomTag}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 transition-colors"
            >
              追加
            </button>
            <button
              onClick={() => {
                setShowCustomTagInput(false)
                setCustomTag('')
              }}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-medium hover:bg-gray-300 transition-colors"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomTagInput(true)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            + カスタムタグを追加
          </button>
        )}
      </div>

      {/* 学習履歴（横スクロール可能） */}
      {studyRecords.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              学習履歴 ({studyRecords.length}回)
            </h3>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showHistory ? '履歴を隠す' : '全て表示'}
            </button>
          </div>

          {/* 横スクロール可能な履歴カード */}
          <div className="overflow-x-auto pb-2 -mx-2 px-2">
            <div className="flex gap-3 min-w-min">
              {studyRecords.slice(0, showHistory ? undefined : 5).map((record) => (
                <Card
                  key={record.id}
                  className="flex-shrink-0 w-44 p-3 bg-gradient-to-br from-white to-gray-50"
                >
                  <div className="space-y-2">
                    {/* 結果アイコンと日時 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getResultIcon(record.result)}
                        <span className="text-sm font-bold">
                          {getResultText(record.result)}
                        </span>
                      </div>
                    </div>

                    {/* 時間 */}
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <span>⏱️</span>
                      <span className="font-mono font-medium">{formatTime(record.studyTime)}</span>
                    </div>

                    {/* 日付 */}
                    <div className="text-xs text-gray-500">
                      {new Date(record.studiedAt).toLocaleDateString('ja-JP', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    {/* メモ */}
                    {record.memo && (
                      <p className="text-xs text-gray-600 line-clamp-2 pt-1 border-t border-gray-200">
                        {record.memo}
                      </p>
                    )}

                    {/* 編集・削除ボタン */}
                    <div className="flex gap-1 pt-1">
                      <button
                        onClick={() => openEditModal(record)}
                        className="flex-1 p-1.5 hover:bg-blue-100 rounded transition-colors text-center"
                        title="編集"
                      >
                        <Edit2 size={12} className="text-primary mx-auto" />
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="flex-1 p-1.5 hover:bg-red-100 rounded transition-colors text-center"
                        title="削除"
                      >
                        <Trash2 size={12} className="text-error mx-auto" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* スクロールのヒント */}
          {studyRecords.length > 3 && !showHistory && (
            <p className="text-xs text-gray-400 text-center mt-2">
              ← スワイプして過去の履歴を確認 →
            </p>
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

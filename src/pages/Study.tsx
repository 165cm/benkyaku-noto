import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Circle, Triangle, X, Edit2, Trash2, LogOut, Star, BookOpen, Image, Camera } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import PDFViewer from '@/components/PDFViewer'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { getProblem, getWorkbook, addStudyRecord, getStudyRecords, updateStudyRecord, deleteStudyRecord, db, isParentProblem, toggleBookmark, addTagToProblem, removeTagFromProblem, getExplanationBySectionKey, getImageBasedExplanationsByProblemId } from '@/lib/db'
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
import type { Problem, Workbook, StudyRecord, StudyResult, ImageBasedExplanation } from '@/types'

export default function Study() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isWeakMode = searchParams.get('mode') === 'weak'
  const [problem, setProblem] = useState<Problem | null>(null)
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [studyRecords, setStudyRecords] = useState<StudyRecord[]>([])
  const [hasExplanation, setHasExplanation] = useState(false)
  const [explanationId, setExplanationId] = useState<string | null>(null)
  const [imageExplanations, setImageExplanations] = useState<ImageBasedExplanation[]>([])
  const [showImageExplanations, setShowImageExplanations] = useState(false)
  const [startTime, setStartTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)
  const [sessionElapsedTime, setSessionElapsedTime] = useState(0)
  const [todayStudyTime, setTodayStudyTime] = useState(0) // 1日の学習時間（3時リセット）
  const [memo, setMemo] = useState('')
  const [timeExpired, setTimeExpired] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // タイマー機能（3モード対応）
  const [timerMode, setTimerMode] = useState<'solving' | 'explanation' | 'paused'>('solving')
  const [explanationTime, setExplanationTime] = useState(0) // 解説を読んだ時間（秒）
  const [pausedTime, setPausedTime] = useState(0) // 休憩時間（秒）
  const [modeStartTime, setModeStartTime] = useState(Date.now()) // 現在のモードが始まった時刻

  // 編集機能
  const [editingRecord, setEditingRecord] = useState<StudyRecord | null>(null)
  const [editResult, setEditResult] = useState<StudyResult>('correct')
  const [editTime, setEditTime] = useState('')
  const [editMemo, setEditMemo] = useState('')

  // 回答処理中フラグ（二重クリック防止）
  const [isProcessing, setIsProcessing] = useState(false)

  // 2段階フェーズ管理
  const [phase, setPhase] = useState<'problem' | 'record'>('problem')
  const [lastResult, setLastResult] = useState<StudyResult | null>(null)
  const [lastRecordId, setLastRecordId] = useState<string | null>(null) // 最新の記録ID（訂正用）
  const [autoTransitionTimeout, setAutoTransitionTimeout] = useState<number | null>(null)

  // 自動遷移の設定（localStorage）
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(() => {
    const saved = localStorage.getItem('autoAdvanceEnabled')
    return saved === 'true'
  })

  // 次の問題の情報（ページ数表示用）
  const [nextProblemInfo, setNextProblemInfo] = useState<{ problemNumber: string; page?: number } | null>(null)

  // よく使うタグのプリセット（明確な分類）
  const COMMON_TAGS = [
    { name: '解法を知らない', emoji: '🎓', help: '解き方を全く知らない、初めて見た問題 → 解説・教科書を読む' },
    { name: '理解があいまい', emoji: '🤔', help: '解き方は知っているが自信がない、理解が浅い → 概念を学び直す、類題を解く' },
    { name: 'うっかりミス', emoji: '😅', help: '分かっていたのにミスした（計算・転記・読み間違い）→ 見直しを徹底、落ち着いて解く' },
    { name: '時間が足りない', emoji: '⏱️', help: '時間をかければ解けた → 時間を測って練習、解法を効率化' },
    { name: '反復練習が必要', emoji: '🔁', help: '完全に覚えたい、定着させたい → 間隔をあけて繰り返し解く' },
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
      // 問題が変わったらタイマーとフェーズをリセット
      const now = Date.now()
      setStartTime(now)
      setModeStartTime(now)
      setElapsedTime(0)
      setExplanationTime(0)
      setPausedTime(0)
      setTimerMode('solving')
      setMemo('')
      setShowHistory(false)
      setPhase('problem')
      setLastResult(null)
      // 自動遷移タイマーをクリア
      if (autoTransitionTimeout) {
        clearTimeout(autoTransitionTimeout)
        setAutoTransitionTimeout(null)
      }

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
    const timer = setInterval(async () => {
      const now = Date.now()

      // 現在のモードに応じて時間を更新
      if (timerMode === 'solving') {
        setElapsedTime(prev => prev + 1)
      } else if (timerMode === 'explanation') {
        setExplanationTime(prev => prev + 1)
      } else if (timerMode === 'paused') {
        setPausedTime(prev => prev + 1)
      }

      // セッション全体の経過時間を計算
      const session = getSession()
      if (session) {
        const sessionElapsed = Math.floor((now - new Date(session.startTime).getTime()) / 1000)
        setSessionElapsedTime(sessionElapsed)

        // 制限時間をチェック
        if (!timeExpired && timerMode === 'solving') {
          const targetSeconds = session.targetMinutes * 60
          if (sessionElapsed >= targetSeconds) {
            setTimeExpired(true)
          }
        }
      }

      // 1日の学習時間を更新（問題時間 + 解説時間、休憩は含めない）
      const baseTodayTime = await getTodayStudyTime()
      setTodayStudyTime(baseTodayTime + elapsedTime + explanationTime)
    }, 1000)

    return () => clearInterval(timer)
  }, [timerMode, modeStartTime, startTime, timeExpired, elapsedTime, explanationTime])

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

      // AI解説の存在チェック
      if (problemData.category && problemData.sectionTitle) {
        const sectionKey = `${problemData.category}-${problemData.sectionTitle}`
        const explanation = await getExplanationBySectionKey(sectionKey)
        setHasExplanation(!!explanation)
        setExplanationId(explanation?.id || null)
      } else {
        setHasExplanation(false)
        setExplanationId(null)
      }

      // 画像ベース解説の存在チェック
      const imgExplanations = await getImageBasedExplanationsByProblemId(id)
      setImageExplanations(imgExplanations)
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

  // 自動遷移設定をトグル
  const toggleAutoAdvance = () => {
    const newValue = !autoAdvanceEnabled
    setAutoAdvanceEnabled(newValue)
    localStorage.setItem('autoAdvanceEnabled', String(newValue))
  }

  // 次の問題の情報を取得（ページ数表示用）
  const getNextProblemInfo = async (): Promise<{ problemNumber: string; page?: number } | null> => {
    if (!problem) return null

    const currentProblemId = problem.id
    const currentWorkbookId = problem.workbookId

    // 苦手克服モードの場合は次の優先度の高い問題を取得
    if (isWeakMode) {
      const nextProblem = await getNextWeakProblem(currentProblemId)
      if (nextProblem) {
        return { problemNumber: nextProblem.problemNumber, page: nextProblem.page }
      }
      return null
    }

    // セッション管理の確認
    const session = getSession()
    if (session) {
      const nextProblemId = getNextProblemId(session)
      if (nextProblemId) {
        const nextProblem = await db.problems.get(nextProblemId)
        if (nextProblem) {
          return { problemNumber: nextProblem.problemNumber, page: nextProblem.page }
        }
      }
      return null
    }

    // セッションがない場合は次の未学習問題を探す
    const allProblems = await db.problems
      .where('workbookId')
      .equals(currentWorkbookId)
      .toArray()

    const activeProblems = allProblems.filter(p => !p.deletedAt)

    // ページ番号と問題番号でソート
    activeProblems.sort((a, b) => {
      if (a.page !== undefined && b.page !== undefined) {
        if (a.page !== b.page) {
          return a.page - b.page
        }
      }
      if (a.page !== undefined && b.page === undefined) return -1
      if (a.page === undefined && b.page !== undefined) return 1

      const partsA = a.problemNumber.split('-')
      const partsB = b.problemNumber.split('-')

      const maxLength = Math.max(partsA.length, partsB.length)
      for (let i = 0; i < maxLength; i++) {
        const partA = partsA[i] || ''
        const partB = partsB[i] || ''

        const numA = parseInt(partA)
        const numB = parseInt(partB)

        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) {
            return numA - numB
          }
        } else {
          const cmp = partA.localeCompare(partB)
          if (cmp !== 0) {
            return cmp
          }
        }
      }

      return 0
    })

    // 次の未学習問題を探す
    for (const p of activeProblems) {
      const hasSubProblems = await isParentProblem(p.id)
      if (hasSubProblems) {
        continue
      }

      const records = await db.studyRecords
        .where('problemId')
        .equals(p.id)
        .toArray()

      if (records.length === 0) {
        return { problemNumber: p.problemNumber, page: p.page }
      }
    }

    return null
  }

  // タイマーモード切り替え：解説モードへ
  const handleStartExplanation = () => {
    if (timerMode !== 'solving') return
    setTimerMode('explanation')
    setModeStartTime(Date.now())
  }

  // タイマーモード切り替え：問題に戻る（解説モードから）
  const handleBackToProblem = () => {
    if (timerMode !== 'explanation') return
    setTimerMode('solving')
    setModeStartTime(Date.now())
  }

  // タイマーモード切り替え：休憩モードへ
  const handleStartPause = () => {
    if (timerMode === 'paused') return
    setTimerMode('paused')
    setModeStartTime(Date.now())
  }

  // タイマーモード切り替え：休憩から復帰
  const handleResume = () => {
    if (timerMode !== 'paused') return
    setTimerMode('solving')
    setModeStartTime(Date.now())
  }

  // 記録画面で結果を変更
  const handleChangeResult = async (newResult: StudyResult) => {
    if (!lastRecordId || !problem) return

    // 自動遷移タイマーをクリア
    if (autoTransitionTimeout) {
      clearTimeout(autoTransitionTimeout)
      setAutoTransitionTimeout(null)
    }

    // 結果を更新
    setLastResult(newResult)
    await updateStudyRecord(lastRecordId, { result: newResult })

    // 苦手克服モードの場合、セッションデータも更新が必要
    // （簡易的に再読み込みで対応）
    await loadData()

    // 自動遷移が有効な場合は再度タイマーをセット
    if (autoAdvanceEnabled) {
      const timeout = setTimeout(() => {
        navigateToNextProblem()
      }, 3000)
      setAutoTransitionTimeout(timeout)
    }
  }


  // 学習記録を削除
  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('この学習記録を削除しますか？')) return

    await deleteStudyRecord(recordId)
    await loadData()
  }

  // 次の問題へ遷移する処理
  const navigateToNextProblem = async () => {
    if (!problem) return

    // 自動遷移タイマーをクリア
    if (autoTransitionTimeout) {
      clearTimeout(autoTransitionTimeout)
      setAutoTransitionTimeout(null)
    }

    // フェーズ2でメモを追加で保存する場合
    if (phase === 'record' && memo.trim()) {
      // 最新の学習記録にメモを更新
      const records = await getStudyRecords(problem.id)
      if (records.length > 0 && !records[0].memo) {
        await updateStudyRecord(records[0].id, {
          memo: memo.trim(),
        })
      }
    }

    const currentProblemId = problem.id
    const currentWorkbookId = problem.workbookId

    // 苦手克服モードの場合は次の優先度の高い問題へ
    if (isWeakMode) {
      const nextProblem = await getNextWeakProblem(currentProblemId)

      if (nextProblem) {
        navigate(`/study/${nextProblem.id}?mode=weak`)
      } else {
        navigate('/weak-mode-report')
      }
      return
    }

    // セッション管理の確認
    const session = getSession()
    if (session) {
      // 更新後のセッションを再取得
      const updatedSession = getSession()
      if (!updatedSession) {
        navigate('/study-report')
        return
      }

      // セッションが完了したかチェック
      if (isSessionComplete(updatedSession)) {
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
      .equals(currentWorkbookId)
      .toArray()

    // 削除された問題を除外
    const activeProblems = allProblems.filter(p => !p.deletedAt)

    // ページ番号と問題番号でソート
    activeProblems.sort((a, b) => {
      if (a.page !== undefined && b.page !== undefined) {
        if (a.page !== b.page) {
          return a.page - b.page
        }
      }
      if (a.page !== undefined && b.page === undefined) return -1
      if (a.page === undefined && b.page !== undefined) return 1

      const partsA = a.problemNumber.split('-')
      const partsB = b.problemNumber.split('-')

      const maxLength = Math.max(partsA.length, partsB.length)
      for (let i = 0; i < maxLength; i++) {
        const partA = partsA[i] || ''
        const partB = partsB[i] || ''

        const numA = parseInt(partA)
        const numB = parseInt(partB)

        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) {
            return numA - numB
          }
        } else {
          const cmp = partA.localeCompare(partB)
          if (cmp !== 0) {
            return cmp
          }
        }
      }

      return 0
    })

    // 次の未学習問題を探す
    for (const p of activeProblems) {
      const hasSubProblems = await isParentProblem(p.id)
      if (hasSubProblems) {
        continue
      }

      const records = await db.studyRecords
        .where('problemId')
        .equals(p.id)
        .toArray()

      if (records.length === 0) {
        navigate(`/study/${p.id}`)
        return
      }
    }

    // 未学習問題がない場合は問題集詳細ページに戻る
    navigate(`/workbooks/${currentWorkbookId}`)
  }

  const handleRecord = async (result: StudyResult) => {
    if (!problem || isProcessing) return

    setIsProcessing(true)
    try {
      // ★修正: ボタンを押した瞬間にタイマーを停止して時間を確定
      const studyTime = elapsedTime
      setTimerMode('paused')
      setModeStartTime(Date.now())

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
          previousResult = records[0].result
        }
      }

      // 学習記録を保存
      const recordId = await addStudyRecord({
        problemId: currentProblemId,
        workbookId: currentWorkbookId,
        result,
        studyTime,
        memo: currentMemo || undefined,
      })

      // 苦手克服モードの場合はセッションに結果を保存
      if (isWeakMode) {
        addWeakModeResult(currentProblemId, result, previousResult, studyTime, previousAttempts)
      }

      // セッション管理の確認
      const session = getSession()
      if (session) {
        addResult(currentProblemId, result, studyTime)
      }

      // 結果を保存してフェーズ2へ移行
      setLastResult(result)
      setLastRecordId(recordId)
      setPhase('record')

      // 次の問題の情報を取得
      const nextInfo = await getNextProblemInfo()
      setNextProblemInfo(nextInfo)

      // 自動遷移が有効な場合のみ3秒後に自動遷移
      if (autoAdvanceEnabled) {
        const timeout = setTimeout(() => {
          navigateToNextProblem()
        }, 3000)
        setAutoTransitionTimeout(timeout)
      }
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
          onClick={() => {
            if (problem?.workbookId) {
              navigate(`/workbooks/${problem.workbookId}`)
            } else {
              navigate('/workbooks')
            }
          }}
          title="問題集に戻る"
        >
          <ArrowLeft size={16} />
        </Button>
        <p className="text-sm text-gray-600 truncate mx-2 flex-1 text-center">{workbook?.title || ''}</p>
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
        </div>
      </div>

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

            {/* AI解説リンク */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {problem.category && problem.sectionTitle && (
                hasExplanation ? (
                  <button
                    onClick={() => explanationId && navigate(`/explanations/${explanationId}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200 shadow-sm"
                    title="AI解説を見る"
                  >
                    <BookOpen size={16} />
                    <span>AI解説を見る</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/explanations')}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    title="AI解説ライブラリで解説を作成"
                  >
                    <BookOpen size={12} />
                    <span>AI解説を作る</span>
                  </button>
                )
              )}

              {/* 画像ベース解説ボタン */}
              {imageExplanations.length > 0 ? (
                <button
                  onClick={() => setShowImageExplanations(!showImageExplanations)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-green-50 text-green-700 hover:bg-green-100 active:bg-green-200 shadow-sm"
                  title="画像から作成した解説を見る"
                >
                  <Image size={16} />
                  <span>画像解説 ({imageExplanations.length})</span>
                </button>
              ) : (
                <button
                  onClick={() => navigate(`/explanations/image-upload?problemId=${id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-gray-50 text-gray-600 hover:bg-gray-100 active:bg-gray-200 shadow-sm"
                  title="画像から解説を作成"
                >
                  <Camera size={16} />
                  <span>画像で解説を作る</span>
                </button>
              )}
            </div>
          </div>
          {/* ページ数を大きく表示 */}
          {problem.page && (
            <div className="flex-shrink-0 text-center bg-blue-50 border-2 border-blue-200 rounded-lg px-4 py-2">
              <p className="text-xs text-blue-600 font-medium">ページ</p>
              <p className="text-3xl sm:text-4xl font-bold text-blue-700">{problem.page}</p>
            </div>
          )}
        </div>

        {/* 時間表示 - 今日の学習時間を強調 */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-3">
            <p className="text-xs text-gray-600 mb-1">📊 今日の学習時間</p>
            <p className="text-4xl font-bold text-blue-700 mb-2">
              {formatTime(todayStudyTime)}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min((todayStudyTime / 3600) * 100, 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-600">
              目標1時間まで
              {todayStudyTime < 3600
                ? `あと${formatTime(3600 - todayStudyTime)}`
                : '達成！🎉'}
            </p>
          </div>

          {/* タイマー表示（3モード対応） */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="text-gray-700 font-medium">
                ⏱️ 問題: {formatTime(elapsedTime)}
              </span>
              <span className="text-blue-600 font-medium">
                📖 解説: {formatTime(explanationTime)}
              </span>
            </div>
            {getSession() && (
              <span className="text-gray-500">
                セッション: {formatTime(sessionElapsedTime)}
              </span>
            )}
          </div>
          {timerMode === 'explanation' && (
            <p className="text-xs text-blue-600 mt-1">
              ⏺️ 解説時間が増えています...
            </p>
          )}
          {timerMode === 'paused' && (
            <p className="text-xs text-gray-500 mt-1">
              ⏸️ 休憩中（{formatTime(pausedTime)}）
            </p>
          )}
        </div>
      </Card>

      {/* フェーズ1: 問題表示 */}
      {phase === 'problem' && timerMode === 'solving' && (
        <>
          {/* タイマー操作ボタン */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Button
              onClick={handleStartExplanation}
              className="bg-blue-600 hover:bg-blue-700 text-white h-12"
            >
              📖 解説を見る
            </Button>
            <Button
              onClick={handleStartPause}
              className="bg-orange-500 hover:bg-orange-600 text-white h-12"
            >
              ⏸️ 休憩
            </Button>
          </div>

          {/* 解答ボタン */}
          <div className="space-y-3 mb-4">
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

          {/* 補助機能（小さく） */}
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            {hasExplanation && explanationId && (
              <button
                onClick={() => navigate(`/explanations/${explanationId}`)}
                className="hover:text-blue-600 transition-colors"
              >
                📚 AI解説
              </button>
            )}
            {showHistory && studyRecords.length > 0 && (
              <button
                onClick={() => setShowHistory(false)}
                className="hover:text-gray-700 transition-colors"
              >
                📖 履歴を隠す
              </button>
            )}
            {!showHistory && studyRecords.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="hover:text-gray-700 transition-colors"
              >
                📖 履歴を見る ({studyRecords.length}回)
              </button>
            )}
          </div>
        </>
      )}

      {/* 解説モード画面 */}
      {phase === 'problem' && timerMode === 'explanation' && (
        <>
          <Card className="mb-4 bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200">
            <div className="p-6 text-center">
              <div className="text-4xl mb-3">📖</div>
              <p className="text-xl font-bold text-blue-900 mb-2">解説を読んでいます...</p>
              <p className="text-sm text-blue-700 mb-4">
                解説時間: {formatTime(explanationTime)}
              </p>
              <p className="text-xs text-gray-600">
                💡 解説時間も学習時間にカウントされます
              </p>
            </div>
          </Card>

          {/* AI解説・画像解説へのリンク */}
          <div className="space-y-3 mb-4">
            {hasExplanation && explanationId && (
              <Button
                onClick={() => navigate(`/explanations/${explanationId}`)}
                className="w-full h-14 bg-purple-600 hover:bg-purple-700 text-white"
              >
                📚 AI解説を見る
              </Button>
            )}
            {imageExplanations.length > 0 && (
              <Button
                onClick={() => setShowImageExplanations(!showImageExplanations)}
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                📷 画像解説を見る ({imageExplanations.length}枚)
              </Button>
            )}
          </div>

          {/* 問題に戻るボタン */}
          <Button
            onClick={handleBackToProblem}
            className="w-full h-16 bg-green-600 hover:bg-green-700 text-white text-lg font-bold"
          >
            ✅ 問題に戻る
            <span className="text-sm ml-2 opacity-90">(解説時間: {formatTime(explanationTime)})</span>
          </Button>
        </>
      )}

      {/* 休憩モード画面 */}
      {phase === 'problem' && timerMode === 'paused' && (
        <>
          <Card className="mb-4 bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300">
            <div className="p-8 text-center">
              <div className="text-6xl mb-4">😌</div>
              <p className="text-2xl font-bold text-gray-800 mb-4">一息ついてください</p>
              <p className="text-3xl font-mono font-bold text-gray-700 mb-4">
                {formatTime(pausedTime)}
              </p>
              <p className="text-sm text-gray-600 mb-2">
                💡 長時間の集中の後は休憩が大切です
              </p>
              <p className="text-xs text-gray-500">
                ※ 休憩時間は学習時間にカウントされません
              </p>
            </div>
          </Card>

          {/* 学習再開ボタン */}
          <Button
            onClick={handleResume}
            className="w-full h-20 bg-green-600 hover:bg-green-700 text-white text-xl font-bold shadow-lg"
          >
            ▶️ 学習を再開する
          </Button>
        </>
      )}

      {/* フェーズ2: 記録画面 */}
      {phase === 'record' && lastResult && (
        <>
          {/* アクションボタン */}
          <div className="mb-4">
            {/* 次の問題情報 */}
            {nextProblemInfo && (
              <p className="text-sm text-gray-600 mb-2 text-center">
                次の問題: {nextProblemInfo.problemNumber}
                {nextProblemInfo.page && ` (p.${nextProblemInfo.page})`}
              </p>
            )}

            {/* ボタングリッド */}
            <div className="grid grid-cols-2 gap-3">
              {/* 解説を読むボタン */}
              {hasExplanation && explanationId ? (
                <Button
                  onClick={() => navigate(`/explanations/${explanationId}`)}
                  className="h-14 text-base font-bold bg-purple-600 hover:bg-purple-700"
                >
                  📖 解説を読む
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    if (problem?.page) {
                      setTimerMode('explanation')
                      setModeStartTime(Date.now())
                    }
                  }}
                  disabled={!problem?.page}
                  className="h-14 text-base font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                  📖 解説を読む
                </Button>
              )}

              {/* 次の問題へ進むボタン */}
              <Button
                onClick={navigateToNextProblem}
                className="h-14 text-base font-bold bg-blue-600 hover:bg-blue-700"
              >
                ⏩ 次の問題へ
              </Button>
            </div>
          </div>

          {/* フィードバック表示 */}
          <Card className="mb-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <div className="p-6 text-center">
              <div className="text-6xl mb-3">
                {lastResult === 'correct' && '⭕'}
                {lastResult === 'partial' && '△'}
                {lastResult === 'incorrect' && '❌'}
              </div>
              <p className="text-2xl font-bold mb-2">
                {lastResult === 'correct' && '正解！'}
                {lastResult === 'partial' && '部分正解'}
                {lastResult === 'incorrect' && '不正解'}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                学習時間: {formatTime(elapsedTime)}
              </p>

              {/* 結果変更ボタン */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">間違えて入力した場合は変更できます</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleChangeResult('correct')}
                    className={`p-3 rounded-lg transition-all ${
                      lastResult === 'correct'
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Circle size={20} />
                      <span className="text-xs font-medium">正解</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleChangeResult('partial')}
                    className={`p-3 rounded-lg transition-all ${
                      lastResult === 'partial'
                        ? 'bg-yellow-500 text-white shadow-lg'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Triangle size={20} />
                      <span className="text-xs font-medium">部分正解</span>
                    </div>
                  </button>
                  <button
                    onClick={() => handleChangeResult('incorrect')}
                    className={`p-3 rounded-lg transition-all ${
                      lastResult === 'incorrect'
                        ? 'bg-red-600 text-white shadow-lg'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <X size={20} />
                      <span className="text-xs font-medium">不正解</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 自動遷移の設定 */}
              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center justify-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAdvanceEnabled}
                    onChange={toggleAutoAdvance}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">次回から自動で進む（3秒後）</span>
                </label>
                {autoAdvanceEnabled && (
                  <p className="text-xs text-gray-600 mt-2">
                    3秒後に次の問題へ...
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* メモ入力 */}
          <Card className="mb-4">
            <div className="p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">💡 記録を残しますか？（任意）</p>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none mb-3"
                placeholder="気づいたことをメモ..."
                rows={3}
              />

              {/* タグ選択（よく使うもののみ） */}
              <p className="text-sm font-medium text-gray-700 mb-2">🏷️ タグをつける</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {COMMON_TAGS.slice(0, 5).map(tag => {
                  const isActive = problem?.tags?.includes(tag.name)
                  return (
                    <button
                      key={tag.name}
                      onClick={() => handleToggleTag(tag.name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={tag.help}
                    >
                      <span className="mr-1">{tag.emoji}</span>
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* 学習履歴（両フェーズで表示可能） */}
      {showHistory && studyRecords.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              📖 学習履歴 ({studyRecords.length}回)
            </h3>
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

      {/* 画像ベース解説表示エリア */}
      {showImageExplanations && imageExplanations.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowImageExplanations(false)}>
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-border p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Image size={20} className="text-green-600" />
                画像から作成した解説 ({imageExplanations.length}件)
              </h2>
              <button
                onClick={() => setShowImageExplanations(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {imageExplanations.map((explanation, index) => (
                <Card key={explanation.id} className="border-l-4 border-l-green-500">
                  <div className="space-y-4">
                    {/* ヘッダー */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">解説 #{imageExplanations.length - index}</h3>
                        <p className="text-sm text-gray-500">
                          レベル: {explanation.userLevel.level === 'beginner' ? '初級' : explanation.userLevel.level === 'intermediate' ? '中級' : '上級'}
                          ({explanation.userLevel.overallAccuracy}%)
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(explanation.createdAt).toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    {/* 問題文 */}
                    {(explanation.editedText || explanation.extractedText) && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <h4 className="text-sm font-semibold mb-2">📝 問題文</h4>
                        <p className="text-sm whitespace-pre-wrap">
                          {explanation.editedText || explanation.extractedText}
                        </p>
                      </div>
                    )}

                    {/* 答え */}
                    {explanation.answer && (
                      <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                        <h4 className="text-sm font-semibold mb-2 text-green-800">✅ この問題の答え</h4>
                        <p className="text-sm font-medium text-green-900">
                          {explanation.answer}
                        </p>
                      </div>
                    )}

                    {/* 元の画像 */}
                    {explanation.imageUrl && (
                      <details className="bg-gray-50 p-3 rounded-lg">
                        <summary className="text-sm font-semibold cursor-pointer">📸 元の画像を見る</summary>
                        <img
                          src={explanation.imageUrl}
                          alt="問題画像"
                          className="mt-2 w-full max-w-2xl rounded-lg"
                        />
                      </details>
                    )}

                    {/* 解説内容 */}
                    <div>
                      <MarkdownRenderer content={explanation.explanationContent} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-border p-4">
              <Button
                onClick={() => navigate(`/explanations/image-upload?problemId=${id}`)}
                className="w-full"
              >
                <Camera size={18} className="mr-2" />
                新しい画像解説を作成
              </Button>
            </div>
          </div>
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

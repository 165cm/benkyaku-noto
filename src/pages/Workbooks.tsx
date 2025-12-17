import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Trash2, Settings, ChevronDown, Play, RotateCcw, Search, Loader2, Image, Plus } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import {
  getWorkbooks,
  addWorkbook,
  deleteWorkbook,
  getProblems,
  updateWorkbook,
  getLastStudyDate,
  getStudiedProblemCount
} from '@/lib/db'
import { calculateRecentAccuracyForProblems, getWorkbookSections, type SectionStats } from '@/lib/review'
import { getExcludedSections, saveExcludedSections, getSectionStandardTime, setSectionStandardTime } from '@/lib/storage'
import type { Workbook } from '@/types'
import { fetchBookByISBN } from '@/lib/googleBooks'

const AMAZON_TAG = import.meta.env.VITE_AMAZON_ASSOCIATE_TAG || 'notestimatobe-22'

// 拡張された問題集データ型
interface ExtendedWorkbook extends Workbook {
  accuracy: number | null
  lastStudyDate: Date | null
  studiedCount: number
}

// フィルタ設定
type SubjectFilter = string | 'all'
type StudyStatusFilter = 'all' | 'unstudied' | 'in-progress' | 'completed'
type AccuracyFilter = 'all' | 'high' | 'medium' | 'low'

// ソート設定
type SortOption = 'updated' | 'updated-asc' | 'accuracy' | 'accuracy-asc' | 'problems' | 'problems-asc' | 'name' | 'name-desc'

export default function Workbooks() {
  const navigate = useNavigate()
  const { confirm, dialogProps } = useConfirmDialog()
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    isbn: '',
    coverUrl: '',
    description: '',
    authors: [] as string[],
    publisher: '',
    publishedDate: '',
  })
  const [isSearching, setIsSearching] = useState(false)

  // 拡張データ
  const [extendedWorkbooks, setExtendedWorkbooks] = useState<ExtendedWorkbook[]>([])

  // フィルタ・ソート
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all')
  const [studyStatusFilter, setStudyStatusFilter] = useState<StudyStatusFilter>('all')
  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('updated')
  const [isEditMode, setIsEditMode] = useState(false)

  // 設定モーダル
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [settingsWorkbook, setSettingsWorkbook] = useState<Workbook | null>(null)
  const [sections, setSections] = useState<SectionStats[]>([])
  const [excludedSections, setExcludedSections] = useState<string[]>([])
  const [workbookStandardTime, setWorkbookStandardTime] = useState(180)
  const [sectionStandardTimes, setSectionStandardTimes] = useState<Map<string, number>>(new Map())
  const [editFormData, setEditFormData] = useState({
    title: '',
    subject: '',
    isbn: '',
    description: '',
    pageCount: 0,
    coverUrl: '',
    authors: [] as string[],
    publisher: '',
    publishedDate: ''
  })

  useEffect(() => {
    loadWorkbooks()
    getExcludedSections().then(setExcludedSections)
  }, [])

  // 各問題集の拡張データを取得
  useEffect(() => {
    const loadExtendedData = async () => {
      const extended: ExtendedWorkbook[] = []

      for (const workbook of workbooks) {
        const problems = await getProblems(workbook.id)
        const accuracy = problems.length > 0
          ? await calculateRecentAccuracyForProblems(problems)
          : null
        const lastStudyDate = await getLastStudyDate(workbook.id)
        const studiedCount = await getStudiedProblemCount(workbook.id)

        extended.push({
          ...workbook,
          totalProblems: problems.length,
          accuracy,
          lastStudyDate,
          studiedCount
        })
      }

      setExtendedWorkbooks(extended)
    }

    if (workbooks.length > 0) {
      loadExtendedData()
    } else {
      setExtendedWorkbooks([])
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
      isbn: formData.isbn,
      coverUrl: formData.coverUrl,
      description: formData.description,
      authors: formData.authors,
      publisher: formData.publisher,
      publishedDate: formData.publishedDate,
    })

    setFormData({
      title: '',
      subject: '',
      isbn: '',
      coverUrl: '',
      description: '',
      authors: [],
      publisher: '',
      publishedDate: '',
    })
    setIsModalOpen(false)
    loadWorkbooks()
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: '問題集の削除',
      message: 'この問題集を削除しますか？\n関連する問題と学習記録もすべて削除されます。',
      confirmText: '削除',
      variant: 'danger',
    })
    if (confirmed) {
      await deleteWorkbook(id)
      loadWorkbooks()
    }
  }

  // 設定モーダルを開く
  const openSettingsModal = async (workbook: Workbook) => {
    setSettingsWorkbook(workbook)
    setIsSettingsModalOpen(true)

    const sectionList = await getWorkbookSections(workbook.id)
    setSections(sectionList)
    setExcludedSections(await getExcludedSections())
    setWorkbookStandardTime(workbook.standardTime || 180)

    // 編集用フォームの初期化
    setEditFormData({
      title: workbook.title,
      subject: workbook.subject,
      isbn: workbook.isbn || '',
      description: workbook.description || '',
      pageCount: workbook.pageCount || 0,
      coverUrl: workbook.coverUrl || '',
      authors: workbook.authors || [],
      publisher: workbook.publisher || '',
      publishedDate: workbook.publishedDate || ''
    })
    setIsEditMode(false)

    const sectionTimes = new Map<string, number>()
    for (const section of sectionList) {
      const time = await getSectionStandardTime(section.sectionKey)
      if (time) {
        sectionTimes.set(section.sectionKey, time)
      } else {
        sectionTimes.set(section.sectionKey, 0)
      }
    }
    setSectionStandardTimes(sectionTimes)
  }

  // 設定を保存
  const handleSaveSettings = async () => {
    if (!settingsWorkbook) return

    if (workbookStandardTime > 0) {
      await updateWorkbook(settingsWorkbook.id, {
        standardTime: workbookStandardTime,
        title: editFormData.title,
        subject: editFormData.subject,
        isbn: editFormData.isbn,
        description: editFormData.description,
        pageCount: editFormData.pageCount,
        coverUrl: editFormData.coverUrl,
        authors: editFormData.authors,
        publisher: editFormData.publisher,
        publishedDate: editFormData.publishedDate,
      })
    } else {
      await updateWorkbook(settingsWorkbook.id, {
        title: editFormData.title,
        subject: editFormData.subject,
        isbn: editFormData.isbn,
        description: editFormData.description,
        pageCount: editFormData.pageCount,
        coverUrl: editFormData.coverUrl,
        authors: editFormData.authors,
        publisher: editFormData.publisher,
        publishedDate: editFormData.publishedDate,
      })
    }

    for (const [sectionKey, time] of sectionStandardTimes.entries()) {
      if (time > 0) {
        await setSectionStandardTime(sectionKey, time)
      }
    }

    await saveExcludedSections(excludedSections)
    setIsSettingsModalOpen(false)
    setSettingsWorkbook(null)
    loadWorkbooks()
  }

  const toggleSectionExclusion = (sectionKey: string) => {
    if (excludedSections.includes(sectionKey)) {
      setExcludedSections(excludedSections.filter(s => s !== sectionKey))
    } else {
      setExcludedSections([...excludedSections, sectionKey])
    }
  }

  const updateSectionStandardTime = (sectionKey: string, time: number) => {
    const newTimes = new Map(sectionStandardTimes)
    newTimes.set(sectionKey, Math.max(0, time))
    setSectionStandardTimes(newTimes)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 最終学習日のフォーマット
  const formatLastStudyDate = (date: Date | null): string => {
    if (!date) return '未学習'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      // 今日
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `今日 ${hours}:${minutes}`
    } else if (diffDays === 1) {
      return '昨日'
    } else if (diffDays < 7) {
      return `${diffDays}日前`
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7)
      return `${weeks}週間前`
    } else {
      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      return `${year}/${month}/${day}`
    }
  }

  // 科目一覧を取得
  const subjects = useMemo(() => {
    const subjectSet = new Set(workbooks.map(w => w.subject))
    return Array.from(subjectSet).sort()
  }, [workbooks])

  // フィルタ・ソート適用
  const filteredAndSortedWorkbooks = useMemo(() => {
    let result = [...extendedWorkbooks]

    // 科目フィルタ
    if (subjectFilter !== 'all') {
      result = result.filter(w => w.subject === subjectFilter)
    }

    // 学習状況フィルタ
    if (studyStatusFilter !== 'all') {
      result = result.filter(w => {
        if (studyStatusFilter === 'unstudied') {
          return w.studiedCount === 0
        } else if (studyStatusFilter === 'in-progress') {
          return w.studiedCount > 0 && w.studiedCount < w.totalProblems
        } else if (studyStatusFilter === 'completed') {
          return w.studiedCount === w.totalProblems && w.totalProblems > 0
        }
        return true
      })
    }

    // 正解率フィルタ
    if (accuracyFilter !== 'all') {
      result = result.filter(w => {
        if (w.accuracy === null) return false
        if (accuracyFilter === 'high') return w.accuracy >= 80
        if (accuracyFilter === 'medium') return w.accuracy >= 50 && w.accuracy < 80
        if (accuracyFilter === 'low') return w.accuracy < 50
        return true
      })
    }

    // ソート
    result.sort((a, b) => {
      switch (sortOption) {
        case 'updated':
          return b.updatedAt.getTime() - a.updatedAt.getTime()
        case 'updated-asc':
          return a.updatedAt.getTime() - b.updatedAt.getTime()
        case 'accuracy':
          return (b.accuracy ?? -1) - (a.accuracy ?? -1)
        case 'accuracy-asc':
          return (a.accuracy ?? -1) - (b.accuracy ?? -1)
        case 'problems':
          return b.totalProblems - a.totalProblems
        case 'problems-asc':
          return a.totalProblems - b.totalProblems
        case 'name':
          return a.title.localeCompare(b.title, 'ja')
        case 'name-desc':
          return b.title.localeCompare(a.title, 'ja')
        default:
          return 0
      }
    })

    return result
  }, [extendedWorkbooks, subjectFilter, studyStatusFilter, accuracyFilter, sortOption])

  // ボーダー色を決定（詳細ページと統一）
  const getBorderColor = (accuracy: number | null): string => {
    if (accuracy === null) return 'border-gray-200'
    if (accuracy >= 80) return 'border-green-200'
    if (accuracy >= 50) return 'border-blue-200'
    return 'border-red-200'
  }

  return (
    <div className="pb-4">
      {/* ヘッダー */}
      {/* ヘッダーアクション */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">問題集</h1>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md py-4"
            onClick={() => navigate('/workbooks/import')}
          >
            <div className="flex flex-col items-center">
              <div className="flex items-center text-lg font-bold mb-0.5">
                <Image size={24} className="mr-2" />
                カメラ・画像から読み込む
              </div>
              <span className="text-xs opacity-90 font-normal">
                目次を自動解析して最短1分で作成 (推奨)
              </span>
            </div>
          </Button>

          <div className="text-center">
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-xs text-gray-500 underline hover:text-gray-700 flex items-center justify-center gap-1 mx-auto"
            >
              <Plus size={12} />
              手動で作成する...
            </button>
          </div>
        </div>
      </div>

      {/* フィルタエリア（アコーディオンにして隠すことも検討できるが、一旦保持） */}
      <div className="mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
          {/* 科目フィルタ */}
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value as SubjectFilter)}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-primary whitespace-nowrap"
          >
            <option value="all">全科目</option>
            {subjects.map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>

          {/* 学習状況フィルタ */}
          <select
            value={studyStatusFilter}
            onChange={(e) => setStudyStatusFilter(e.target.value as StudyStatusFilter)}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-primary whitespace-nowrap"
          >
            <option value="all">全て</option>
            <option value="unstudied">未学習</option>
            <option value="in-progress">学習中</option>
            <option value="completed">完了</option>
          </select>

          {/* 正解率フィルタ */}
          <select
            value={accuracyFilter}
            onChange={(e) => setAccuracyFilter(e.target.value as AccuracyFilter)}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-primary whitespace-nowrap"
          >
            <option value="all">全正解率</option>
            <option value="high">80%以上</option>
            <option value="medium">50-80%</option>
            <option value="low">50%未満</option>
          </select>

          {/* その他メニュー */}

        </div>

        {/* ソート + 件数 */}
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <div className="flex items-center gap-2">
            <span>並替:</span>
            <div className="relative">
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="bg-transparent font-medium text-gray-700 focus:outline-none pr-3"
              >
                <option value="updated">更新日</option>
                <option value="accuracy">正解率</option>
                <option value="problems">問題数</option>
              </select>
            </div>
          </div>
          <span>{filteredAndSortedWorkbooks.length}件</span>
        </div>
      </div>

      {/* 問題集リスト */}
      {filteredAndSortedWorkbooks.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">
            {workbooks.length === 0 ? '問題集がありません' : '該当する問題集がありません'}
          </p>
          {workbooks.length === 0 && (
            <Button onClick={() => setIsModalOpen(true)}>
              最初の問題集を作成
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedWorkbooks.map((workbook) => (
            <div
              key={workbook.id}
              className={`border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden ${getBorderColor(workbook.accuracy)}`}
            >
              {/* 上部: 画像 + 情報 + 統計 */}
              <div
                className="flex gap-3 p-3 pb-2 cursor-pointer"
                onClick={() => navigate(`/workbooks/${workbook.id}`)}
              >
                {/* 表紙画像 (Amazonリンク) */}
                <div className="w-16 flex-shrink-0">
                  {workbook.isbn ? (
                    <a
                      href={`https://www.amazon.co.jp/dp/${workbook.isbn}?tag=${AMAZON_TAG}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-16 aspect-[2/3] bg-gray-100 rounded shadow-sm overflow-hidden hover:opacity-80 transition-opacity relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {workbook.coverUrl ? (
                        <img src={workbook.coverUrl} alt={workbook.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300"><BookOpen size={24} /></div>
                      )}
                      {/* Amazon Icon Overlay */}
                      <div className="absolute bottom-0 right-0 bg-white/90 px-1 rounded-tl text-[8px] font-bold text-orange-600 shadow-sm">Amazon</div>
                    </a>
                  ) : (
                    <div className="w-16 aspect-[2/3] bg-gray-100 rounded shadow-sm overflow-hidden flex items-center justify-center text-gray-300">
                      {workbook.coverUrl ? (
                        <img src={workbook.coverUrl} alt={workbook.title} className="w-full h-full object-cover" />
                      ) : (
                        <BookOpen size={24} />
                      )}
                    </div>
                  )}
                </div>

                {/* 右: 情報＆統計カラム */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 leading-tight mb-2 line-clamp-2 h-[2.5em]">
                      {workbook.title}
                    </h3>
                  </div>

                  {/* 2. 統計ブロック */}
                  <div className="mt-auto">
                    <div className="flex justify-between items-end mb-1">
                      {workbook.accuracy !== null ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${workbook.accuracy >= 80 ? 'bg-green-100 text-green-700' :
                          workbook.accuracy >= 50 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                          正解率 {workbook.accuracy}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[10px] font-medium">-</span>
                      )}
                      <span className="text-gray-500 text-[10px]">
                        {workbook.lastStudyDate ? `最終: ${formatLastStudyDate(workbook.lastStudyDate)}` : '未学習'}
                      </span>
                    </div>

                    <div className="relative h-5 bg-gray-100 rounded-md overflow-hidden border border-gray-100">
                      {/* オーバーレイテキスト (左寄せ・影なし・見やすく) */}
                      <div className="absolute inset-0 flex items-center justify-start pl-2 text-[11px] font-bold z-10 text-gray-700">
                        {workbook.studiedCount}/{workbook.totalProblems}
                        {workbook.totalProblems > 0 && ` (${Math.round((workbook.studiedCount / workbook.totalProblems) * 100)}%)`}
                      </div>
                      {/* プログレスバー */}
                      {/* プログレスバー (Vibrant & Youthful) */}
                      <div
                        className={`h-full transition-all ${workbook.accuracy === null ? 'bg-gradient-to-r from-cyan-400 to-blue-500' :
                          workbook.accuracy >= 80 ? 'bg-gradient-to-r from-emerald-400 to-green-500' :
                            workbook.accuracy >= 50 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                              'bg-gradient-to-r from-pink-500 to-red-500'
                          }`}
                        style={{ width: `${workbook.totalProblems > 0 ? (workbook.studiedCount / workbook.totalProblems) * 100 : 0}%`, opacity: 0.8 }}
                      />
                    </div>
                  </div>
                </div>
              </div>



              {/* C. アクションフッター (下段) - さらに薄くコンパクトに */}
              <div className="bg-gray-50 px-2 py-1.5 border-t border-gray-100 flex gap-2 items-center">
                <Button
                  className={`flex-1 py-1 h-8 text-xs font-bold transition-all ${workbook.studiedCount === workbook.totalProblems && workbook.totalProblems > 0
                    ? 'bg-gray-100 text-gray-500 hover:bg-gray-200 shadow-none border border-gray-200'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:shadow-md hover:scale-[1.02]'
                    }`}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/workbooks/${workbook.id}`)
                  }}
                >
                  <Play size={12} className={`mr-1 ${workbook.studiedCount === workbook.totalProblems && workbook.totalProblems > 0 ? 'fill-gray-500 stroke-gray-500' : 'fill-white/20'}`} /> 新規学習
                </Button>

                <Button
                  className={`flex-1 py-1 h-8 text-xs font-bold transition-all ${workbook.studiedCount === workbook.totalProblems && workbook.totalProblems > 0
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm hover:shadow-md hover:scale-[1.02]'
                    : ''
                    }`}
                  variant={workbook.studiedCount === workbook.totalProblems && workbook.totalProblems > 0 ? "primary" : "secondary"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/workbooks/${workbook.id}?mode=review`)
                  }}
                >
                  <RotateCcw size={12} className="mr-1" /> 弱点復習
                </Button>

                <div className="flex gap-0.5 border-l border-gray-200 ml-1 pl-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openSettingsModal(workbook)
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(workbook.id)
                    }}
                    className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={16} className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新規作成モーダル */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="問題集の新規作成"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <label className="block text-xs font-bold text-blue-800 mb-1">
              ISBNから自動入力（任意）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.isbn}
                onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                className="flex-1 px-3 py-1.5 text-sm border border-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例: 9784000000000"
              />
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  if (!formData.isbn) return
                  setIsSearching(true)
                  const book = await fetchBookByISBN(formData.isbn)
                  setIsSearching(false)

                  if (book) {
                    setFormData(prev => ({
                      ...prev,
                      title: book.title,
                      subject: book.categories[0] || prev.subject,
                      coverUrl: book.coverUrl || '',
                      description: book.description,
                      authors: book.authors,
                      publisher: book.publisher,
                      publishedDate: book.publishedDate
                    }))
                  } else {
                    alert('書籍が見つかりませんでした')
                  }
                }}
                disabled={!formData.isbn || isSearching}
              >
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                検索
              </Button>
            </div>
          </div>

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

      {/* 設定モーダル */}
      {settingsWorkbook && (
        <Modal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          title={`📚 ${settingsWorkbook.title} の設定`}
        >
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {/* 基本情報編集 */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setIsEditMode(!isEditMode)}
              >
                <h3 className="text-xs font-bold text-gray-800">📝 基本情報</h3>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isEditMode ? 'rotate-180' : ''}`} />
              </div>

              {isEditMode && (
                <div className="mt-3 space-y-3">
                  {/* ISBN検索 */}
                  <div className="bg-blue-50 p-2 rounded border border-blue-200">
                    <label className="block text-[10px] font-bold text-blue-800 mb-1">
                      ISBNから情報を更新
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editFormData.isbn}
                        onChange={(e) => setEditFormData({ ...editFormData, isbn: e.target.value })}
                        className="flex-1 px-2 py-1 text-xs border border-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="例: 9784000000000"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="px-2 py-1 text-xs"
                        onClick={async () => {
                          if (!editFormData.isbn) return
                          setIsSearching(true)
                          const book = await fetchBookByISBN(editFormData.isbn)
                          setIsSearching(false)

                          if (book) {
                            if (window.confirm('取得した書籍情報で上書きしますか？')) {
                              setEditFormData(prev => ({
                                ...prev,
                                title: book.title,
                                subject: book.categories[0] || prev.subject,
                                coverUrl: book.coverUrl || '',
                                description: book.description,
                                pageCount: book.pageCount || 0,
                                authors: book.authors,
                                publisher: book.publisher,
                                publishedDate: book.publishedDate
                              }))
                            }
                          } else {
                            alert('書籍が見つかりませんでした')
                          }
                        }}
                        disabled={!editFormData.isbn || isSearching}
                      >
                        {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                        検索
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">タイトル</label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-600 mb-1">科目</label>
                      <input
                        type="text"
                        value={editFormData.subject}
                        onChange={(e) => setEditFormData({ ...editFormData, subject: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-gray-600 mb-1">ページ数</label>
                      <input
                        type="number"
                        value={editFormData.pageCount || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, pageCount: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">説明 (メモ)</label>
                    <textarea
                      value={editFormData.description}
                      onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded h-16"
                      placeholder="任意"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 問題集全体の標準タイム */}
            <div className="bg-orange-50 rounded-lg p-2 border border-orange-200">
              <h3 className="text-xs font-bold text-gray-800 mb-1">🎯 問題集全体の標準タイム</h3>
              <p className="text-[10px] text-gray-600 mb-2">
                セクション別に設定がない場合、この時間が使用されます
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(Math.max(0, workbookStandardTime - 30))}
                  className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
                >
                  -30秒
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(Math.max(0, workbookStandardTime - 10))}
                  className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
                >
                  -10秒
                </button>
                <div className="flex-1 text-center">
                  <span className="text-lg font-bold text-orange-700">{formatTime(workbookStandardTime)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(workbookStandardTime + 10)}
                  className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
                >
                  +10秒
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(workbookStandardTime + 30)}
                  className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
                >
                  +30秒
                </button>
              </div>
            </div>

            {/* セクション別設定 */}
            <div>
              <h3 className="text-xs font-bold text-gray-800 mb-2">📂 セクション別設定</h3>
              {sections.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  セクションがありません
                </p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const categoryMap = new Map<string, typeof sections>()
                    sections.forEach(section => {
                      const existing = categoryMap.get(section.category) || []
                      existing.push(section)
                      categoryMap.set(section.category, existing)
                    })

                    const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
                      const sectionsA = categoryMap.get(a) || []
                      const sectionsB = categoryMap.get(b) || []

                      if (sectionsA.length === 0 || sectionsB.length === 0) return 0

                      const firstProblemA = sectionsA[0].problems[0]
                      const firstProblemB = sectionsB[0].problems[0]

                      if (!firstProblemA || !firstProblemB) return 0

                      if (firstProblemA.page !== undefined && firstProblemB.page !== undefined) {
                        if (firstProblemA.page !== firstProblemB.page) {
                          return firstProblemA.page - firstProblemB.page
                        }
                      }

                      return firstProblemA.problemNumber.localeCompare(firstProblemB.problemNumber)
                    })

                    return sortedCategories.map(category => {
                      const categorySections = categoryMap.get(category) || []

                      const sortedSections = [...categorySections].sort((a, b) => {
                        const firstProblemA = a.problems[0]
                        const firstProblemB = b.problems[0]

                        if (!firstProblemA || !firstProblemB) return 0

                        if (firstProblemA.page !== undefined && firstProblemB.page !== undefined) {
                          if (firstProblemA.page !== firstProblemB.page) {
                            return firstProblemA.page - firstProblemB.page
                          }
                        }

                        return firstProblemA.problemNumber.localeCompare(firstProblemB.problemNumber)
                      })

                      return (
                        <div key={category} className="border border-gray-200 rounded p-1.5 bg-gray-50">
                          <h4 className="text-xs font-bold text-gray-700 mb-1 pb-1 border-b border-gray-300">
                            {category}
                          </h4>
                          <div className="space-y-1 mt-1">
                            {sortedSections.map((section) => (
                              <div
                                key={section.sectionKey}
                                className="bg-white border border-gray-200 rounded p-2"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">
                                      {section.title}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                      {section.problems.length}問 / 済{section.studiedCount}
                                      {section.averageReviewCount > 0 && (
                                        <span className="ml-1 text-purple-600 font-semibold">
                                          / {section.averageReviewCount}周目
                                        </span>
                                      )}
                                    </p>
                                  </div>

                                  {section.accuracy !== null && (
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${section.accuracy >= 80
                                        ? 'bg-green-100 text-green-700'
                                        : section.accuracy >= 50
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                        }`}
                                    >
                                      {section.accuracy}%
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentTime = sectionStandardTimes.get(section.sectionKey) || 0
                                        updateSectionStandardTime(section.sectionKey, currentTime - 10)
                                      }}
                                      className="px-1.5 py-0.5 text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                      -10
                                    </button>
                                    <span className="text-xs font-semibold text-gray-700 min-w-[2.5rem] text-center">
                                      {formatTime(sectionStandardTimes.get(section.sectionKey) || 0)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentTime = sectionStandardTimes.get(section.sectionKey) || 0
                                        updateSectionStandardTime(section.sectionKey, currentTime + 10)
                                      }}
                                      className="px-1.5 py-0.5 text-[10px] bg-white border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                      +10
                                    </button>
                                  </div>

                                  <label className="flex items-center gap-1 cursor-pointer px-2 py-1 bg-gray-50 rounded hover:bg-gray-100 transition-colors whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={excludedSections.includes(section.sectionKey)}
                                      onChange={() => toggleSectionExclusion(section.sectionKey)}
                                      className="w-3 h-3"
                                    />
                                    <span className="text-[10px] text-gray-700">除外</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsSettingsModalOpen(false)}
                size="sm"
              >
                キャンセル
              </Button>
              <Button type="button" onClick={handleSaveSettings} size="sm">
                保存
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 確認ダイアログ */}
      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

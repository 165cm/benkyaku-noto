import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Image, Settings, ChevronDown, Play, RotateCcw } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
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
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
  })

  // 拡張データ
  const [extendedWorkbooks, setExtendedWorkbooks] = useState<ExtendedWorkbook[]>([])

  // フィルタ・ソート
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all')
  const [studyStatusFilter, setStudyStatusFilter] = useState<StudyStatusFilter>('all')
  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('updated')

  // 設定モーダル
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [settingsWorkbook, setSettingsWorkbook] = useState<Workbook | null>(null)
  const [sections, setSections] = useState<SectionStats[]>([])
  const [excludedSections, setExcludedSections] = useState<string[]>([])
  const [workbookStandardTime, setWorkbookStandardTime] = useState(180)
  const [sectionStandardTimes, setSectionStandardTimes] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    loadWorkbooks()
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

  // 設定モーダルを開く
  const openSettingsModal = async (workbook: Workbook) => {
    setSettingsWorkbook(workbook)
    setIsSettingsModalOpen(true)

    const sectionList = await getWorkbookSections(workbook.id)
    setSections(sectionList)
    setExcludedSections(getExcludedSections())
    setWorkbookStandardTime(workbook.standardTime || 180)

    const sectionTimes = new Map<string, number>()
    for (const section of sectionList) {
      const time = getSectionStandardTime(section.sectionKey)
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
      await updateWorkbook(settingsWorkbook.id, { standardTime: workbookStandardTime })
    }

    for (const [sectionKey, time] of sectionStandardTimes.entries()) {
      if (time > 0) {
        setSectionStandardTime(sectionKey, time)
      }
    }

    saveExcludedSections(excludedSections)
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
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold">問題集</h1>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={16} className="mr-1" />
            新規作成
          </Button>
        </div>

        {/* フィルタチップ（横スクロール可能） */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/workbooks/import')}
            className="whitespace-nowrap"
          >
            <Image size={14} className="mr-1" />
            目次インポート
          </Button>
        </div>

        {/* ソート + 件数 */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">並替:</span>
            <div className="relative">
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="text-sm px-2 py-1 pr-6 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
              >
                <option value="updated">更新日順</option>
                <option value="updated-asc">更新日順（古）</option>
                <option value="accuracy">正解率順（高）</option>
                <option value="accuracy-asc">正解率順（低）</option>
                <option value="problems">問題数順（多）</option>
                <option value="problems-asc">問題数順（少）</option>
                <option value="name">名前順（あ→ん）</option>
                <option value="name-desc">名前順（ん→あ）</option>
              </select>
              <ChevronDown size={14} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>
          <span className="text-gray-500">{filteredAndSortedWorkbooks.length}件</span>
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
              className={`border-2 rounded-lg transition-all bg-white hover:shadow-md ${getBorderColor(workbook.accuracy)}`}
            >
              {/* タイトルエリア（タップで詳細へ） */}
              <div
                className="px-4 pt-3 pb-2 cursor-pointer"
                onClick={() => navigate(`/workbooks/${workbook.id}`)}
              >
                <h3 className="text-lg font-semibold leading-tight mb-1 text-gray-900">
                  {workbook.title}
                </h3>
                <p className="text-xs text-gray-600">
                  {workbook.subject} | {formatLastStudyDate(workbook.lastStudyDate)}
                </p>
              </div>

              {/* 進捗バー */}
              <div className="px-4 pb-2">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      workbook.studiedCount === workbook.totalProblems && workbook.totalProblems > 0
                        ? 'bg-green-500'
                        : workbook.studiedCount > 0
                        ? 'bg-blue-500'
                        : 'bg-gray-300'
                    }`}
                    style={{
                      width: workbook.totalProblems > 0
                        ? `${(workbook.studiedCount / workbook.totalProblems) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="flex justify-between items-center mt-1 text-xs text-gray-600">
                  <span>
                    {workbook.studiedCount}/{workbook.totalProblems}問
                  </span>
                  {workbook.totalProblems > 0 && (
                    <span>
                      {Math.round((workbook.studiedCount / workbook.totalProblems) * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* ステータス行 */}
              <div className="px-4 pb-2">
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  {/* 正解率 */}
                  {workbook.accuracy !== null && (
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${
                        workbook.accuracy >= 80
                          ? 'bg-green-100 text-green-700'
                          : workbook.accuracy >= 50
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      正解率 {workbook.accuracy}%
                    </span>
                  )}

                  {/* 標準タイム */}
                  {workbook.standardTime && (
                    <span className="text-gray-600">
                      📏 {formatTime(workbook.standardTime)}
                    </span>
                  )}
                </div>
              </div>

              {/* アクションボタン */}
              <div className="px-4 pb-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/workbooks/${workbook.id}`)
                  }}
                >
                  <Play size={14} className="mr-1" />
                  学習
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/workbooks/${workbook.id}?mode=review`)
                  }}
                >
                  <RotateCcw size={14} className="mr-1" />
                  復習
                </Button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openSettingsModal(workbook)
                  }}
                  className="px-3 py-1.5 hover:bg-white/80 rounded transition-colors"
                  title="設定"
                >
                  <Settings size={16} className="text-primary" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(workbook.id)
                  }}
                  className="px-3 py-1.5 hover:bg-white/80 rounded transition-colors"
                  title="削除"
                >
                  <Trash2 size={16} className="text-error" />
                </button>
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
                                    </p>
                                  </div>

                                  {section.accuracy !== null && (
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                                        section.accuracy >= 80
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
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Image, Settings } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { getWorkbooks, addWorkbook, deleteWorkbook, getProblems, updateWorkbook } from '@/lib/db'
import { calculateRecentAccuracyForProblems, getWorkbookSections, type SectionStats } from '@/lib/review'
import { getSectionStandardTime, setSectionStandardTime } from '@/lib/storage'
import type { Workbook } from '@/types'

export default function Workbooks() {
  const navigate = useNavigate()
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
  })
  const [workbookAccuracies, setWorkbookAccuracies] = useState<Map<string, number | null>>(new Map())

  // 設定モーダル
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [settingsWorkbook, setSettingsWorkbook] = useState<Workbook | null>(null)
  const [sections, setSections] = useState<SectionStats[]>([])
  const [workbookStandardTime, setWorkbookStandardTime] = useState(180) // 初期値3分（180秒）
  const [sectionStandardTimes, setSectionStandardTimes] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    loadWorkbooks()
  }, [])

  // 各問題集の直近回答の正解率を計算
  useEffect(() => {
    const calculateAccuracies = async () => {
      const accuracyMap = new Map<string, number | null>()

      for (const workbook of workbooks) {
        const problems = await getProblems(workbook.id)
        if (problems.length > 0) {
          const accuracy = await calculateRecentAccuracyForProblems(problems)
          accuracyMap.set(workbook.id, accuracy)
        } else {
          accuracyMap.set(workbook.id, null)
        }
      }

      setWorkbookAccuracies(accuracyMap)
    }

    if (workbooks.length > 0) {
      calculateAccuracies()
    } else {
      setWorkbookAccuracies(new Map())
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

    // セクション一覧を取得
    const sectionList = await getWorkbookSections(workbook.id)
    setSections(sectionList)

    // 問題集の標準時間を読み込み（デフォルトは3分=180秒）
    setWorkbookStandardTime(workbook.standardTime || 180)

    // 各セクションの標準時間を読み込み
    const sectionTimes = new Map<string, number>()
    for (const section of sectionList) {
      const time = getSectionStandardTime(section.sectionKey)
      if (time) {
        sectionTimes.set(section.sectionKey, time)
      } else {
        // デフォルト値は設定しない（workbookのstandardTimeを使用）
        sectionTimes.set(section.sectionKey, 0)
      }
    }
    setSectionStandardTimes(sectionTimes)
  }

  // 設定を保存
  const handleSaveSettings = async () => {
    if (!settingsWorkbook) return

    // 問題集の標準時間を保存
    if (workbookStandardTime > 0) {
      await updateWorkbook(settingsWorkbook.id, { standardTime: workbookStandardTime })
    }

    // 各セクションの標準時間を保存
    for (const [sectionKey, time] of sectionStandardTimes.entries()) {
      if (time > 0) {
        setSectionStandardTime(sectionKey, time)
      }
    }

    // モーダルを閉じる
    setIsSettingsModalOpen(false)
    setSettingsWorkbook(null)

    // 問題集一覧を再読み込み
    loadWorkbooks()
  }

  // セクション標準時間を更新
  const updateSectionStandardTime = (sectionKey: string, time: number) => {
    const newTimes = new Map(sectionStandardTimes)
    newTimes.set(sectionKey, Math.max(0, time)) // 0秒未満にならないように
    setSectionStandardTimes(newTimes)
  }

  // 時間フォーマット関数（秒 → M:SS形式）
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">問題集</h1>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/workbooks/import')}
          >
            <Image size={20} className="mr-2" />
            目次からインポート
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={20} className="mr-2" />
            新規作成
          </Button>
        </div>
      </div>

      {workbooks.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">問題集がありません</p>
          <Button onClick={() => setIsModalOpen(true)}>
            最初の問題集を作成
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {workbooks.map((workbook) => (
            <div
              key={workbook.id}
              className="bg-white border border-border rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between p-4">
                {/* 左側：タイトルと科目 */}
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/workbooks/${workbook.id}`)}
                >
                  <h3 className="font-semibold text-lg">{workbook.title}</h3>
                  <p className="text-sm text-gray-600">{workbook.subject}</p>
                </div>

                {/* 右側：ラベル群 */}
                <div className="flex items-center gap-2">
                  {/* 正解率 */}
                  {(() => {
                    const accuracy = workbookAccuracies.get(workbook.id)
                    if (accuracy !== null && accuracy !== undefined) {
                      const colorClass = accuracy >= 80
                        ? 'bg-green-100 text-green-700'
                        : accuracy >= 50
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${colorClass}`}>
                          正解率 {accuracy}%
                        </span>
                      )
                    }
                    return null
                  })()}

                  {/* 標準タイム */}
                  {workbook.standardTime && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded whitespace-nowrap">
                      📏 {Math.floor(workbook.standardTime / 60)}:{(workbook.standardTime % 60).toString().padStart(2, '0')}
                    </span>
                  )}

                  {/* 問題数 */}
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    {workbook.totalProblems}問
                  </span>

                  {/* 設定ボタン */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openSettingsModal(workbook)
                    }}
                    className="p-2 hover:bg-blue-100 rounded transition-colors"
                    title="設定"
                  >
                    <Settings size={16} className="text-primary" />
                  </button>

                  {/* 削除ボタン */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(workbook.id)
                    }}
                    className="p-2 hover:bg-red-100 rounded transition-colors"
                  >
                    <Trash2 size={16} className="text-error" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* 問題集全体の標準タイム */}
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <h3 className="text-sm font-bold text-gray-800 mb-2">🎯 問題集全体の標準タイム</h3>
              <p className="text-xs text-gray-600 mb-3">
                セクション別に設定がない場合、この時間が使用されます
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(Math.max(0, workbookStandardTime - 30))}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-bold"
                >
                  -30秒
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(Math.max(0, workbookStandardTime - 10))}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-bold"
                >
                  -10秒
                </button>
                <div className="flex-1 text-center">
                  <span className="text-2xl font-bold text-orange-700">{formatTime(workbookStandardTime)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(workbookStandardTime + 10)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-bold"
                >
                  +10秒
                </button>
                <button
                  type="button"
                  onClick={() => setWorkbookStandardTime(workbookStandardTime + 30)}
                  className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 font-bold"
                >
                  +30秒
                </button>
              </div>
            </div>

            {/* セクション別設定 */}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-3">📂 セクション別設定</h3>
              {sections.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  セクションがありません
                </p>
              ) : (
                <div className="space-y-4">
                  {/* カテゴリごとにグループ化 */}
                  {(() => {
                    // カテゴリでグループ化
                    const categoryMap = new Map<string, typeof sections>()
                    sections.forEach(section => {
                      const existing = categoryMap.get(section.category) || []
                      existing.push(section)
                      categoryMap.set(section.category, existing)
                    })

                    // カテゴリを問題番号順でソート
                    const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
                      // 各カテゴリの最初の問題を取得してソート
                      const sectionsA = categoryMap.get(a) || []
                      const sectionsB = categoryMap.get(b) || []

                      if (sectionsA.length === 0 || sectionsB.length === 0) return 0

                      const firstProblemA = sectionsA[0].problems[0]
                      const firstProblemB = sectionsB[0].problems[0]

                      if (!firstProblemA || !firstProblemB) return 0

                      // ページ番号でソート
                      if (firstProblemA.page !== undefined && firstProblemB.page !== undefined) {
                        if (firstProblemA.page !== firstProblemB.page) {
                          return firstProblemA.page - firstProblemB.page
                        }
                      }

                      // 問題番号で比較
                      return firstProblemA.problemNumber.localeCompare(firstProblemB.problemNumber)
                    })

                    return sortedCategories.map(category => {
                      const categorySections = categoryMap.get(category) || []

                      // セクションを問題番号順でソート
                      const sortedSections = [...categorySections].sort((a, b) => {
                        const firstProblemA = a.problems[0]
                        const firstProblemB = b.problems[0]

                        if (!firstProblemA || !firstProblemB) return 0

                        // ページ番号でソート
                        if (firstProblemA.page !== undefined && firstProblemB.page !== undefined) {
                          if (firstProblemA.page !== firstProblemB.page) {
                            return firstProblemA.page - firstProblemB.page
                          }
                        }

                        // 問題番号で比較
                        return firstProblemA.problemNumber.localeCompare(firstProblemB.problemNumber)
                      })

                      return (
                        <div key={category} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          <h4 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b border-gray-300">
                            {category}
                          </h4>
                          <div className="space-y-2">
                            {sortedSections.map((section) => (
                              <div
                                key={section.sectionKey}
                                className="bg-white border border-gray-200 rounded-lg p-3"
                              >
                                {/* セクション名と正答率 */}
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-800">
                                      {section.title}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {section.problems.length}問 / 学習済み {section.studiedCount}問
                                    </p>
                                  </div>
                                  {section.accuracy !== null && (
                                    <span
                                      className={`text-xs px-2 py-1 rounded font-medium ${
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
                                </div>

                                {/* 標準時間入力 */}
                                <div>
                                  <label className="text-xs text-gray-600 block mb-1">
                                    📏 標準タイム
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentTime = sectionStandardTimes.get(section.sectionKey) || 0
                                        updateSectionStandardTime(section.sectionKey, currentTime - 10)
                                      }}
                                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                      -10秒
                                    </button>
                                    <div className="flex-1 text-center">
                                      <span className="text-sm font-semibold text-gray-700">
                                        {formatTime(sectionStandardTimes.get(section.sectionKey) || 0)}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentTime = sectionStandardTimes.get(section.sectionKey) || 0
                                        updateSectionStandardTime(section.sectionKey, currentTime + 10)
                                      }}
                                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                      +10秒
                                    </button>
                                  </div>
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

            {/* 保存ボタン */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsSettingsModalOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="button" onClick={handleSaveSettings}>
                保存
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

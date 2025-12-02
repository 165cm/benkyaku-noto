import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Image, Settings } from 'lucide-react'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import { getWorkbooks, addWorkbook, deleteWorkbook, getProblems, updateWorkbook } from '@/lib/db'
import { calculateRecentAccuracyForProblems, getWorkbookSections, type SectionStats } from '@/lib/review'
import { getExcludedSections, saveExcludedSections, getSectionStandardTime, setSectionStandardTime } from '@/lib/storage'
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
  const [excludedSections, setExcludedSections] = useState<string[]>([])
  const [workbookStandardTimeInput, setWorkbookStandardTimeInput] = useState('')
  const [sectionStandardTimeInputs, setSectionStandardTimeInputs] = useState<Map<string, string>>(new Map())

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

    // 除外設定を読み込み
    setExcludedSections(getExcludedSections())

    // 問題集の標準時間を読み込み
    if (workbook.standardTime) {
      const mins = Math.floor(workbook.standardTime / 60)
      const secs = workbook.standardTime % 60
      setWorkbookStandardTimeInput(`${mins}:${secs.toString().padStart(2, '0')}`)
    } else {
      setWorkbookStandardTimeInput('')
    }

    // 各セクションの標準時間を読み込み
    const sectionInputs = new Map<string, string>()
    for (const section of sectionList) {
      const time = getSectionStandardTime(section.sectionKey)
      if (time) {
        const mins = Math.floor(time / 60)
        const secs = time % 60
        sectionInputs.set(section.sectionKey, `${mins}:${secs.toString().padStart(2, '0')}`)
      }
    }
    setSectionStandardTimeInputs(sectionInputs)
  }

  // 設定を保存
  const handleSaveSettings = async () => {
    if (!settingsWorkbook) return

    // 問題集の標準時間を保存
    if (workbookStandardTimeInput) {
      const [mins, secs] = workbookStandardTimeInput.split(':').map(s => parseInt(s.trim(), 10) || 0)
      const timeInSeconds = mins * 60 + secs
      if (timeInSeconds > 0) {
        await updateWorkbook(settingsWorkbook.id, { standardTime: timeInSeconds })
      }
    }

    // 各セクションの標準時間を保存
    for (const [sectionKey, input] of sectionStandardTimeInputs.entries()) {
      if (input) {
        const [mins, secs] = input.split(':').map(s => parseInt(s.trim(), 10) || 0)
        const timeInSeconds = mins * 60 + secs
        if (timeInSeconds > 0) {
          setSectionStandardTime(sectionKey, timeInSeconds)
        }
      }
    }

    // 除外設定を保存
    saveExcludedSections(excludedSections)

    // モーダルを閉じる
    setIsSettingsModalOpen(false)
    setSettingsWorkbook(null)

    // 問題集一覧を再読み込み
    loadWorkbooks()
  }

  // セクション除外をトグル
  const toggleSectionExclusion = (sectionKey: string) => {
    if (excludedSections.includes(sectionKey)) {
      setExcludedSections(excludedSections.filter(s => s !== sectionKey))
    } else {
      setExcludedSections([...excludedSections, sectionKey])
    }
  }

  // セクション標準時間の入力を更新
  const updateSectionStandardTimeInput = (sectionKey: string, value: string) => {
    const newInputs = new Map(sectionStandardTimeInputs)
    newInputs.set(sectionKey, value)
    setSectionStandardTimeInputs(newInputs)
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
              <input
                type="text"
                value={workbookStandardTimeInput}
                onChange={(e) => setWorkbookStandardTimeInput(e.target.value)}
                placeholder="例: 3:00"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </div>

            {/* セクション別設定 */}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-3">📂 セクション別設定</h3>
              {sections.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  セクションがありません
                </p>
              ) : (
                <div className="space-y-2">
                  {sections.map((section) => (
                    <div
                      key={section.sectionKey}
                      className="bg-white border border-gray-200 rounded-lg p-3"
                    >
                      {/* セクション名と正答率 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">
                            {section.category} - {section.title}
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

                      {/* 標準時間入力と復習除外 */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-600 block mb-1">
                            📏 標準タイム
                          </label>
                          <input
                            type="text"
                            value={sectionStandardTimeInputs.get(section.sectionKey) || ''}
                            onChange={(e) =>
                              updateSectionStandardTimeInput(section.sectionKey, e.target.value)
                            }
                            placeholder="例: 2:30"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                          />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 cursor-pointer w-full px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <input
                              type="checkbox"
                              checked={excludedSections.includes(section.sectionKey)}
                              onChange={() => toggleSectionExclusion(section.sectionKey)}
                              className="w-4 h-4"
                            />
                            <span className="text-xs text-gray-700">復習から除外</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
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

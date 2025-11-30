import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, AlertCircle, CheckCircle, Trash2, Bug, Filter, ChevronDown, ChevronRight, Cloud, CloudUpload, CloudDownload } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import {
  saveOpenAIApiKey,
  getOpenAIApiKey,
  removeOpenAIApiKey,
  getExcludedCategories,
  saveExcludedCategories,
  getExcludedSections,
  saveExcludedSections,
  getLastBackupTime,
  getLastRestoreTime
} from '@/lib/storage'
import { db } from '@/lib/db'
import { backupToCloud, restoreFromCloud, calculateBackupSize, type SyncProgress } from '@/lib/sync'
import { useAuthStore } from '@/store/authStore'
import type { Problem, Workbook } from '@/types'

interface SectionInfo {
  category: string
  sectionTitle: string
  sectionKey: string
}

interface CategoryGroup {
  category: string
  sections: SectionInfo[]
}

interface WorkbookGroup {
  workbook: Workbook
  categoryGroups: CategoryGroup[]
}

export default function Settings() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [apiKey, setApiKey] = useState('')
  const [isApiKeySet, setIsApiKeySet] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showApiKeySection, setShowApiKeySection] = useState(false)

  // 除外設定
  const [workbookGroups, setWorkbookGroups] = useState<WorkbookGroup[]>([])
  const [excludedCategories, setExcludedCategories] = useState<string[]>([])
  const [excludedSections, setExcludedSections] = useState<string[]>([])
  const [expandedWorkbooks, setExpandedWorkbooks] = useState<string[]>([])
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])

  // バックアップ・復元
  const [backupSize, setBackupSize] = useState<{ totalItems: number; estimatedSizeKB: number } | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null)
  const [lastRestoreTime, setLastRestoreTime] = useState<Date | null>(null)

  useEffect(() => {
    const existingKey = getOpenAIApiKey()
    if (existingKey) {
      setApiKey(existingKey)
      setIsApiKeySet(true)
    }

    // 除外設定をロード
    setExcludedCategories(getExcludedCategories())
    setExcludedSections(getExcludedSections())

    // 問題集・カテゴリ・セクション一覧を取得
    loadWorkbookCategorySections()

    // バックアップサイズと最終同期日時を取得
    calculateBackupSize().then(setBackupSize)
    setLastBackupTime(getLastBackupTime())
    setLastRestoreTime(getLastRestoreTime())
  }, [])

  const loadWorkbookCategorySections = async () => {
    const allWorkbooks = await db.workbooks.toArray()
    const allProblems = await db.problems.toArray()
    const activeProblems = allProblems.filter(p => !p.deletedAt && !p.parentProblemId)

    const result: WorkbookGroup[] = []

    for (const workbook of allWorkbooks) {
      const workbookProblems = activeProblems.filter(p => p.workbookId === workbook.id)

      // カテゴリごとにセクションをグルーピング
      const categoryMap = new Map<string, Map<string, Problem[]>>()

      workbookProblems.forEach((problem: Problem) => {
        const category = problem.category || '未分類'
        const sectionTitle = problem.sectionTitle || '問題'

        if (!categoryMap.has(category)) {
          categoryMap.set(category, new Map())
        }

        const sections = categoryMap.get(category)!
        if (!sections.has(sectionTitle)) {
          sections.set(sectionTitle, [])
        }
        sections.get(sectionTitle)!.push(problem)
      })

      // カテゴリごとのセクション一覧を作成
      const categoryGroups: CategoryGroup[] = []
      categoryMap.forEach((sections, category) => {
        const sectionInfos: SectionInfo[] = []

        sections.forEach((_problems, sectionTitle) => {
          const sectionKey = `${category}|||${sectionTitle}`

          sectionInfos.push({
            category,
            sectionTitle,
            sectionKey,
          })
        })

        // セクションをsortOrder順にソート
        sectionInfos.sort((a, b) => {
          const problemsA = sections.get(a.sectionTitle) || []
          const problemsB = sections.get(b.sectionTitle) || []
          const minA = Math.min(...problemsA.map(p => p.sortOrder || 0))
          const minB = Math.min(...problemsB.map(p => p.sortOrder || 0))
          return minA - minB
        })

        categoryGroups.push({
          category,
          sections: sectionInfos
        })
      })

      // カテゴリを名前順にソート
      categoryGroups.sort((a, b) => a.category.localeCompare(b.category, 'ja'))

      if (categoryGroups.length > 0) {
        result.push({
          workbook,
          categoryGroups
        })
      }
    }

    // 問題集を作成日時の新しい順にソート
    setWorkbookGroups(result.sort((a, b) =>
      b.workbook.createdAt.getTime() - a.workbook.createdAt.getTime()
    ))
  }

  const toggleWorkbook = (workbookId: string) => {
    if (expandedWorkbooks.includes(workbookId)) {
      setExpandedWorkbooks(expandedWorkbooks.filter(id => id !== workbookId))
    } else {
      setExpandedWorkbooks([...expandedWorkbooks, workbookId])
    }
  }

  const toggleCategory = (categoryKey: string) => {
    if (expandedCategories.includes(categoryKey)) {
      setExpandedCategories(expandedCategories.filter(c => c !== categoryKey))
    } else {
      setExpandedCategories([...expandedCategories, categoryKey])
    }
  }

  const toggleExcludeCategory = (category: string) => {
    let newExcluded: string[]
    if (excludedCategories.includes(category)) {
      newExcluded = excludedCategories.filter(c => c !== category)
    } else {
      newExcluded = [...excludedCategories, category]
    }
    setExcludedCategories(newExcluded)
    saveExcludedCategories(newExcluded)
  }

  const toggleExcludeSection = (sectionKey: string) => {
    let newExcluded: string[]
    if (excludedSections.includes(sectionKey)) {
      newExcluded = excludedSections.filter(s => s !== sectionKey)
    } else {
      newExcluded = [...excludedSections, sectionKey]
    }
    setExcludedSections(newExcluded)
    saveExcludedSections(newExcluded)
  }

  const handleSave = () => {
    if (apiKey.trim()) {
      saveOpenAIApiKey(apiKey.trim())
      setIsApiKeySet(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handleRemove = () => {
    if (confirm('APIキーを削除しますか？')) {
      removeOpenAIApiKey()
      setApiKey('')
      setIsApiKeySet(false)
    }
  }

  const handleBackup = async () => {
    if (!user) {
      alert('ログインが必要です')
      return
    }

    if (!confirm('ローカルデータをクラウドにバックアップしますか？\n既存のクラウドデータは上書きされます。')) {
      return
    }

    try {
      setSyncMessage(null)
      await backupToCloud(user.uid, setSyncProgress)
      setLastBackupTime(getLastBackupTime())
      setSyncMessage({ type: 'success', text: 'バックアップが完了しました' })
      setTimeout(() => setSyncMessage(null), 5000)
    } catch (error) {
      console.error('Backup error:', error)
      setSyncMessage({ type: 'error', text: 'バックアップに失敗しました' })
    } finally {
      setSyncProgress(null)
    }
  }

  const handleRestore = async () => {
    if (!user) {
      alert('ログインが必要です')
      return
    }

    if (!confirm('クラウドからデータを復元しますか？\nローカルデータとマージされます。')) {
      return
    }

    try {
      setSyncMessage(null)
      await restoreFromCloud(user.uid, setSyncProgress)
      setLastRestoreTime(getLastRestoreTime())
      setSyncMessage({ type: 'success', text: '復元が完了しました' })
      setTimeout(() => {
        setSyncMessage(null)
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error('Restore error:', error)
      setSyncMessage({ type: 'error', text: '復元に失敗しました' })
    } finally {
      setSyncProgress(null)
    }
  }

  const formatSyncTime = (date: Date | null) => {
    if (!date) return '未同期'
    return format(date, 'M月d日 HH:mm', { locale: ja })
  }

  const maskedApiKey = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : ''

  return (
    <div className="pb-8">
      <h1 className="text-xl font-bold mb-4">設定</h1>

      {/* データの同期 - 最も使用頻度が高い */}
      <Card className="mb-4">
        <div className="flex items-start gap-2">
          <Cloud className="text-primary mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold mb-1">データの同期</h2>
            <p className="text-xs text-gray-600 mb-3">
              学習データをクラウドにバックアップ・復元
            </p>

            {backupSize && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-3">
                <p className="text-xs text-blue-800">
                  <strong>ローカル:</strong> {backupSize.totalItems}件 (約{backupSize.estimatedSizeKB}KB)
                </p>
              </div>
            )}

            {/* 最終同期日時 */}
            {(lastBackupTime || lastRestoreTime) && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-2 mb-3 text-xs">
                {lastBackupTime && (
                  <div className="flex items-center gap-1 text-gray-700 mb-1">
                    <CloudUpload size={14} className="flex-shrink-0" />
                    <span className="flex-1">最終バックアップ: {formatSyncTime(lastBackupTime)}</span>
                  </div>
                )}
                {lastRestoreTime && (
                  <div className="flex items-center gap-1 text-gray-700">
                    <CloudDownload size={14} className="flex-shrink-0" />
                    <span className="flex-1">最終復元: {formatSyncTime(lastRestoreTime)}</span>
                  </div>
                )}
              </div>
            )}

            {syncProgress && (
              <div className="bg-gray-100 border border-gray-200 rounded-md p-2 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 flex-shrink-0"></div>
                  <p className="text-xs font-medium">{syncProgress.message}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {syncMessage && (
              <div className={`border rounded-md p-2 mb-3 ${
                syncMessage.type === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {syncMessage.type === 'success' ? (
                    <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                  )}
                  <p className={`text-xs font-medium ${
                    syncMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
                  }`}>{syncMessage.text}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleBackup}
                disabled={!user || !!syncProgress}
                className="text-sm py-2"
              >
                <CloudUpload size={14} className="mr-1" />
                バックアップ
              </Button>
              <Button
                variant="secondary"
                onClick={handleRestore}
                disabled={!user || !!syncProgress}
                className="text-sm py-2"
              >
                <CloudDownload size={14} className="mr-1" />
                復元
              </Button>
            </div>

            {!user && (
              <p className="text-xs text-gray-500 mt-2">
                <strong>ログイン</strong>が必要です
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 復習除外設定 - 使用頻度が高い */}
      <Card className="mb-4">
        <div className="flex items-start gap-2">
          <Filter className="text-gray-600 mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold mb-1">復習除外設定</h2>
            <p className="text-xs text-gray-600 mb-3">
              問題集ごとにカテゴリ・セクション単位で復習から除外
            </p>

            {workbookGroups.length === 0 ? (
              <p className="text-xs text-gray-500">問題が登録されていません</p>
            ) : (
              <div className="space-y-2">
                {workbookGroups.map(({ workbook, categoryGroups }) => (
                  <div key={workbook.id} className="border border-border rounded-md overflow-hidden">
                    {/* 問題集ヘッダー */}
                    <button
                      onClick={() => toggleWorkbook(workbook.id)}
                      className="w-full flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-150 transition-colors"
                    >
                      {expandedWorkbooks.includes(workbook.id) ? (
                        <ChevronDown size={16} className="flex-shrink-0 text-gray-500" />
                      ) : (
                        <ChevronRight size={16} className="flex-shrink-0 text-gray-500" />
                      )}
                      <span className="text-sm font-medium text-gray-800 truncate flex-1 text-left">
                        {workbook.title}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {categoryGroups.reduce((sum, cg) => sum + cg.sections.length, 0)}個
                      </span>
                    </button>

                    {/* カテゴリ一覧 */}
                    {expandedWorkbooks.includes(workbook.id) && (
                      <div className="bg-white">
                        {categoryGroups.map(({ category, sections }) => {
                          const categoryKey = `${workbook.id}-${category}`
                          return (
                            <div key={categoryKey} className="border-t border-gray-200">
                              <div className="flex items-center gap-2 p-2 bg-gray-50">
                                <button
                                  onClick={() => toggleCategory(categoryKey)}
                                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
                                >
                                  {expandedCategories.includes(categoryKey) ? (
                                    <ChevronDown size={14} />
                                  ) : (
                                    <ChevronRight size={14} />
                                  )}
                                </button>
                                <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={excludedCategories.includes(category)}
                                    onChange={() => toggleExcludeCategory(category)}
                                    className="w-3.5 h-3.5 text-primary rounded flex-shrink-0"
                                  />
                                  <span className="text-xs font-medium truncate">{category}</span>
                                  {excludedCategories.includes(category) && (
                                    <span className="text-xs text-error flex-shrink-0">(除外)</span>
                                  )}
                                </label>
                              </div>

                              {expandedCategories.includes(categoryKey) && (
                                <div className="p-2 space-y-1 bg-white">
                                  {sections.map(section => {
                                    const isCategoryExcluded = excludedCategories.includes(category)
                                    return (
                                      <label
                                        key={section.sectionKey}
                                        className={`flex items-center gap-2 ml-4 cursor-pointer ${
                                          isCategoryExcluded ? 'opacity-50' : ''
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={excludedSections.includes(section.sectionKey)}
                                          onChange={() => toggleExcludeSection(section.sectionKey)}
                                          disabled={isCategoryExcluded}
                                          className="w-3.5 h-3.5 text-primary rounded flex-shrink-0"
                                        />
                                        <span className="text-xs truncate flex-1">{section.sectionTitle}</span>
                                        {excludedSections.includes(section.sectionKey) && !isCategoryExcluded && (
                                          <span className="text-xs text-error flex-shrink-0">(除外)</span>
                                        )}
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(excludedCategories.length > 0 || excludedSections.length > 0) && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-xs text-yellow-800">
                  {excludedCategories.length > 0 && (
                    <span>除外カテゴリ: {excludedCategories.length}件</span>
                  )}
                  {excludedCategories.length > 0 && excludedSections.length > 0 && ' / '}
                  {excludedSections.length > 0 && (
                    <span>除外セクション: {excludedSections.length}件</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ゴミ箱 */}
      <Card className="mb-4">
        <div className="flex items-start gap-2">
          <Trash2 className="text-gray-600 mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold mb-1">ゴミ箱</h2>
            <p className="text-xs text-gray-600 mb-2">
              削除した問題を復元または完全削除
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/trash')}
              className="text-sm py-2"
            >
              <Trash2 size={14} className="mr-1" />
              ゴミ箱を開く
            </Button>
          </div>
        </div>
      </Card>

      {/* OpenAI APIキー - 初回のみ使用、折りたたみ可能 */}
      <Card className="mb-4">
        <div className="flex items-start gap-2">
          <Key className="text-primary mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setShowApiKeySection(!showApiKeySection)}
              className="w-full flex items-center justify-between mb-2"
            >
              <h2 className="text-base font-semibold">OpenAI APIキー</h2>
              {showApiKeySection ? (
                <ChevronDown size={16} className="text-gray-500" />
              ) : (
                <ChevronRight size={16} className="text-gray-500" />
              )}
            </button>

            {isApiKeySet && !showApiKeySection && (
              <div className="flex items-center gap-1 text-success text-xs">
                <CheckCircle size={14} />
                <span>設定済み: {maskedApiKey}</span>
              </div>
            )}

            {showApiKeySection && (
              <>
                <p className="text-xs text-gray-600 mb-2">
                  目次画像から問題集を作成する機能で使用
                </p>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mb-3">
                  <div className="flex items-start gap-1">
                    <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={14} />
                    <div className="text-xs text-yellow-800">
                      <p className="font-semibold mb-0.5">セキュリティについて</p>
                      <p className="text-xs">
                        APIキーはブラウザのローカルストレージに保存されます。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      APIキー
                    </label>
                    <div className="flex gap-2 mb-1">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="flex-1 px-2 py-1.5 border border-border rounded text-xs font-mono"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="text-xs py-1.5 px-3"
                      >
                        {showApiKey ? '隠す' : '表示'}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        OpenAI
                      </a>
                      で取得
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={!apiKey.trim()} className="text-sm py-1.5">
                      保存
                    </Button>
                    {isApiKeySet && (
                      <Button variant="error" onClick={handleRemove} className="text-sm py-1.5">
                        削除
                      </Button>
                    )}
                  </div>

                  {saved && (
                    <div className="flex items-center gap-1 text-success text-xs">
                      <CheckCircle size={14} />
                      <span>保存しました</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* デバッグ - 開発用 */}
      <Card>
        <div className="flex items-start gap-2">
          <Bug className="text-gray-600 mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold mb-1">デバッグ</h2>
            <p className="text-xs text-gray-600 mb-2">
              問題データの詳細を確認（開発用）
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/debug')}
              className="text-sm py-2"
            >
              <Bug size={14} className="mr-1" />
              デバッグページを開く
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

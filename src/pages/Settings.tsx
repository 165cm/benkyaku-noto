import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, AlertCircle, CheckCircle, Trash2, Bug, Filter, ChevronDown, ChevronRight, Cloud, CloudUpload, CloudDownload } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import {
  saveOpenAIApiKey,
  getOpenAIApiKey,
  removeOpenAIApiKey,
  getExcludedCategories,
  saveExcludedCategories,
  getExcludedSections,
  saveExcludedSections
} from '@/lib/storage'
import { db } from '@/lib/db'
import { backupToCloud, restoreFromCloud, calculateBackupSize, type SyncProgress } from '@/lib/sync'
import { useAuthStore } from '@/store/authStore'
import type { Problem } from '@/types'

interface SectionInfo {
  category: string
  sectionTitle: string
  sectionKey: string
}

interface CategoryGroup {
  category: string
  sections: SectionInfo[]
}

export default function Settings() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [apiKey, setApiKey] = useState('')
  const [isApiKeySet, setIsApiKeySet] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // 除外設定
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [excludedCategories, setExcludedCategories] = useState<string[]>([])
  const [excludedSections, setExcludedSections] = useState<string[]>([])
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])

  // バックアップ・復元
  const [backupSize, setBackupSize] = useState<{ totalItems: number; estimatedSizeKB: number } | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const existingKey = getOpenAIApiKey()
    if (existingKey) {
      setApiKey(existingKey)
      setIsApiKeySet(true)
    }

    // 除外設定をロード
    setExcludedCategories(getExcludedCategories())
    setExcludedSections(getExcludedSections())

    // カテゴリ・セクション一覧を取得
    loadCategorySections()

    // バックアップサイズを計算
    calculateBackupSize().then(setBackupSize)
  }, [])

  const loadCategorySections = async () => {
    const allProblems = await db.problems.toArray()
    const activeProblems = allProblems.filter(p => !p.deletedAt && !p.parentProblemId)

    // カテゴリごとにセクションをグルーピング（WorkbookDetail.tsxと同じロジック）
    const categoryMap = new Map<string, Map<string, Problem[]>>()

    activeProblems.forEach((problem: Problem) => {
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
    const result: CategoryGroup[] = []
    categoryMap.forEach((sections, category) => {
      const sectionInfos: SectionInfo[] = []

      sections.forEach((_problems, sectionTitle) => {
        // セクションキーは category|||sectionTitle の形式
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

      result.push({
        category,
        sections: sectionInfos
      })
    })

    // カテゴリを名前順にソート
    setCategoryGroups(result.sort((a, b) => a.category.localeCompare(b.category, 'ja')))
  }

  const toggleCategory = (category: string) => {
    if (expandedCategories.includes(category)) {
      setExpandedCategories(expandedCategories.filter(c => c !== category))
    } else {
      setExpandedCategories([...expandedCategories, category])
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
      setSyncMessage({ type: 'success', text: '復元が完了しました' })
      setTimeout(() => {
        setSyncMessage(null)
        window.location.reload() // ページをリロードして最新データを表示
      }, 2000)
    } catch (error) {
      console.error('Restore error:', error)
      setSyncMessage({ type: 'error', text: '復元に失敗しました' })
    } finally {
      setSyncProgress(null)
    }
  }

  const maskedApiKey = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : ''

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">設定</h1>

      <Card className="mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Key className="text-primary mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">OpenAI APIキー</h2>
            <p className="text-sm text-gray-600 mb-4">
              目次画像から自動的に問題集を作成する機能を使用するには、OpenAI
              APIキーが必要です。
            </p>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">セキュリティについて</p>
                  <p>
                    APIキーはブラウザのローカルストレージに保存されます。他人と共有しているデバイスでは使用しないでください。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  APIキー
                </label>
                <div className="flex gap-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? '隠す' : '表示'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  APIキーは{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    OpenAIのダッシュボード
                  </a>
                  で取得できます
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={!apiKey.trim()}>
                  保存
                </Button>
                {isApiKeySet && (
                  <Button variant="error" onClick={handleRemove}>
                    削除
                  </Button>
                )}
              </div>

              {saved && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle size={20} />
                  <span className="text-sm font-medium">保存しました</span>
                </div>
              )}

              {isApiKeySet && !saved && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle size={20} />
                  <span className="text-sm">
                    APIキー設定済み: {maskedApiKey}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-3">使い方</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>OpenAI APIキーを上記に設定</li>
          <li>問題集ページで「目次からインポート」ボタンをクリック</li>
          <li>参考書の目次ページを撮影した画像をアップロード</li>
          <li>AIが自動的に章・節・タグを抽出</li>
          <li>内容を確認・編集して問題集を作成</li>
        </ol>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Filter className="text-gray-600 mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">復習除外設定</h2>
            <p className="text-sm text-gray-600 mb-4">
              カテゴリまたはセクション単位で復習候補から除外できます
            </p>

            {categoryGroups.length === 0 ? (
              <p className="text-sm text-gray-500">問題が登録されていません</p>
            ) : (
              <div className="space-y-2">
                {categoryGroups.map(({ category, sections }) => (
                  <div key={category} className="border border-border rounded-lg">
                    <div className="flex items-center gap-2 p-3 bg-gray-50">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
                      >
                        {expandedCategories.includes(category) ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excludedCategories.includes(category)}
                          onChange={() => toggleExcludeCategory(category)}
                          className="w-4 h-4 text-primary rounded"
                        />
                        <span className="font-medium text-sm">{category}</span>
                        {excludedCategories.includes(category) && (
                          <span className="text-xs text-error">(除外中)</span>
                        )}
                      </label>
                    </div>

                    {expandedCategories.includes(category) && (
                      <div className="p-3 pt-0 space-y-1">
                        {sections.map(section => {
                          const isCategoryExcluded = excludedCategories.includes(category)
                          return (
                            <label
                              key={section.sectionKey}
                              className={`flex items-center gap-2 ml-6 cursor-pointer ${
                                isCategoryExcluded ? 'opacity-50' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={excludedSections.includes(section.sectionKey)}
                                onChange={() => toggleExcludeSection(section.sectionKey)}
                                disabled={isCategoryExcluded}
                                className="w-4 h-4 text-primary rounded flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-gray-500 block">{section.category}</span>
                                <span className="text-sm block truncate">{section.sectionTitle}</span>
                              </div>
                              {excludedSections.includes(section.sectionKey) && !isCategoryExcluded && (
                                <span className="text-xs text-error flex-shrink-0">(除外中)</span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(excludedCategories.length > 0 || excludedSections.length > 0) && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
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

      <Card className="mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Cloud className="text-primary mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">データの同期</h2>
            <p className="text-sm text-gray-600 mb-4">
              学習データをクラウドにバックアップして、複数のデバイスで同期できます
            </p>

            {backupSize && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>ローカルデータ:</strong> {backupSize.totalItems}件 (約{backupSize.estimatedSizeKB}KB)
                </p>
              </div>
            )}

            {syncProgress && (
              <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <p className="text-sm font-medium">{syncProgress.message}</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {syncMessage && (
              <div className={`border rounded-lg p-4 mb-4 ${
                syncMessage.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {syncMessage.type === 'success' ? (
                    <CheckCircle size={20} />
                  ) : (
                    <AlertCircle size={20} />
                  )}
                  <p className="text-sm font-medium">{syncMessage.text}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleBackup}
                disabled={!user || !!syncProgress}
              >
                <CloudUpload size={16} className="mr-2" />
                バックアップ
              </Button>
              <Button
                variant="secondary"
                onClick={handleRestore}
                disabled={!user || !!syncProgress}
              >
                <CloudDownload size={16} className="mr-2" />
                復元
              </Button>
            </div>

            {!user && (
              <p className="text-sm text-gray-500 mt-4">
                データ同期を使用するには、<strong>ログイン</strong>が必要です
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Trash2 className="text-gray-600 mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">ゴミ箱</h2>
            <p className="text-sm text-gray-600 mb-4">
              削除した問題を復元または完全削除できます
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/trash')}
            >
              <Trash2 size={16} className="mr-2" />
              ゴミ箱を開く
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Bug className="text-gray-600 mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">デバッグ</h2>
            <p className="text-sm text-gray-600 mb-4">
              問題データの詳細を確認できます（開発用）
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/debug')}
            >
              <Bug size={16} className="mr-2" />
              デバッグページを開く
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, AlertCircle, CheckCircle, Trash2, Bug, ChevronDown, ChevronRight, Cloud, CloudUpload, CloudDownload, Target, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import {
  saveOpenAIApiKey,
  getOpenAIApiKey,
  removeOpenAIApiKey,
  isUsingEnvApiKey,
  getLastBackupTime,
  getLastRestoreTime,
  getWeekStartDay,
  saveWeekStartDay,
  type WeekStartDay
} from '@/lib/storage'
import {
  getWeeklyGoals,
  saveWeeklyGoals,
  calculateWeeklyTotal,
  getDayLabel,
  type WeeklyGoals,
  type DayOfWeek
} from '@/lib/studyGoals'
import { backupToCloud, restoreFromCloud, calculateBackupSize, type SyncProgress } from '@/lib/sync'
import { useAuthStore } from '@/store/authStore'
export default function Settings() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [apiKey, setApiKey] = useState('')
  const [isApiKeySet, setIsApiKeySet] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showApiKeySection, setShowApiKeySection] = useState(false)
  const [usingEnvKey, setUsingEnvKey] = useState(false)

  // バックアップ・復元
  const [backupSize, setBackupSize] = useState<{ totalItems: number; estimatedSizeKB: number } | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null)
  const [lastRestoreTime, setLastRestoreTime] = useState<Date | null>(null)

  // 学習時間目標
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoals>(getWeeklyGoals())
  const [goalsSaved, setGoalsSaved] = useState(false)
  const [showGoalsSettings, setShowGoalsSettings] = useState(false)

  // 週設定
  const [weekStartDay, setWeekStartDay] = useState<WeekStartDay>(getWeekStartDay())
  const [weekSettingsSaved, setWeekSettingsSaved] = useState(false)
  const [showWeekSettings, setShowWeekSettings] = useState(false)

  useEffect(() => {
    // 環境変数チェック
    setUsingEnvKey(isUsingEnvApiKey())

    const existingKey = getOpenAIApiKey()
    if (existingKey) {
      setApiKey(existingKey)
      setIsApiKeySet(true)
    }

    // バックアップサイズと最終同期日時を取得
    calculateBackupSize().then(setBackupSize)
    setLastBackupTime(getLastBackupTime())
    setLastRestoreTime(getLastRestoreTime())
  }, [])

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

  // 学習時間目標を保存
  const handleSaveGoals = () => {
    saveWeeklyGoals(weeklyGoals)
    setGoalsSaved(true)
    setTimeout(() => setGoalsSaved(false), 2000)
  }

  // 学習時間目標を更新
  const updateGoal = (day: DayOfWeek, minutes: number) => {
    setWeeklyGoals(prev => ({ ...prev, [day]: minutes }))
  }

  // 週設定を保存
  const handleSaveWeekSettings = () => {
    saveWeekStartDay(weekStartDay)
    setWeekSettingsSaved(true)
    setTimeout(() => setWeekSettingsSaved(false), 2000)
  }

  const maskedApiKey = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : ''

  return (
    <div className="pb-8">
      <h1 className="text-xl font-bold mb-4">設定</h1>

      {/* 学習時間目標 */}
      <Card className="mb-4">
        <div className="flex items-start gap-2">
          <Target className="text-primary mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setShowGoalsSettings(!showGoalsSettings)}
              className="w-full flex items-center justify-between group"
            >
              <div>
                <h2 className="text-base font-semibold text-left">学習時間目標</h2>
                <p className="text-xs text-gray-600 text-left">
                  各曜日の目標学習時間を設定
                </p>
              </div>
              {showGoalsSettings ? <ChevronDown size={20} className="text-gray-400 group-hover:text-gray-600" /> : <ChevronRight size={20} className="text-gray-400 group-hover:text-gray-600" />}
            </button>

            {showGoalsSettings && (
              <div className="mt-3">
                {/* 週合計 */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-md p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">週合計</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {Math.floor(calculateWeeklyTotal(weeklyGoals) / 60)}時間
                      {calculateWeeklyTotal(weeklyGoals) % 60 > 0 && (
                        <span className="text-lg">{calculateWeeklyTotal(weeklyGoals) % 60}分</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* 曜日別入力 */}
                <div className="grid grid-cols-1 gap-2 mb-3">
                  {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as DayOfWeek[]).map(day => (
                    <div key={day} className="flex items-center gap-3 bg-gray-50 rounded-md p-2">
                      <span className="text-sm font-medium text-gray-700 w-8">{getDayLabel(day)}曜</span>
                      <input
                        type="number"
                        min="0"
                        max="1440"
                        step="15"
                        value={weeklyGoals[day]}
                        onChange={(e) => updateGoal(day, Math.max(0, parseInt(e.target.value) || 0))}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <span className="text-xs text-gray-500 w-8">分</span>
                    </div>
                  ))}
                </div>

                {/* 保存ボタン */}
                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveGoals} size="sm" className="flex-1">
                    💾 保存
                  </Button>
                  {goalsSaved && (
                    <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 週表示設定 */}
      <Card className="mb-4">
        <div className="flex items-start gap-2">
          <Calendar className="text-primary mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setShowWeekSettings(!showWeekSettings)}
              className="w-full flex items-center justify-between group"
            >
              <div>
                <h2 className="text-base font-semibold text-left">週表示設定</h2>
                <p className="text-xs text-gray-600 text-left">
                  週間グラフの開始曜日を設定
                </p>
              </div>
              {showWeekSettings ? <ChevronDown size={20} className="text-gray-400 group-hover:text-gray-600" /> : <ChevronRight size={20} className="text-gray-400 group-hover:text-gray-600" />}
            </button>

            {showWeekSettings && (
              <div className="mt-3">
                {/* 開始曜日選択 */}
                <div className="mb-3">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    週の開始曜日
                  </label>
                  <select
                    value={weekStartDay}
                    onChange={(e) => setWeekStartDay(Number(e.target.value) as WeekStartDay)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value={0}>日曜日</option>
                    <option value={1}>月曜日</option>
                    <option value={2}>火曜日</option>
                    <option value={3}>水曜日</option>
                    <option value={4}>木曜日</option>
                    <option value={5}>金曜日</option>
                    <option value={6}>土曜日</option>
                  </select>
                </div>

                {/* 保存ボタン */}
                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveWeekSettings} size="sm" className="flex-1">
                    💾 保存
                  </Button>
                  {weekSettingsSaved && (
                    <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

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

            {/* 環境変数で設定されている場合 */}
            {usingEnvKey && !showApiKeySection && (
              <div className="flex items-center gap-1 text-success text-xs">
                <CheckCircle size={14} />
                <span>環境変数で設定済み（自分専用モード）</span>
              </div>
            )}

            {/* localStorageで設定されている場合 */}
            {!usingEnvKey && isApiKeySet && !showApiKeySection && (
              <div className="flex items-center gap-1 text-success text-xs">
                <CheckCircle size={14} />
                <span>設定済み: {maskedApiKey}</span>
              </div>
            )}

            {showApiKeySection && (
              <>
                <p className="text-xs text-gray-600 mb-2">
                  目次画像から問題集を作成する機能、AI解説生成で使用
                </p>

                {/* 環境変数で設定されている場合の表示 */}
                {usingEnvKey ? (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={16} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-800 mb-1">
                          ✅ 環境変数で設定されています（自分専用モード）
                        </p>
                        <p className="text-xs text-green-700 mb-2">
                          OpenAI APIキーは環境変数 <code className="bg-green-100 px-1 py-0.5 rounded text-xs">VITE_OPENAI_API_KEY</code> から読み込まれています。
                        </p>
                        <div className="text-xs text-green-700">
                          <p className="font-medium mb-1">📝 このモードの特徴：</p>
                          <ul className="list-disc ml-5 space-y-0.5">
                            <li>APIキーを毎回入力する必要がありません</li>
                            <li>環境変数はビルド時に埋め込まれます</li>
                            <li>自分専用として使う場合に最適です</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 環境変数が設定されていない場合（ユーザー入力モード） */
                  <>
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={16} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-yellow-800 mb-1">⚠️ APIキーの取り扱いについて</p>
                          <ul className="list-disc ml-5 text-xs text-yellow-800 space-y-1">
                            <li>APIキーは<strong>あなたのブラウザにのみ保存</strong>されます</li>
                            <li>開発者（サーバー）には<strong>送信されません</strong></li>
                            <li className="text-red-700 font-bold">公共のPCでは使用しないでください</li>
                            <li className="text-red-700 font-bold">
                              OpenAI側で使用量制限を必ず設定してください
                            </li>
                          </ul>
                          <a
                            href="https://platform.openai.com/settings/organization/limits"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-xs text-blue-700 font-semibold hover:text-blue-800 underline"
                          >
                            → OpenAIで使用量制限を設定する（重要！）
                          </a>
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
                            placeholder="sk-proj-..."
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
                            OpenAI Platform
                          </a>
                          でAPIキーを取得できます
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

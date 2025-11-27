import { useEffect, useState } from 'react'
import { X, CloudUpload, CloudDownload, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { hasLocalData, backupToCloud, restoreFromCloud } from '@/lib/sync'
import { hasCloudData } from '@/lib/firestore'

const LOCAL_STORAGE_KEY = 'benkyaku-migration-prompt-dismissed'

type MigrationMode = 'backup' | 'restore'

/**
 * 初回ログイン時にデータのバックアップ・復元を促すプロンプト
 */
export default function DataMigrationPrompt() {
  const { user } = useAuthStore()
  const [showPrompt, setShowPrompt] = useState(false)
  const [mode, setMode] = useState<MigrationMode>('backup')
  const [isChecking, setIsChecking] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkDataMigration() {
      if (!user) {
        setIsChecking(false)
        return
      }

      // ユーザーが既にプロンプトを非表示にした場合は表示しない
      const dismissed = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (dismissed === 'true') {
        setIsChecking(false)
        return
      }

      try {
        // ローカルとクラウドのデータ状況をチェック
        const [hasLocal, hasCloud] = await Promise.all([
          hasLocalData(),
          hasCloudData(user.uid)
        ])

        // ローカルにデータがあり、クラウドにデータがない → バックアップモード
        if (hasLocal && !hasCloud) {
          setMode('backup')
          setShowPrompt(true)
        }
        // クラウドにデータがあり、ローカルにデータがない → 復元モード
        else if (!hasLocal && hasCloud) {
          setMode('restore')
          setShowPrompt(true)
        }
      } catch (error) {
        console.error('Error checking data migration:', error)
      } finally {
        setIsChecking(false)
      }
    }

    checkDataMigration()
  }, [user])

  const handleProcess = async () => {
    if (!user) return

    setIsProcessing(true)
    setError(null)

    try {
      if (mode === 'backup') {
        await backupToCloud(user.uid)
      } else {
        await restoreFromCloud(user.uid)
      }

      // 成功後、プロンプトを非表示にして、フラグを保存
      setShowPrompt(false)
      localStorage.setItem(LOCAL_STORAGE_KEY, 'true')

      // 復元の場合はページをリロードして、データを反映
      if (mode === 'restore') {
        window.location.reload()
      }
    } catch (error) {
      console.error(`${mode} error:`, error)
      const errorMessage = mode === 'backup'
        ? 'バックアップに失敗しました。もう一度お試しください。'
        : '復元に失敗しました。もう一度お試しください。'
      setError(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLater = () => {
    setShowPrompt(false)
    // 「後で」を選択した場合は、次回ログイン時にまた表示する
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // 「今後表示しない」フラグを保存
    localStorage.setItem(LOCAL_STORAGE_KEY, 'true')
  }

  // チェック中または表示する必要がない場合は何も表示しない
  if (isChecking || !showPrompt) {
    return null
  }

  const isBackupMode = mode === 'backup'
  const Icon = isBackupMode ? CloudUpload : CloudDownload
  const title = isBackupMode ? '既存の学習データを発見しました' : 'クラウドに学習データがあります'
  const description = isBackupMode
    ? 'このデバイスに保存されている学習履歴が見つかりました。クラウドにバックアップすることで、他のデバイスからもアクセスできるようになります。'
    : 'クラウドに保存されている学習データが見つかりました。このデバイスに復元しますか？'
  const actionLabel = isBackupMode ? 'バックアップ' : '復元'
  const processingLabel = isBackupMode ? 'バックアップ中...' : '復元中...'

  return (
    <>
      {/* オーバーレイ */}
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        {/* ダイアログ */}
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full relative">
          {/* 閉じるボタン */}
          <button
            onClick={handleLater}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            disabled={isProcessing}
          >
            <X size={20} />
          </button>

          {/* ヘッダー */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Icon className="text-blue-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {title}
                </h2>
              </div>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
              <p>{description}</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <p className="font-medium text-gray-900 mb-2">
                {actionLabel}する内容：
              </p>
              <ul className="space-y-1 text-gray-600">
                <li>• 問題集</li>
                <li>• 問題</li>
                <li>• 学習記録</li>
                <li>• AI解説</li>
              </ul>
            </div>
          </div>

          {/* アクション */}
          <div className="p-6 bg-gray-50 rounded-b-lg space-y-3">
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {processingLabel}
                </>
              ) : (
                <>
                  <Icon size={20} />
                  今すぐ{actionLabel}
                </>
              )}
            </button>

            <button
              onClick={handleLater}
              disabled={isProcessing}
              className="w-full bg-white hover:bg-gray-100 disabled:bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-lg border border-gray-300 transition-colors"
            >
              後で
            </button>

            <button
              onClick={handleDismiss}
              disabled={isProcessing}
              className="w-full text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-400 py-2 transition-colors"
            >
              今後表示しない
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

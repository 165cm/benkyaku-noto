import { useEffect, useState } from 'react'
import { X, CloudUpload, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { hasLocalData } from '@/lib/sync'
import { hasCloudData } from '@/lib/firestore'
import { backupToCloud } from '@/lib/sync'

const LOCAL_STORAGE_KEY = 'benkyaku-migration-prompt-dismissed'

/**
 * 初回ログイン時に既存のローカルデータをバックアップするプロンプト
 */
export default function DataMigrationPrompt() {
  const { user } = useAuthStore()
  const [showPrompt, setShowPrompt] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)

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

        // ローカルにデータがあり、クラウドにデータがない場合のみプロンプトを表示
        if (hasLocal && !hasCloud) {
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

  const handleBackupNow = async () => {
    if (!user) return

    setIsBackingUp(true)
    setBackupError(null)

    try {
      await backupToCloud(user.uid)

      // バックアップ成功後、プロンプトを非表示にして、フラグを保存
      setShowPrompt(false)
      localStorage.setItem(LOCAL_STORAGE_KEY, 'true')
    } catch (error) {
      console.error('Backup error:', error)
      setBackupError('バックアップに失敗しました。もう一度お試しください。')
    } finally {
      setIsBackingUp(false)
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
            disabled={isBackingUp}
          >
            <X size={20} />
          </button>

          {/* ヘッダー */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <CloudUpload className="text-blue-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  既存の学習データを発見しました
                </h2>
              </div>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
              <p>
                このデバイスに保存されている学習履歴が見つかりました。
                クラウドにバックアップすることで、他のデバイスからもアクセスできるようになります。
              </p>
            </div>

            {backupError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {backupError}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              <p className="font-medium text-gray-900 mb-2">
                バックアップする内容：
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
              onClick={handleBackupNow}
              disabled={isBackingUp}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isBackingUp ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  バックアップ中...
                </>
              ) : (
                <>
                  <CloudUpload size={20} />
                  今すぐバックアップ
                </>
              )}
            </button>

            <button
              onClick={handleLater}
              disabled={isBackingUp}
              className="w-full bg-white hover:bg-gray-100 disabled:bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-lg border border-gray-300 transition-colors"
            >
              後で
            </button>

            <button
              onClick={handleDismiss}
              disabled={isBackingUp}
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

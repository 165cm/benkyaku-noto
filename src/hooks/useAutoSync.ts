import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { restoreAllDataFromFirestore } from '@/lib/firestore'
import { db } from '@/lib/db'
import { toast } from '@/store/toastStore'

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 2000 // 2秒

/**
 * ページロード時にクラウドからデータを自動同期するフック
 *
 * - ログイン後に一度だけ実行
 * - クラウドのデータをローカルにマージ
 * - バックグラウンドで実行（ユーザーをブロックしない）
 * - エラー時は通知 + 自動リトライ
 */
export function useAutoSync() {
  const { user } = useAuthStore()
  const hasRunRef = useRef(false)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    // すでに実行済み、またはログインしていない場合はスキップ
    if (hasRunRef.current || !user) {
      return
    }

    async function syncFromCloudWithRetry(attempt = 1) {
      try {
        setIsSyncing(true)
        console.log(`Auto-sync: Starting cloud sync (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})...`)

        // クラウドからデータを取得
        const cloudData = await restoreAllDataFromFirestore(user!.uid)

        // データがない場合は通知せずに終了
        const totalItems =
          cloudData.workbooks.length +
          cloudData.problems.length +
          cloudData.studyRecords.length +
          cloudData.explanations.length

        if (totalItems === 0) {
          console.log('Auto-sync: No cloud data found')
          setIsSyncing(false)
          return
        }

        // ローカルにマージ（IDが同じ場合は上書き）
        for (const workbook of cloudData.workbooks) {
          await db.workbooks.put(workbook)
        }

        for (const problem of cloudData.problems) {
          await db.problems.put(problem)
        }

        for (const record of cloudData.studyRecords) {
          await db.studyRecords.put(record)
        }

        for (const explanation of cloudData.explanations) {
          await db.explanations.put(explanation)
        }

        console.log('Auto-sync: Completed successfully')

        // 成功通知（控えめに）
        toast.success(
          'クラウドからデータを同期しました',
          `${totalItems}件のデータを取得`,
          3000
        )

        setIsSyncing(false)
      } catch (error) {
        console.error(`Auto-sync: Failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, error)

        // リトライ可能な場合
        if (attempt < MAX_RETRY_ATTEMPTS) {
          toast.warning(
            'データ同期に失敗しました',
            `${RETRY_DELAY_MS / 1000}秒後に再試行します... (${attempt}/${MAX_RETRY_ATTEMPTS})`,
            RETRY_DELAY_MS
          )

          // 指数バックオフで再試行
          const delay = RETRY_DELAY_MS * attempt
          setTimeout(() => {
            syncFromCloudWithRetry(attempt + 1)
          }, delay)
        } else {
          // 最終的に失敗した場合
          setIsSyncing(false)

          const errorMessage = error instanceof Error ? error.message : '不明なエラー'

          toast.error(
            'データ同期に失敗しました',
            `クラウドからのデータ取得に失敗しました。設定画面から手動で復元してください。`,
            10000 // 10秒表示
          )
        }
      }
    }

    // 実行済みフラグを立てる
    hasRunRef.current = true

    // バックグラウンドで同期実行（少し遅延させてページロードを優先）
    setTimeout(() => {
      syncFromCloudWithRetry()
    }, 1000)
  }, [user])

  return { isSyncing }
}

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { restoreAllDataFromFirestore } from '@/lib/firestore'
import { db } from '@/lib/db'

/**
 * ページロード時にクラウドからデータを自動同期するフック
 *
 * - ログイン後に一度だけ実行
 * - クラウドのデータをローカルにマージ
 * - バックグラウンドで実行（ユーザーをブロックしない）
 */
export function useAutoSync() {
  const { user } = useAuthStore()
  const hasRunRef = useRef(false)

  useEffect(() => {
    // すでに実行済み、またはログインしていない場合はスキップ
    if (hasRunRef.current || !user) {
      return
    }

    async function syncFromCloud() {
      try {
        console.log('Auto-sync: Starting cloud sync...')

        // クラウドからデータを取得
        const cloudData = await restoreAllDataFromFirestore(user!.uid)

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
      } catch (error) {
        // エラーがあってもサイレントに失敗（ユーザー体験を損なわない）
        console.error('Auto-sync: Failed', error)
      }
    }

    // 実行済みフラグを立てる
    hasRunRef.current = true

    // バックグラウンドで同期実行
    syncFromCloud()
  }, [user])
}

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { restoreAllDataFromFirestore, getUserSettingsFromFirestore } from '@/lib/firestore'
import { db } from '@/lib/db'
import { getExcludedCategories, getExcludedSections } from '@/lib/storage'

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

        // ユーザー設定（除外設定）を同期
        const cloudSettings = await getUserSettingsFromFirestore(user!.uid)
        if (cloudSettings) {
          // ローカルに設定がある場合はマージ（クラウドを優先）
          const localCategories = getExcludedCategories()
          const localSections = getExcludedSections()

          // クラウドの設定をローカルに保存（Firestore同期は不要なので直接localStorageに保存）
          if (cloudSettings.excludedCategories.length > 0 || localCategories.length === 0) {
            localStorage.setItem('benkyaku-excluded-categories', JSON.stringify(cloudSettings.excludedCategories))
          }
          if (cloudSettings.excludedSections.length > 0 || localSections.length === 0) {
            localStorage.setItem('benkyaku-excluded-sections', JSON.stringify(cloudSettings.excludedSections))
          }

          console.log('Auto-sync: User settings synchronized')
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

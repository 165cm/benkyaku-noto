import { db } from './db'
import { backupAllDataToFirestore, restoreAllDataFromFirestore } from './firestore'

export interface SyncProgress {
  stage: 'workbooks' | 'problems' | 'studyRecords' | 'explanations' | 'complete'
  current: number
  total: number
  message: string
}

export type SyncProgressCallback = (progress: SyncProgress) => void

/**
 * IndexedDBの全データをFirestoreにバックアップ
 */
export async function backupToCloud(
  userId: string,
  onProgress?: SyncProgressCallback
): Promise<void> {
  try {
    // IndexedDBから全データを取得
    onProgress?.({
      stage: 'workbooks',
      current: 0,
      total: 4,
      message: '問題集を読み込み中...'
    })

    const workbooks = await db.workbooks.toArray()

    onProgress?.({
      stage: 'problems',
      current: 1,
      total: 4,
      message: '問題を読み込み中...'
    })

    const problems = await db.problems.toArray()

    onProgress?.({
      stage: 'studyRecords',
      current: 2,
      total: 4,
      message: '学習記録を読み込み中...'
    })

    const studyRecords = await db.studyRecords.toArray()

    onProgress?.({
      stage: 'explanations',
      current: 3,
      total: 4,
      message: 'AI解説を読み込み中...'
    })

    const explanations = await db.explanations.toArray()

    // Firestoreにバックアップ
    onProgress?.({
      stage: 'complete',
      current: 4,
      total: 4,
      message: 'クラウドにバックアップ中...'
    })

    await backupAllDataToFirestore(userId, {
      workbooks,
      problems,
      studyRecords,
      explanations
    })

    onProgress?.({
      stage: 'complete',
      current: 4,
      total: 4,
      message: 'バックアップ完了'
    })
  } catch (error) {
    console.error('Backup error:', error)
    throw new Error('バックアップに失敗しました')
  }
}

/**
 * Firestoreから全データを復元してIndexedDBにマージ
 */
export async function restoreFromCloud(
  userId: string,
  onProgress?: SyncProgressCallback
): Promise<void> {
  try {
    // Firestoreからデータを取得
    onProgress?.({
      stage: 'workbooks',
      current: 0,
      total: 4,
      message: 'クラウドからデータを読み込み中...'
    })

    const cloudData = await restoreAllDataFromFirestore(userId)

    // IndexedDBにデータを復元（既存データとマージ）
    onProgress?.({
      stage: 'workbooks',
      current: 1,
      total: 4,
      message: `問題集を復元中... (${cloudData.workbooks.length}件)`
    })

    for (const workbook of cloudData.workbooks) {
      await db.workbooks.put(workbook)
    }

    onProgress?.({
      stage: 'problems',
      current: 2,
      total: 4,
      message: `問題を復元中... (${cloudData.problems.length}件)`
    })

    for (const problem of cloudData.problems) {
      await db.problems.put(problem)
    }

    onProgress?.({
      stage: 'studyRecords',
      current: 3,
      total: 4,
      message: `学習記録を復元中... (${cloudData.studyRecords.length}件)`
    })

    for (const record of cloudData.studyRecords) {
      await db.studyRecords.put(record)
    }

    onProgress?.({
      stage: 'explanations',
      current: 4,
      total: 4,
      message: `AI解説を復元中... (${cloudData.explanations.length}件)`
    })

    for (const explanation of cloudData.explanations) {
      await db.explanations.put(explanation)
    }

    onProgress?.({
      stage: 'complete',
      current: 4,
      total: 4,
      message: '復元完了'
    })
  } catch (error) {
    console.error('Restore error:', error)
    throw new Error('復元に失敗しました')
  }
}

/**
 * バックアップのサイズを計算（概算）
 */
export async function calculateBackupSize(): Promise<{
  workbooks: number
  problems: number
  studyRecords: number
  explanations: number
  totalItems: number
  estimatedSizeKB: number
}> {
  const workbooks = await db.workbooks.count()
  const problems = await db.problems.count()
  const studyRecords = await db.studyRecords.count()
  const explanations = await db.explanations.count()

  // 概算サイズ（1件あたりの平均サイズ）
  const avgSizes = {
    workbook: 0.7, // KB
    problem: 1.0,
    studyRecord: 0.2,
    explanation: 5.0
  }

  const estimatedSizeKB =
    workbooks * avgSizes.workbook +
    problems * avgSizes.problem +
    studyRecords * avgSizes.studyRecord +
    explanations * avgSizes.explanation

  return {
    workbooks,
    problems,
    studyRecords,
    explanations,
    totalItems: workbooks + problems + studyRecords + explanations,
    estimatedSizeKB: Math.round(estimatedSizeKB)
  }
}

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

// ローカルストレージキー
const STORAGE_KEYS = {
  OPENAI_API_KEY: 'benkyaku-openai-api-key',
  EXCLUDED_CATEGORIES: 'benkyaku-excluded-categories',
  EXCLUDED_SECTIONS: 'benkyaku-excluded-sections',
  LAST_BACKUP_TIME: 'benkyaku-last-backup-time',
  LAST_RESTORE_TIME: 'benkyaku-last-restore-time',
} as const

// 除外カテゴリの保存
export function saveExcludedCategories(categories: string[]): void {
  localStorage.setItem(STORAGE_KEYS.EXCLUDED_CATEGORIES, JSON.stringify(categories))
}

// 除外カテゴリの取得
export function getExcludedCategories(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.EXCLUDED_CATEGORIES)
  return stored ? JSON.parse(stored) : []
}

// 除外セクションの保存（カテゴリ-タイトル形式）
export function saveExcludedSections(sections: string[]): void {
  localStorage.setItem(STORAGE_KEYS.EXCLUDED_SECTIONS, JSON.stringify(sections))
}

// 除外セクションの取得
export function getExcludedSections(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.EXCLUDED_SECTIONS)
  return stored ? JSON.parse(stored) : []
}

// OpenAI APIキーの保存
export function saveOpenAIApiKey(apiKey: string): void {
  localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, apiKey)
}

// OpenAI APIキーの取得（環境変数 > localStorage の優先順位）
export function getOpenAIApiKey(): string | null {
  // 1. 環境変数をチェック（自分専用モード）
  const envApiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (envApiKey) {
    return envApiKey
  }

  // 2. localStorageをチェック（他人に公開モード）
  return localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY)
}

// 環境変数でAPIキーが設定されているか確認
export function isUsingEnvApiKey(): boolean {
  return !!import.meta.env.VITE_OPENAI_API_KEY
}

// OpenAI APIキーの削除
export function removeOpenAIApiKey(): void {
  localStorage.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
}

// APIキーが設定されているか確認
export function hasOpenAIApiKey(): boolean {
  return !!getOpenAIApiKey()
}

// 最終バックアップ時刻の保存
export function saveLastBackupTime(): void {
  localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_TIME, new Date().toISOString())
}

// 最終バックアップ時刻の取得
export function getLastBackupTime(): Date | null {
  const stored = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP_TIME)
  return stored ? new Date(stored) : null
}

// 最終復元時刻の保存
export function saveLastRestoreTime(): void {
  localStorage.setItem(STORAGE_KEYS.LAST_RESTORE_TIME, new Date().toISOString())
}

// 最終復元時刻の取得
export function getLastRestoreTime(): Date | null {
  const stored = localStorage.getItem(STORAGE_KEYS.LAST_RESTORE_TIME)
  return stored ? new Date(stored) : null
}

// ===== Firebase Storage (PDF管理) =====

/**
 * PDFファイルをFirebase Storageにアップロード
 * @param file PDFファイル
 * @param workbookId 問題集ID
 * @returns ダウンロードURL
 */
export async function uploadPDF(file: File, workbookId: string): Promise<string> {
  // ファイルがPDFか確認
  if (file.type !== 'application/pdf') {
    throw new Error('PDFファイルのみアップロード可能です')
  }

  // ファイルサイズチェック（50MB制限）
  const maxSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxSize) {
    throw new Error('ファイルサイズは50MB以下にしてください')
  }

  // Storage参照を作成（workbooks/{workbookId}/{filename}）
  const storageRef = ref(storage, `workbooks/${workbookId}/${file.name}`)

  // アップロード
  const snapshot = await uploadBytes(storageRef, file)

  // ダウンロードURLを取得
  const downloadURL = await getDownloadURL(snapshot.ref)

  return downloadURL
}

/**
 * PDFファイルを削除
 * @param workbookId 問題集ID
 * @param fileName ファイル名
 */
export async function deletePDF(workbookId: string, fileName: string): Promise<void> {
  try {
    const storageRef = ref(storage, `workbooks/${workbookId}/${fileName}`)
    await deleteObject(storageRef)
  } catch (error) {
    console.error('PDF削除エラー:', error)
    // ファイルが既に存在しない場合はエラーを無視
  }
}

/**
 * PDFのダウンロードURLを取得
 * @param workbookId 問題集ID
 * @param fileName ファイル名
 * @returns ダウンロードURL
 */
export async function getPDFUrl(workbookId: string, fileName: string): Promise<string> {
  const storageRef = ref(storage, `workbooks/${workbookId}/${fileName}`)
  return await getDownloadURL(storageRef)
}

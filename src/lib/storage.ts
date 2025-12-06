import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

// ローカルストレージキー
const STORAGE_KEYS = {
  OPENAI_API_KEY: 'benkyaku-openai-api-key',
  EXCLUDED_CATEGORIES: 'benkyaku-excluded-categories',
  EXCLUDED_SECTIONS: 'benkyaku-excluded-sections',
  EXCLUDED_PROBLEMS: 'benkyaku-excluded-problems',
  LAST_BACKUP_TIME: 'benkyaku-last-backup-time',
  LAST_RESTORE_TIME: 'benkyaku-last-restore-time',
  WEEK_START_DAY: 'benkyaku-week-start-day',
  WEEK_DISPLAY_MODE: 'benkyaku-week-display-mode',
  SECTION_STANDARD_TIME_PREFIX: 'sectionStandardTime_',
} as const

// 週の開始曜日タイプ
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0=日曜, 1=月曜, ...

// 週の表示モード
export type WeekDisplayMode = 'current-week' | 'last-7-days' | 'last-14-days'

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

// 除外問題の保存（問題IDの配列）
export function saveExcludedProblems(problemIds: string[]): void {
  localStorage.setItem(STORAGE_KEYS.EXCLUDED_PROBLEMS, JSON.stringify(problemIds))
}

// 除外問題の取得
export function getExcludedProblems(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.EXCLUDED_PROBLEMS)
  return stored ? JSON.parse(stored) : []
}

// 問題を除外リストに追加
export function addExcludedProblem(problemId: string): void {
  const excluded = getExcludedProblems()
  if (!excluded.includes(problemId)) {
    excluded.push(problemId)
    saveExcludedProblems(excluded)
  }
}

// 問題を除外リストから削除
export function removeExcludedProblem(problemId: string): void {
  const excluded = getExcludedProblems()
  const filtered = excluded.filter(id => id !== problemId)
  saveExcludedProblems(filtered)
}

// セクション標準時間の取得
export function getSectionStandardTime(sectionKey: string): number | null {
  const saved = localStorage.getItem(`${STORAGE_KEYS.SECTION_STANDARD_TIME_PREFIX}${sectionKey}`)
  return saved ? parseInt(saved, 10) : null
}

// セクション標準時間の保存
export function setSectionStandardTime(sectionKey: string, time: number): void {
  localStorage.setItem(`${STORAGE_KEYS.SECTION_STANDARD_TIME_PREFIX}${sectionKey}`, String(time))
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

// ========== 週設定 ==========

/**
 * 週の開始曜日を保存
 */
export function saveWeekStartDay(day: WeekStartDay): void {
  localStorage.setItem(STORAGE_KEYS.WEEK_START_DAY, String(day))
}

/**
 * 週の開始曜日を取得（デフォルトは月曜日=1）
 */
export function getWeekStartDay(): WeekStartDay {
  const stored = localStorage.getItem(STORAGE_KEYS.WEEK_START_DAY)
  return stored ? (Number(stored) as WeekStartDay) : 1
}

/**
 * 週の表示モードを保存
 */
export function saveWeekDisplayMode(mode: WeekDisplayMode): void {
  localStorage.setItem(STORAGE_KEYS.WEEK_DISPLAY_MODE, mode)
}

/**
 * 週の表示モードを取得（デフォルトは今週）
 */
export function getWeekDisplayMode(): WeekDisplayMode {
  const stored = localStorage.getItem(STORAGE_KEYS.WEEK_DISPLAY_MODE)
  return (stored as WeekDisplayMode) || 'current-week'
}

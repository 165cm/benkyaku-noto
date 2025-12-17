import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage, auth } from './firebase'
import { db } from './db'
import { syncSettingsToFirestore } from './firestore'
import type { UserSettings } from '@/types'

// ローカルストレージキー（後方互換性とローカル設定用）
const STORAGE_KEYS = {
  OPENAI_API_KEY: 'benkyaku-openai-api-key',
  LAST_BACKUP_TIME: 'benkyaku-last-backup-time',
  LAST_RESTORE_TIME: 'benkyaku-last-restore-time',
} as const

// 設定キー（DB/同期用）
const SETTING_KEYS = {
  EXCLUDED_CATEGORIES: 'excludedCategories',
  EXCLUDED_SECTIONS: 'excludedSections',
  EXCLUDED_PROBLEMS: 'excludedProblems',
  WEEK_START_DAY: 'weekStartDay',
  WEEK_DISPLAY_MODE: 'weekDisplayMode',
  SECTION_STANDARD_TIME_PREFIX: 'sectionStandardTime_',
} as const

// 週の開始曜日タイプ
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0=日曜, 1=月曜, ...

// 週の表示モード
export type WeekDisplayMode = 'current-week' | 'last-7-days' | 'last-14-days'

// ヘルパー：設定の保存（DB + Firestore同期）
async function saveSetting(key: string, value: any): Promise<void> {
  try {
    const now = new Date()
    const setting: UserSettings = { key, value, updatedAt: now }

    // Dexieに保存
    await db.settings.put(setting)

    // ログインしていればFirestoreに同期
    const user = auth.currentUser
    if (user) {
      // 非同期で同期（待たない）
      syncSettingsToFirestore(user.uid, setting).catch(err => {
        console.error('Failed to sync setting:', key, err)
      })
    }
  } catch (error) {
    console.error('Failed to save setting:', key, error)
  }
}

// レガシーキー（マイグレーション用）
const LEGACY_KEYS = {
  EXCLUDED_CATEGORIES: 'benkyaku-excluded-categories',
  EXCLUDED_SECTIONS: 'benkyaku-excluded-sections',
  EXCLUDED_PROBLEMS: 'benkyaku-excluded-problems',
  WEEK_START_DAY: 'benkyaku-week-start-day',
  WEEK_DISPLAY_MODE: 'benkyaku-week-display-mode',
} as const

// ヘルパー：設定の取得（DB > LocalStorage migration）
async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    // 1. DBから取得
    const setting = await db.settings.get(key)
    if (setting) return setting.value as T

    // 2. なければLocalStorage(旧)をチェックしてマイグレーション
    const migrated = migrateFromLocalStorage<T>(key)
    if (migrated !== null) {
      console.log(`Migrating setting ${key} from localStorage`)
      await saveSetting(key, migrated)
      return migrated
    }

    return defaultValue
  } catch (error) {
    console.error('Failed to get setting:', key, error)
    return defaultValue
  }
}

function migrateFromLocalStorage<T>(newKey: string): T | null {
  let oldKey: string | null = null
  let isJson = true
  let isNumber = false

  // キーのマッピング
  switch (newKey) {
    case SETTING_KEYS.EXCLUDED_CATEGORIES:
      oldKey = LEGACY_KEYS.EXCLUDED_CATEGORIES
      break
    case SETTING_KEYS.EXCLUDED_SECTIONS:
      oldKey = LEGACY_KEYS.EXCLUDED_SECTIONS
      break
    case SETTING_KEYS.EXCLUDED_PROBLEMS:
      oldKey = LEGACY_KEYS.EXCLUDED_PROBLEMS
      break
    case SETTING_KEYS.WEEK_START_DAY:
      oldKey = LEGACY_KEYS.WEEK_START_DAY
      isJson = false
      isNumber = true
      break
    case SETTING_KEYS.WEEK_DISPLAY_MODE:
      oldKey = LEGACY_KEYS.WEEK_DISPLAY_MODE
      isJson = false
      break
    default:
      if (newKey.startsWith(SETTING_KEYS.SECTION_STANDARD_TIME_PREFIX)) {
        oldKey = newKey // prefix is same 'sectionStandardTime_'
        isJson = false
        isNumber = true
      }
  }

  if (!oldKey) return null

  const stored = localStorage.getItem(oldKey)
  if (!stored) return null

  try {
    if (isJson) {
      return JSON.parse(stored) as T
    } else if (isNumber) {
      return Number(stored) as unknown as T
    } else {
      return stored as unknown as T
    }
  } catch (e) {
    console.warn(`Failed to parse legacy setting for ${oldKey}`, e)
    return null
  }
}

// 除外カテゴリの保存
export async function saveExcludedCategories(categories: string[]): Promise<void> {
  await saveSetting(SETTING_KEYS.EXCLUDED_CATEGORIES, categories)
}

// 除外カテゴリの取得
export async function getExcludedCategories(): Promise<string[]> {
  return await getSetting<string[]>(SETTING_KEYS.EXCLUDED_CATEGORIES, [])
}

// 除外セクションの保存（カテゴリ-タイトル形式）
export async function saveExcludedSections(sections: string[]): Promise<void> {
  await saveSetting(SETTING_KEYS.EXCLUDED_SECTIONS, sections)
}

// 除外セクションの取得
export async function getExcludedSections(): Promise<string[]> {
  return await getSetting<string[]>(SETTING_KEYS.EXCLUDED_SECTIONS, [])
}

// 除外問題の保存（問題IDの配列）
export async function saveExcludedProblems(problemIds: string[]): Promise<void> {
  await saveSetting(SETTING_KEYS.EXCLUDED_PROBLEMS, problemIds)
}

// 除外問題の取得
export async function getExcludedProblems(): Promise<string[]> {
  return await getSetting<string[]>(SETTING_KEYS.EXCLUDED_PROBLEMS, [])
}

// 問題を除外リストに追加
export async function addExcludedProblem(problemId: string): Promise<void> {
  const excluded = await getExcludedProblems()
  if (!excluded.includes(problemId)) {
    excluded.push(problemId)
    await saveExcludedProblems(excluded)
  }
}

// 問題を除外リストから削除
export async function removeExcludedProblem(problemId: string): Promise<void> {
  const excluded = await getExcludedProblems()
  const filtered = excluded.filter(id => id !== problemId)
  await saveExcludedProblems(filtered)
}

// セクション標準時間の取得
export async function getSectionStandardTime(sectionKey: string): Promise<number | null> {
  return await getSetting<number | null>(`${SETTING_KEYS.SECTION_STANDARD_TIME_PREFIX}${sectionKey}`, null)
}

// セクション標準時間の保存
export async function setSectionStandardTime(sectionKey: string, time: number): Promise<void> {
  await saveSetting(`${SETTING_KEYS.SECTION_STANDARD_TIME_PREFIX}${sectionKey}`, time)
}

// ===== ローカル設定（同期しない） =====

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

// ========== 週設定（非同期に変更） ==========

/**
 * 週の開始曜日を保存
 */
export async function saveWeekStartDay(day: WeekStartDay): Promise<void> {
  await saveSetting(SETTING_KEYS.WEEK_START_DAY, day)
}

/**
 * 週の開始曜日を取得（デフォルトは月曜日=1）
 */
export async function getWeekStartDay(): Promise<WeekStartDay> {
  return await getSetting<WeekStartDay>(SETTING_KEYS.WEEK_START_DAY, 1)
}

/**
 * 週の表示モードを保存
 */
export async function saveWeekDisplayMode(mode: WeekDisplayMode): Promise<void> {
  await saveSetting(SETTING_KEYS.WEEK_DISPLAY_MODE, mode)
}

/**
 * 週の表示モードを取得（デフォルトは今週）
 */
export async function getWeekDisplayMode(): Promise<WeekDisplayMode> {
  return await getSetting<WeekDisplayMode>(SETTING_KEYS.WEEK_DISPLAY_MODE, 'current-week')
}

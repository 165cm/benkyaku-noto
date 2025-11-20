import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

// ローカルストレージキー
const STORAGE_KEYS = {
  OPENAI_API_KEY: 'benkyaku-openai-api-key',
} as const

// OpenAI APIキーの保存
export function saveOpenAIApiKey(apiKey: string): void {
  localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, apiKey)
}

// OpenAI APIキーの取得
export function getOpenAIApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY)
}

// OpenAI APIキーの削除
export function removeOpenAIApiKey(): void {
  localStorage.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
}

// APIキーが設定されているか確認
export function hasOpenAIApiKey(): boolean {
  return !!getOpenAIApiKey()
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

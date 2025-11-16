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

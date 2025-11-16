import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Key, AlertCircle, CheckCircle, Trash2 } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import { saveOpenAIApiKey, getOpenAIApiKey, removeOpenAIApiKey } from '@/lib/storage'

export default function Settings() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [isApiKeySet, setIsApiKeySet] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const existingKey = getOpenAIApiKey()
    if (existingKey) {
      setApiKey(existingKey)
      setIsApiKeySet(true)
    }
  }, [])

  const handleSave = () => {
    if (apiKey.trim()) {
      saveOpenAIApiKey(apiKey.trim())
      setIsApiKeySet(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handleRemove = () => {
    if (confirm('APIキーを削除しますか？')) {
      removeOpenAIApiKey()
      setApiKey('')
      setIsApiKeySet(false)
    }
  }

  const maskedApiKey = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : ''

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">設定</h1>

      <Card className="mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Key className="text-primary mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">OpenAI APIキー</h2>
            <p className="text-sm text-gray-600 mb-4">
              目次画像から自動的に問題集を作成する機能を使用するには、OpenAI
              APIキーが必要です。
            </p>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">セキュリティについて</p>
                  <p>
                    APIキーはブラウザのローカルストレージに保存されます。他人と共有しているデバイスでは使用しないでください。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  APIキー
                </label>
                <div className="flex gap-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? '隠す' : '表示'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  APIキーは{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    OpenAIのダッシュボード
                  </a>
                  で取得できます
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={!apiKey.trim()}>
                  保存
                </Button>
                {isApiKeySet && (
                  <Button variant="error" onClick={handleRemove}>
                    削除
                  </Button>
                )}
              </div>

              {saved && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle size={20} />
                  <span className="text-sm font-medium">保存しました</span>
                </div>
              )}

              {isApiKeySet && !saved && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle size={20} />
                  <span className="text-sm">
                    APIキー設定済み: {maskedApiKey}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-3">使い方</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>OpenAI APIキーを上記に設定</li>
          <li>問題集ページで「目次からインポート」ボタンをクリック</li>
          <li>参考書の目次ページを撮影した画像をアップロード</li>
          <li>AIが自動的に章・節・タグを抽出</li>
          <li>内容を確認・編集して問題集を作成</li>
        </ol>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Trash2 className="text-gray-600 mt-1" size={24} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">ゴミ箱</h2>
            <p className="text-sm text-gray-600 mb-4">
              削除した問題を復元または完全削除できます
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate('/trash')}
            >
              <Trash2 size={16} className="mr-2" />
              ゴミ箱を開く
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

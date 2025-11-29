import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Trash2, ChevronDown, ChevronUp, Sparkles, Loader2, Camera } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { getExplanations, deleteExplanation } from '@/lib/db'
import { generateAndSaveExplanation, hasUnexplainedSections } from '@/lib/aiExplanation'
import { getOpenAIApiKey } from '@/lib/storage'
import type { Explanation } from '@/types'

export default function Explanations() {
  const navigate = useNavigate()
  const [explanations, setExplanations] = useState<Explanation[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [canGenerate, setCanGenerate] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const data = await getExplanations()
    setExplanations(data)

    const hasMore = await hasUnexplainedSections()
    setCanGenerate(hasMore)

    setHasApiKey(!!getOpenAIApiKey())
    setLoading(false)
  }

  const handleGenerate = async () => {
    if (!hasApiKey) {
      alert('OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。')
      navigate('/settings')
      return
    }

    setGenerating(true)
    try {
      const result = await generateAndSaveExplanation()
      if (result) {
        await loadData()
        alert(`「${result.category} ${result.title}」の解説を生成しました！`)
      } else {
        alert('生成する解説がありません。全てのセクションの解説が完了しています。')
      }
    } catch (error) {
      console.error('Error generating explanation:', error)
      alert(`エラー: ${error instanceof Error ? error.message : '解説の生成に失敗しました'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この解説を削除しますか？')) return

    await deleteExplanation(id)
    await loadData()
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return <div>読み込み中...</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">AI解説ライブラリ</h1>
        <p className="text-gray-600">苦手セクションの解き方解説をAIが生成します</p>
      </div>

      {/* 生成ボタン */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <div className="flex flex-col h-full">
            <h2 className="font-semibold mb-1">新しい解説を生成</h2>
            {canGenerate ? (
              <p className="text-sm text-gray-600 mb-4 flex-1">
                AIが学習データを分析し、最優先で理解すべきトピックを選定します
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-4 flex-1">
                全てのセクションの解説が生成済みです
              </p>
            )}
            <Button
              onClick={handleGenerate}
              disabled={generating || !canGenerate}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={18} className="mr-2" />
                  解説を生成
                </>
              )}
            </Button>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex flex-col h-full">
            <h2 className="font-semibold mb-1">📷 画像から解説を生成</h2>
            <p className="text-sm text-gray-600 mb-4 flex-1">
              問題の写真をアップロードして、あなたのレベルに合わせた解説を作成
            </p>
            <Button
              onClick={() => navigate('/explanations/image-upload')}
              variant="secondary"
              className="w-full border-blue-300 hover:bg-blue-100"
            >
              <Camera size={18} className="mr-2" />
              画像をアップロード
            </Button>
          </div>
        </Card>
      </div>

      {/* 解説一覧 */}
      {explanations.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">解説がまだありません</p>
            <p className="text-sm text-gray-400">
              上のボタンから苦手セクションの解説を生成できます
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {explanations.map((explanation) => (
            <Card key={explanation.id}>
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpand(explanation.id)}
              >
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {explanation.category} {explanation.sectionTitle}
                  </h3>
                  <p className="text-sm text-gray-500">
                    生成時正答率: {explanation.accuracy}% · {formatDate(explanation.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(explanation.id)
                    }}
                    className="p-2 hover:bg-red-100 rounded transition-colors"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                  {expandedId === explanation.id ? (
                    <ChevronUp size={20} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-400" />
                  )}
                </div>
              </div>

              {expandedId === explanation.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <MarkdownRenderer content={explanation.content} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

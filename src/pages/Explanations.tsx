import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Trash2, ChevronDown, ChevronUp, Sparkles, Loader2, Camera, Image, Filter, Search, SortAsc } from 'lucide-react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { getExplanations, deleteExplanation, getImageBasedExplanations, deleteImageBasedExplanation } from '@/lib/db'
import { generateAndSaveExplanation, hasUnexplainedSections } from '@/lib/aiExplanation'
import { getOpenAIApiKey } from '@/lib/storage'
import type { Explanation, ImageBasedExplanation, UserLevelType } from '@/types'

type SortOption = 'newest' | 'oldest' | 'level-asc' | 'level-desc' | 'regeneration'

export default function Explanations() {
  const navigate = useNavigate()
  const [explanations, setExplanations] = useState<Explanation[]>([])
  const [imageExplanations, setImageExplanations] = useState<ImageBasedExplanation[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [canGenerate, setCanGenerate] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)

  // フィルター・検索・ソート用のstate
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<UserLevelType | 'all'>('all')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const data = await getExplanations()
    setExplanations(data)

    const imageData = await getImageBasedExplanations()
    setImageExplanations(imageData)

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

  const handleDeleteImageExplanation = async (id: string) => {
    if (!confirm('この解説を削除しますか？')) return

    await deleteImageBasedExplanation(id)
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

  // フィルター・ソート・検索の適用
  const filteredAndSortedImageExplanations = useMemo(() => {
    let filtered = [...imageExplanations]

    // レベルフィルター
    if (levelFilter !== 'all') {
      filtered = filtered.filter(exp => exp.userLevel.level === levelFilter)
    }

    // 検索フィルター（問題文、答え、カテゴリ、セクション名で検索）
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(exp => {
        const text = (exp.editedText || exp.extractedText).toLowerCase()
        const answer = (exp.answer || '').toLowerCase()
        const category = (exp.category || '').toLowerCase()
        const section = (exp.sectionTitle || '').toLowerCase()
        return text.includes(query) || answer.includes(query) || category.includes(query) || section.includes(query)
      })
    }

    // ソート
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'level-asc':
          const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 }
          return levelOrder[a.userLevel.level] - levelOrder[b.userLevel.level]
        case 'level-desc':
          const levelOrderDesc = { beginner: 0, intermediate: 1, advanced: 2 }
          return levelOrderDesc[b.userLevel.level] - levelOrderDesc[a.userLevel.level]
        case 'regeneration':
          return b.regenerationCount - a.regenerationCount
        default:
          return 0
      }
    })

    return filtered
  }, [imageExplanations, levelFilter, searchQuery, sortOption])

  const getLevelLabel = (level: UserLevelType) => {
    switch (level) {
      case 'beginner': return '初級'
      case 'intermediate': return '中級'
      case 'advanced': return '上級'
    }
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

      {/* フィルター・検索・ソートセクション */}
      {imageExplanations.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Filter size={18} />
              フィルター・検索
            </h3>
            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm"
            >
              {showFilters ? 'フィルターを隠す' : 'フィルターを表示'}
            </Button>
          </div>

          {showFilters && (
            <div className="space-y-4">
              {/* 検索バー */}
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Search size={16} />
                  キーワード検索
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="問題文、答え、カテゴリで検索..."
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* レベルフィルター */}
                <div>
                  <label className="block text-sm font-medium mb-2">レベル</label>
                  <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value as UserLevelType | 'all')}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">全てのレベル</option>
                    <option value="beginner">初級</option>
                    <option value="intermediate">中級</option>
                    <option value="advanced">上級</option>
                  </select>
                </div>

                {/* ソートオプション */}
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <SortAsc size={16} />
                    並び替え
                  </label>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="newest">新しい順</option>
                    <option value="oldest">古い順</option>
                    <option value="level-asc">レベル: 初級→上級</option>
                    <option value="level-desc">レベル: 上級→初級</option>
                    <option value="regeneration">再生成回数が多い順</option>
                  </select>
                </div>
              </div>

              {/* フィルター結果サマリー */}
              <div className="text-sm text-gray-600 pt-2 border-t border-border">
                <span className="font-medium">{filteredAndSortedImageExplanations.length}件</span> の解説を表示中
                {(searchQuery || levelFilter !== 'all') && (
                  <span className="ml-2">
                    （全{imageExplanations.length}件中）
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setLevelFilter('all')
                      }}
                      className="ml-2 text-primary hover:underline"
                    >
                      フィルターをリセット
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 解説一覧 */}
      {explanations.length === 0 && imageExplanations.length === 0 ? (
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
          {/* 画像ベースの解説 */}
          {filteredAndSortedImageExplanations.map((explanation) => (
            <Card key={explanation.id} className="border-l-4 border-l-blue-500">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpand(explanation.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Image size={16} className="text-blue-500" />
                    <h3 className="font-semibold">
                      画像から生成した解説
                      {explanation.category && explanation.sectionTitle &&
                        ` - ${explanation.category} ${explanation.sectionTitle}`
                      }
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    レベル: {getLevelLabel(explanation.userLevel.level)}
                    ({explanation.userLevel.overallAccuracy}%) · {formatDate(explanation.createdAt)}
                    {explanation.regenerationCount > 0 && ` · 再生成${explanation.regenerationCount}回`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteImageExplanation(explanation.id)
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
                <div className="mt-4 pt-4 border-t border-border space-y-4">
                  {/* 問題文 */}
                  {(explanation.editedText || explanation.extractedText) && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <h4 className="text-sm font-semibold mb-2">📝 問題文</h4>
                      <p className="text-sm whitespace-pre-wrap">
                        {explanation.editedText || explanation.extractedText}
                      </p>
                    </div>
                  )}

                  {/* 答え */}
                  {explanation.answer && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                      <h4 className="text-sm font-semibold mb-2 text-green-800">✅ この問題の答え</h4>
                      <p className="text-sm font-medium text-green-900">
                        {explanation.answer}
                      </p>
                    </div>
                  )}

                  {/* 元の画像 */}
                  {explanation.imageUrl && (
                    <details className="bg-gray-50 p-3 rounded-lg">
                      <summary className="text-sm font-semibold cursor-pointer">📸 元の画像を見る</summary>
                      <img
                        src={explanation.imageUrl}
                        alt="問題画像"
                        className="mt-2 w-full max-w-2xl rounded-lg"
                      />
                    </details>
                  )}

                  {/* 解説 */}
                  <div>
                    <MarkdownRenderer content={explanation.explanationContent} />
                  </div>
                </div>
              )}
            </Card>
          ))}

          {/* セクション別の解説 */}
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

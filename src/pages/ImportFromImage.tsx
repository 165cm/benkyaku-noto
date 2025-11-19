import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, ArrowLeft, Loader2, Trash2, FileText, X } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import { hasOpenAIApiKey, uploadPDF } from '@/lib/storage'
import { imageToBase64, parseTableOfContents, type ParsedTableOfContents } from '@/lib/openai'
import { addWorkbook, addProblem, db } from '@/lib/db'

const MAX_IMAGES = 5

export default function ImportFromImage() {
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ParsedTableOfContents | null>(null)
  const [problemCounts, setProblemCounts] = useState<{ [sectionId: string]: number }>({})
  const [categories, setCategories] = useState<{ [sectionId: string]: string }>({})
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])

    if (files.length + selectedFiles.length > MAX_IMAGES) {
      setError(`画像は最大${MAX_IMAGES}枚までアップロードできます`)
      return
    }

    setError(null)

    // プレビュー表示
    selectedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        setPreviews((prev) => [...prev, event.target?.result as string])
      }
      reader.readAsDataURL(file)
    })

    setFiles((prev) => [...prev, ...selectedFiles])
  }

  const removeImage = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAnalyze = async () => {
    if (files.length === 0) return

    if (!hasOpenAIApiKey()) {
      setError('OpenAI APIキーが設定されていません。設定ページで設定してください。')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 全ての画像をBase64に変換
      const base64Images = await Promise.all(files.map((file) => imageToBase64(file)))
      const data = await parseTableOfContents(base64Images)
      setParsedData(data)

      // セクションごとの問題数とカテゴリを初期化
      const counts: { [key: string]: number } = {}
      const cats: { [key: string]: string } = {}
      data.sections.forEach((section, index) => {
        counts[index] = 0
        cats[index] = section.category || '' // AIが抽出したカテゴリを使用
      })
      setProblemCounts(counts)
      setCategories(cats)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!parsedData) return

    setIsImporting(true)
    setError(null)

    try {
      // 問題集を作成
      const workbookId = await addWorkbook({
        title: parsedData.workbookTitle,
        subject: parsedData.subject,
        totalProblems: 0,
      })

      // セクションごとに問題を登録
      for (let i = 0; i < parsedData.sections.length; i++) {
        const section = parsedData.sections[i]
        const count = problemCounts[i] || 0
        const categoryValue = categories[i]
        const category = categoryValue && categoryValue.trim() !== '' ? categoryValue.trim() : undefined

        // 問題数が設定されていればその数だけ問題を作成
        for (let j = 1; j <= count; j++) {
          await addProblem({
            workbookId,
            problemNumber: `${section.title}-${j}`,
            category,
            page: section.page,
            memo: `${section.title} の問題 ${j}`,
          })
        }
      }

      // PDFがあればアップロード
      if (pdfFile) {
        try {
          const downloadURL = await uploadPDF(pdfFile, workbookId)
          await db.workbooks.update(workbookId, {
            pdfUrl: downloadURL,
            pdfFileName: pdfFile.name,
            updatedAt: new Date(),
          })
        } catch (pdfError) {
          console.error('PDF upload failed:', pdfError)
          // PDFアップロードが失敗しても問題集は作成済みなので続行
          setError('問題集は作成されましたが、PDFのアップロードに失敗しました。問題集詳細から再度アップロードしてください。')
        }
      }

      // 問題集詳細ページへ遷移
      navigate(`/workbooks/${workbookId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートに失敗しました')
    } finally {
      setIsImporting(false)
    }
  }

  const updateProblemCount = (index: number, count: number) => {
    setProblemCounts({
      ...problemCounts,
      [index]: Math.max(0, count),
    })
  }

  const updateSectionTitle = (index: number, newTitle: string) => {
    if (!parsedData) return
    const newSections = [...parsedData.sections]
    newSections[index] = { ...newSections[index], title: newTitle }
    setParsedData({ ...parsedData, sections: newSections })
  }

  const updateSectionPage = (index: number, newPage: number | undefined) => {
    if (!parsedData) return
    const newSections = [...parsedData.sections]
    newSections[index] = { ...newSections[index], page: newPage }
    setParsedData({ ...parsedData, sections: newSections })
  }

  const updateCategory = (index: number, category: string) => {
    setCategories({
      ...categories,
      [index]: category,
    })
  }

  const removeSection = (index: number) => {
    if (!parsedData) return
    const newSections = parsedData.sections.filter((_, i) => i !== index)
    setParsedData({ ...parsedData, sections: newSections })

    const newCounts = { ...problemCounts }
    delete newCounts[index]
    setProblemCounts(newCounts)

    const newCategories = { ...categories }
    delete newCategories[index]
    setCategories(newCategories)
  }

  const totalProblems = Object.values(problemCounts).reduce((sum, count) => sum + count, 0)

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('PDFファイルのみアップロード可能です')
      return
    }

    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      setError('ファイルサイズは50MB以下にしてください')
      return
    }

    setError(null)
    setPdfFile(file)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate('/workbooks')}
        className="mb-4"
      >
        <ArrowLeft size={16} className="mr-2" />
        戻る
      </Button>

      <h1 className="text-2xl font-bold mb-6">目次画像からインポート</h1>

      {/* PDFアップロードセクション */}
      {!parsedData && (
        <Card className="mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                問題集PDF（任意）
              </label>
              {pdfFile ? (
                <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2">
                    <FileText size={20} className="text-gray-500" />
                    <span className="text-sm">{pdfFile.name}</span>
                    <span className="text-xs text-gray-500">
                      ({(pdfFile.size / 1024 / 1024).toFixed(1)}MB)
                    </span>
                  </div>
                  <button
                    onClick={() => setPdfFile(null)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <X size={16} className="text-gray-500" />
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfChange}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <FileText size={32} className="text-gray-400" />
                    <div>
                      <p className="font-medium text-sm">クリックしてPDFを選択</p>
                      <p className="text-xs text-gray-500">50MB以下</p>
                    </div>
                  </label>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                PDFをアップロードすると、学習画面で問題と並べて表示できます
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 目次画像アップロードセクション */}
      {!parsedData && (
        <Card className="mb-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">
                  目次画像をアップロード
                </label>
                <span className="text-sm text-gray-500">
                  {files.length} / {MAX_IMAGES}枚
                </span>
              </div>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="image-upload"
                  disabled={files.length >= MAX_IMAGES}
                />
                <label
                  htmlFor="image-upload"
                  className={`cursor-pointer flex flex-col items-center gap-3 ${
                    files.length >= MAX_IMAGES ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Upload size={48} className="text-gray-400" />
                  <div>
                    <p className="font-medium">
                      {files.length >= MAX_IMAGES
                        ? '最大枚数に達しました'
                        : 'クリックして画像を選択'}
                    </p>
                    <p className="text-sm text-gray-500">
                      JPG, PNG形式に対応（最大{MAX_IMAGES}枚）
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {previews.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">
                  プレビュー ({previews.length}枚)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {previews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-border"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={files.length === 0 || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="mr-2 animate-spin" />
                  解析中...
                </>
              ) : (
                `解析開始 (${files.length}枚)`
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* 解析結果 */}
      {parsedData && (
        <>
          <Card className="mb-6">
            <h2 className="text-lg font-semibold mb-4">解析結果</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  問題集タイトル
                </label>
                <input
                  type="text"
                  value={parsedData.workbookTitle}
                  onChange={(e) =>
                    setParsedData({ ...parsedData, workbookTitle: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">科目</label>
                <input
                  type="text"
                  value={parsedData.subject}
                  onChange={(e) =>
                    setParsedData({ ...parsedData, subject: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">タグ</label>
                <div className="flex flex-wrap gap-2">
                  {parsedData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-secondary rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {pdfFile && (
                <div>
                  <label className="block text-sm font-medium mb-2">PDF</label>
                  <div className="flex items-center gap-2 p-2 bg-secondary rounded">
                    <FileText size={16} className="text-gray-500" />
                    <span className="text-sm">{pdfFile.name}</span>
                    <span className="text-xs text-gray-500">
                      ({(pdfFile.size / 1024 / 1024).toFixed(1)}MB)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                セクション ({parsedData.sections.length})
              </h2>
              <p className="text-sm text-gray-600">
                合計: {totalProblems}問
              </p>
            </div>

            <div className="space-y-3">
              {parsedData.sections.map((section, index) => (
                <div
                  key={index}
                  className="border border-border rounded-lg p-4"
                  style={{ marginLeft: `${section.level * 20}px` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) =>
                            updateSectionTitle(index, e.target.value)
                          }
                          className="flex-1 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                        />
                        <button
                          onClick={() => removeSection(index)}
                          className="p-1 hover:bg-red-100 rounded"
                        >
                          <Trash2 size={16} className="text-error" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600 w-16">カテゴリ:</label>
                            <input
                              type="text"
                              value={categories[index] || ''}
                              onChange={(e) =>
                                updateCategory(index, e.target.value)
                              }
                              placeholder="例: 言語"
                              className="w-32 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600 w-12">ページ:</label>
                            <input
                              type="number"
                              min="1"
                              value={section.page || ''}
                              onChange={(e) =>
                                updateSectionPage(
                                  index,
                                  e.target.value ? parseInt(e.target.value) : undefined
                                )
                              }
                              placeholder="未設定"
                              className="w-20 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600 w-12">問題数:</label>
                            <input
                              type="number"
                              min="0"
                              value={problemCounts[index] || 0}
                              onChange={(e) =>
                                updateProblemCount(
                                  index,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-20 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setParsedData(null)
                setFiles([])
                setPreviews([])
                setPdfFile(null)
              }}
              disabled={isImporting}
            >
              やり直す
            </Button>
            <Button onClick={handleImport} disabled={totalProblems === 0 || isImporting}>
              {isImporting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  インポート中...
                </>
              ) : (
                `インポート (${totalProblems}問${pdfFile ? ' + PDF' : ''})`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/Button'
import Card from '@/components/Card'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { imageToBase64, extractProblemTextFromImage } from '@/lib/openai'
import { generateImageBasedExplanation, regenerateExplanation } from '@/lib/imageExplanation'
import { addImageBasedExplanation } from '@/lib/db'
import { determineUserLevel } from '@/lib/userLevel'
import type { UserLevel } from '@/types'

type Step = 'upload' | 'preview' | 'processing' | 'edit' | 'generating' | 'result'

export default function ImageExplanation() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageBase64, setImageBase64] = useState<string>('')
  const [extractedText, setExtractedText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [userLevel, setUserLevel] = useState<UserLevel | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrConfidence, setOcrConfidence] = useState<number>(0)

  // 画像選択
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageFile(file)
    const preview = URL.createObjectURL(file)
    setImagePreview(preview)

    // Base64に変換（保存用）
    const base64 = await imageToBase64(file)
    setImageBase64(base64)

    setError(null)

    // プレビュー画面へ
    setStep('preview')
  }

  // 画像をキャンセルして最初に戻る
  const handleCancelImage = () => {
    setImageFile(null)
    setImagePreview('')
    setImageBase64('')
    setExtractedText('')
    setEditedText('')
    setError(null)
    setStep('upload')
  }

  // 解説生成を開始（OCR処理から）
  const handleStartGeneration = async () => {
    if (!imageFile) return

    setStep('processing')
    setIsProcessing(true)
    setError(null)

    try {
      // OCR処理
      const base64 = imageBase64
      const ocrResult = await extractProblemTextFromImage(base64)

      setExtractedText(ocrResult.problemText)
      setEditedText(ocrResult.problemText)
      setOcrConfidence(ocrResult.confidence)

      // ユーザーレベルを判定
      const level = await determineUserLevel()
      setUserLevel(level)

      setStep('edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像の読み取りに失敗しました')
      setStep('preview')
    } finally {
      setIsProcessing(false)
    }
  }

  // 解説生成
  const handleGenerateExplanation = async () => {
    if (!imageFile || !userLevel) return

    setIsProcessing(true)
    setError(null)
    setStep('generating')

    try {
      const base64 = await imageToBase64(imageFile)
      const explanationContent = await generateImageBasedExplanation(editedText, base64)

      setExplanation(explanationContent)
      setStep('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : '解説の生成に失敗しました')
      setStep('edit')
    } finally {
      setIsProcessing(false)
    }
  }

  // 解説を再生成
  const handleRegenerateExplanation = async () => {
    if (!imageFile || !userLevel) return

    setIsProcessing(true)
    setError(null)

    try {
      const base64 = await imageToBase64(imageFile)
      const explanationContent = await regenerateExplanation(editedText, userLevel, base64)

      setExplanation(explanationContent)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解説の再生成に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  // 保存
  const handleSave = async () => {
    if (!imageFile || !userLevel) return

    setIsProcessing(true)
    setError(null)

    try {
      await addImageBasedExplanation({
        imageUrl: imageBase64, // Base64 Data URLで保存
        extractedText,
        editedText: editedText !== extractedText ? editedText : undefined,
        explanationContent: explanation,
        userLevel,
        regenerationCount: 0,
      })

      alert('解説を保存しました！')
      navigate('/explanations')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">📷 画像から解説を生成</h1>
        <p className="text-gray-600">問題の写真をアップロードして、あなたのレベルに合わせた解説を作成</p>
      </div>
        {/* エラー表示 */}
        {error && (
          <Card className="bg-red-50 border-red-200">
            <p className="text-red-600">⚠️ {error}</p>
          </Card>
        )}

        {/* ステップ1: 画像アップロード */}
        {step === 'upload' && (
          <Card>
            <h2 className="text-xl font-bold mb-4">📷 問題の画像をアップロード</h2>
            <p className="text-gray-600 mb-4">
              問題の写真やスクリーンショットをアップしてください。
              <br />
              AIが問題文を読み取り、あなたのレベルに合わせた解説を生成します。
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />

            <Button
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              画像を選択
            </Button>
          </Card>
        )}

        {/* ステップ2: 画像プレビュー */}
        {step === 'preview' && (
          <>
            <Card>
              <h2 className="text-xl font-bold mb-4">📸 画像プレビュー</h2>
              <p className="text-gray-600 mb-4">
                この画像で解説を生成しますか？
              </p>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="プレビュー"
                  className="w-full max-w-2xl mx-auto rounded-lg shadow-md"
                />
              )}
            </Card>

            <div className="flex gap-3">
              <Button
                onClick={handleCancelImage}
                variant="secondary"
                className="flex-1"
              >
                ❌ キャンセル
              </Button>
              <Button
                onClick={handleStartGeneration}
                className="flex-1"
              >
                ✓ この画像で解説を生成
              </Button>
            </div>
          </>
        )}

        {/* ステップ3: OCR処理中 */}
        {step === 'processing' && (
          <Card>
            <div className="text-center py-12">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
              <h2 className="text-xl font-bold mb-2">画像を読み取り中...</h2>
              <p className="text-gray-600">問題文を抽出しています</p>
            </div>
          </Card>
        )}

        {/* ステップ4: 問題文編集 */}
        {step === 'edit' && (
          <>
            {/* 画像プレビュー */}
            <Card>
              <h2 className="text-xl font-bold mb-4">📸 アップロードした画像</h2>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="アップロードした問題"
                  className="w-full max-w-2xl mx-auto rounded-lg shadow-md"
                />
              )}
            </Card>

            {/* 問題文編集 */}
            <Card>
              <h2 className="text-xl font-bold mb-4">📝 抽出された問題文</h2>
              {ocrConfidence < 0.8 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-yellow-800 text-sm">
                    ⚠️ 読み取りの確信度が低いです（{Math.round(ocrConfidence * 100)}%）。
                    数値や記号に誤りがないか確認してください。
                  </p>
                </div>
              )}

              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                placeholder="問題文を確認・編集してください"
              />

              {editedText !== extractedText && (
                <p className="text-sm text-blue-600 mt-2">✏️ 編集されました</p>
              )}
            </Card>

            {/* ユーザーレベル表示 */}
            {userLevel && (
              <Card className="bg-blue-50 border-blue-200">
                <h2 className="text-xl font-bold mb-4">💡 あなたの学習状況</h2>
                <div className="space-y-2">
                  <p>
                    • 全体正解率: <strong>{userLevel.overallAccuracy}%</strong> (
                    {userLevel.level === 'beginner'
                      ? '初級レベル'
                      : userLevel.level === 'intermediate'
                      ? '中級レベル'
                      : '上級レベル'}
                    )
                  </p>
                  {userLevel.weakSections.length > 0 && (
                    <p>
                      • 特に苦手:{' '}
                      <strong>
                        {userLevel.weakSections
                          .slice(0, 3)
                          .map((key) => {
                            const [, ...title] = key.split('-')
                            return title.join('-')
                          })
                          .join(', ')}
                      </strong>
                    </p>
                  )}
                  <p className="text-sm text-gray-600 mt-3">
                    この情報をもとに、<strong>あなた向けに最適化された解説</strong>
                    を生成します。
                  </p>
                </div>
              </Card>
            )}

            <Button onClick={handleGenerateExplanation} disabled={isProcessing} className="w-full">
              ✓ 確認して解説を生成
            </Button>
          </>
        )}

        {/* ステップ5: 生成中 */}
        {step === 'generating' && (
          <Card>
            <div className="text-center py-12">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
              <h2 className="text-xl font-bold mb-2">あなたに最適化された解説を生成中...</h2>
              <p className="text-gray-600">
                レベル:{' '}
                {userLevel?.level === 'beginner'
                  ? '初級'
                  : userLevel?.level === 'intermediate'
                  ? '中級'
                  : '上級'}{' '}
                • 正解率: {userLevel?.overallAccuracy}%
              </p>
            </div>
          </Card>
        )}

        {/* ステップ6: 解説表示 */}
        {step === 'result' && (
          <>
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  💡 AI解説 (
                  {userLevel?.level === 'beginner'
                    ? '初級'
                    : userLevel?.level === 'intermediate'
                    ? '中級'
                    : '上級'}
                  レベル)
                </h2>
                <Button
                  onClick={() => setStep('edit')}
                  variant="secondary"
                  size="sm"
                  disabled={isProcessing}
                >
                  📝 問題文を修正
                </Button>
              </div>

              <div className="prose prose-sm max-w-none">
                <MarkdownRenderer content={explanation} />
              </div>
            </Card>

            {/* アクション */}
            <div className="flex gap-3">
              <Button onClick={handleRegenerateExplanation} variant="secondary" disabled={isProcessing}>
                🔄 解説を再生成
              </Button>
              <Button onClick={handleSave} disabled={isProcessing} className="flex-1">
                💾 保存して閉じる
              </Button>
            </div>

            {/* 画像プレビュー（折りたたみ） */}
            <details>
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                📸 元の画像を見る
              </summary>
              <Card className="mt-2">
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="問題画像"
                    className="w-full max-w-2xl mx-auto rounded-lg shadow-md"
                  />
                )}
              </Card>
            </details>
          </>
        )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Button from '@/components/Button'
import Card from '@/components/Card'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { imageToBase64, extractProblemTextFromImage } from '@/lib/openai'
import { generateImageBasedExplanation, regenerateExplanation, answerFollowUpQuestion } from '@/lib/imageExplanation'
import { addImageBasedExplanation, db, getWorkbook } from '@/lib/db'
import { determineUserLevel } from '@/lib/userLevel'
import type { UserLevel, UserLevelType, Problem, Workbook } from '@/types'

type Step = 'upload' | 'preview' | 'processing' | 'edit' | 'generating' | 'result'

export default function ImageExplanation() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageBase64, setImageBase64] = useState<string>('')
  const [extractedText, setExtractedText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [answer, setAnswer] = useState('')
  const [targetProblemNumber, setTargetProblemNumber] = useState('')
  const [explanation, setExplanation] = useState('')
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [userLevel, setUserLevel] = useState<UserLevel | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrConfidence, setOcrConfidence] = useState<number>(0)

  // 手動レベル選択
  const [manualLevelOverride, setManualLevelOverride] = useState<UserLevelType | null>(null)
  const [showManualLevelSelector, setShowManualLevelSelector] = useState(false)

  // 成長可視化
  const [showLevelUpNotification, setShowLevelUpNotification] = useState(false)
  const [levelUpInfo, setLevelUpInfo] = useState<{ from: UserLevelType; to: UserLevelType } | null>(null)

  // インタラクティブQ&A
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpAnswers, setFollowUpAnswers] = useState<{ question: string; answer: string }[]>([])
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false)

  // 問題紐付け機能
  const [linkedProblemId, setLinkedProblemId] = useState<string | null>(null)
  const [linkedWorkbookId, setLinkedWorkbookId] = useState<string | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [workbooks, setWorkbooks] = useState<Map<string, Workbook>>(new Map())
  const [showProblemSelector, setShowProblemSelector] = useState(false)

  // URLパラメータから問題IDを取得（Study画面から遷移した場合）
  useEffect(() => {
    const problemId = searchParams.get('problemId')
    if (problemId) {
      setLinkedProblemId(problemId)
      loadProblemInfo(problemId)
    }
  }, [searchParams])

  // 問題情報を読み込む
  const loadProblemInfo = async (problemId: string) => {
    try {
      const problem = await db.problems.get(problemId)
      if (problem) {
        setLinkedWorkbookId(problem.workbookId)
      }
    } catch (err) {
      console.error('Failed to load problem info:', err)
    }
  }

  // 全問題を読み込む（問題選択用）
  const loadAllProblems = async () => {
    try {
      const allProblems = await db.problems
        .where('deletedAt')
        .equals(undefined as any)
        .toArray()

      setProblems(allProblems)

      // 問題集情報も取得
      const workbookMap = new Map<string, Workbook>()
      for (const problem of allProblems) {
        if (!workbookMap.has(problem.workbookId)) {
          const wb = await getWorkbook(problem.workbookId)
          if (wb) {
            workbookMap.set(problem.workbookId, wb)
          }
        }
      }
      setWorkbooks(workbookMap)
    } catch (err) {
      console.error('Failed to load problems:', err)
    }
  }

  // レベルアップチェック
  const checkLevelUp = (currentLevel: UserLevelType) => {
    try {
      const previousLevel = localStorage.getItem('lastUserLevel') as UserLevelType | null

      if (previousLevel && previousLevel !== currentLevel) {
        const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 }
        if (levelOrder[currentLevel] > levelOrder[previousLevel]) {
          // レベルアップ！
          setLevelUpInfo({ from: previousLevel, to: currentLevel })
          setShowLevelUpNotification(true)
        }
      }

      // 現在のレベルを保存
      localStorage.setItem('lastUserLevel', currentLevel)
    } catch (err) {
      console.error('Failed to check level up:', err)
    }
  }

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
    setAnswer('')
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

      // レベルアップチェック
      checkLevelUp(level.level)

      setStep('edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像の読み取りに失敗しました')
      setStep('preview')
    } finally {
      setIsProcessing(false)
    }
  }

  // 有効なユーザーレベルを取得（手動選択があればそれを優先）
  const getEffectiveUserLevel = (): UserLevel | null => {
    if (!userLevel) return null
    if (!manualLevelOverride) return userLevel

    return {
      ...userLevel,
      level: manualLevelOverride,
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
      const effectiveLevel = getEffectiveUserLevel()!

      // 手動レベルを使う場合、一時的にuserLevelを上書き
      const result = await generateImageBasedExplanation(
        editedText,
        answer || undefined,
        base64,
        targetProblemNumber || undefined
      )

      setExplanation(result.explanation)
      setSuggestedQuestions(result.suggestedQuestions)

      // 手動選択した場合、userLevelを更新
      if (manualLevelOverride) {
        setUserLevel(effectiveLevel)
      }

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
      const effectiveLevel = getEffectiveUserLevel()!

      const explanationContent = await regenerateExplanation(
        editedText,
        effectiveLevel,
        answer || undefined,
        base64
      )

      setExplanation(explanationContent)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解説の再生成に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  // 追加質問を処理
  const handleFollowUpQuestion = async (question: string) => {
    if (!userLevel) return

    setIsGeneratingFollowUp(true)
    setError(null)

    try {
      const base64 = imageFile ? await imageToBase64(imageFile) : undefined
      const answer = await answerFollowUpQuestion(
        question,
        editedText || extractedText,
        explanation,
        userLevel,
        base64
      )

      setFollowUpAnswers([...followUpAnswers, { question, answer }])
      setFollowUpQuestion('') // フリーチャット欄をクリア
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加質問の処理に失敗しました')
    } finally {
      setIsGeneratingFollowUp(false)
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
        answer: answer || undefined,
        targetProblemNumber: targetProblemNumber || undefined,
        explanationContent: explanation,
        suggestedQuestions: suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
        followUpExplanations: followUpAnswers.length > 0 ? followUpAnswers : undefined,
        userLevel,
        regenerationCount: 0,
        problemId: linkedProblemId || undefined,
        workbookId: linkedWorkbookId || undefined,
      })

      alert('解説を保存しました！')

      // 問題と紐付いている場合は問題画面に戻る、それ以外は解説一覧へ
      if (linkedProblemId) {
        navigate(`/study/${linkedProblemId}`)
      } else {
        navigate('/explanations')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  // 戻る処理
  const handleGoBack = () => {
    // Study画面から遷移した場合は元の問題に戻る
    if (linkedProblemId) {
      navigate(`/study/${linkedProblemId}`)
    } else {
      // それ以外は解説一覧へ
      navigate('/explanations')
    }
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGoBack}
          title="戻る"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-1">📷 画像から解説を生成</h1>
          <p className="text-gray-600 text-sm">問題の写真をアップロードして、あなたのレベルに合わせた解説を作成</p>
        </div>
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

            {/* 問題番号指定 */}
            <Card className="bg-yellow-50 border-yellow-200">
              <h2 className="text-xl font-bold mb-4">🎯 解説対象の問題（任意）</h2>
              <p className="text-gray-600 text-sm mb-3">
                画像に複数の問題（例：1-1、1-2、1-3）が含まれる場合、どの問題について解説するか指定できます。
                <br />
                前提問題も文脈として活用しながら、指定した問題のみ解説します。
              </p>
              <input
                type="text"
                value={targetProblemNumber}
                onChange={(e) => setTargetProblemNumber(e.target.value)}
                className="w-full p-3 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
                placeholder="例: 1-3、問題3、(3)、など"
              />
              {targetProblemNumber && (
                <p className="text-sm text-yellow-800 mt-2 bg-yellow-100 p-2 rounded">
                  💡 問題「{targetProblemNumber}」について解説します。他の問題は前提として参照します。
                </p>
              )}
              {!targetProblemNumber && (
                <p className="text-xs text-gray-500 mt-2">
                  未入力の場合、画像内の全ての問題について解説します
                </p>
              )}
            </Card>

            {/* 答え入力 */}
            <Card>
              <h2 className="text-xl font-bold mb-4">✅ この問題の答え（任意）</h2>
              <p className="text-gray-600 text-sm mb-3">
                答えを入力すると、その答えを前提とした正確な解説が生成されます。
                <br />
                入力しない場合、AIが問題を解いて答えを推測します。
              </p>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例: 3、A、12.5、など"
              />
              {answer && (
                <p className="text-sm text-green-600 mt-2">✓ 答え「{answer}」を前提に解説を生成します</p>
              )}
            </Card>

            {/* 問題との紐付け（オプション） */}
            <Card className="bg-gray-50">
              <h2 className="text-xl font-bold mb-4">🔗 問題との紐付け（任意）</h2>
              <p className="text-gray-600 text-sm mb-3">
                既存の問題と紐付けると、学習画面からこの解説を参照できます。
              </p>

              {linkedProblemId ? (
                <div className="space-y-2">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-green-800 text-sm font-medium">
                      ✓ 問題に紐付けられています
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setLinkedProblemId(null)
                      setLinkedWorkbookId(null)
                    }}
                    className="w-full"
                  >
                    紐付けを解除
                  </Button>
                </div>
              ) : (
                <div>
                  {!showProblemSelector ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowProblemSelector(true)
                        loadAllProblems()
                      }}
                      className="w-full"
                    >
                      問題を選択
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <select
                        value={linkedProblemId || ''}
                        onChange={(e) => {
                          setLinkedProblemId(e.target.value || null)
                          const problem = problems.find(p => p.id === e.target.value)
                          if (problem) {
                            setLinkedWorkbookId(problem.workbookId)
                          }
                        }}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">問題を選択してください</option>
                        {problems.map((problem) => {
                          const workbook = workbooks.get(problem.workbookId)
                          return (
                            <option key={problem.id} value={problem.id}>
                              {workbook?.title} - 問題{problem.problemNumber}
                              {problem.sectionTitle && ` (${problem.sectionTitle})`}
                            </option>
                          )
                        })}
                      </select>
                      <Button
                        variant="secondary"
                        onClick={() => setShowProblemSelector(false)}
                        className="w-full"
                      >
                        キャンセル
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* ユーザーレベル表示 */}
            {userLevel && (
              <Card className="bg-blue-50 border-blue-200">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl font-bold">💡 あなたの学習状況</h2>
                  <Button
                    variant="secondary"
                    onClick={() => setShowManualLevelSelector(!showManualLevelSelector)}
                    className="text-sm"
                  >
                    {showManualLevelSelector ? 'キャンセル' : 'レベルを変更'}
                  </Button>
                </div>

                {!showManualLevelSelector ? (
                  <div className="space-y-2">
                    <p>
                      • 全体正解率: <strong>{userLevel.overallAccuracy}%</strong> (
                      {manualLevelOverride
                        ? `${manualLevelOverride === 'beginner' ? '初級' : manualLevelOverride === 'intermediate' ? '中級' : '上級'}レベル（手動選択）`
                        : `${userLevel.level === 'beginner' ? '初級' : userLevel.level === 'intermediate' ? '中級' : '上級'}レベル`
                      }
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
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                      解説の難易度レベルを手動で選択できます。自動判定より優先されます。
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setManualLevelOverride('beginner')}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          manualLevelOverride === 'beginner'
                            ? 'border-blue-500 bg-blue-100 text-blue-900 font-semibold'
                            : 'border-gray-300 bg-white hover:border-blue-300'
                        }`}
                      >
                        <div className="text-lg mb-1">🌱</div>
                        <div className="text-sm">初級</div>
                      </button>
                      <button
                        onClick={() => setManualLevelOverride('intermediate')}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          manualLevelOverride === 'intermediate'
                            ? 'border-blue-500 bg-blue-100 text-blue-900 font-semibold'
                            : 'border-gray-300 bg-white hover:border-blue-300'
                        }`}
                      >
                        <div className="text-lg mb-1">🌿</div>
                        <div className="text-sm">中級</div>
                      </button>
                      <button
                        onClick={() => setManualLevelOverride('advanced')}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${
                          manualLevelOverride === 'advanced'
                            ? 'border-blue-500 bg-blue-100 text-blue-900 font-semibold'
                            : 'border-gray-300 bg-white hover:border-blue-300'
                        }`}
                      >
                        <div className="text-lg mb-1">🌳</div>
                        <div className="text-sm">上級</div>
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setManualLevelOverride(null)
                          setShowManualLevelSelector(false)
                        }}
                        className="flex-1"
                      >
                        自動判定に戻す
                      </Button>
                      <Button
                        onClick={() => setShowManualLevelSelector(false)}
                        disabled={!manualLevelOverride}
                        className="flex-1"
                      >
                        ✓ 確定
                      </Button>
                    </div>
                  </div>
                )}
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

            {/* 追加質問セクション */}
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <span>🙋</span>
                もっと詳しく知りたいことはありますか？
              </h3>

              {/* 4択ボタン */}
              {suggestedQuestions.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 mb-3">よくある質問：</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {suggestedQuestions.map((q, index) => (
                      <button
                        key={index}
                        onClick={() => handleFollowUpQuestion(q)}
                        disabled={isGeneratingFollowUp}
                        className="text-left px-4 py-3 bg-white hover:bg-purple-100 border-2 border-purple-300 rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {index + 1}. {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* フリーチャット入力 */}
              <div>
                <p className="text-sm text-gray-700 mb-2">他にも質問があればどうぞ：</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={followUpQuestion}
                    onChange={(e) => setFollowUpQuestion(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && followUpQuestion.trim() && !isGeneratingFollowUp) {
                        handleFollowUpQuestion(followUpQuestion.trim())
                      }
                    }}
                    placeholder="例：この公式はどこから来たの？"
                    disabled={isGeneratingFollowUp}
                    className="flex-1 px-4 py-2 border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  />
                  <Button
                    onClick={() => handleFollowUpQuestion(followUpQuestion.trim())}
                    disabled={!followUpQuestion.trim() || isGeneratingFollowUp}
                    variant="secondary"
                  >
                    {isGeneratingFollowUp ? '生成中...' : '質問'}
                  </Button>
                </div>
              </div>

              {/* 追加解説の表示 */}
              {followUpAnswers.length > 0 && (
                <div className="mt-4 space-y-3">
                  <hr className="border-purple-200" />
                  {followUpAnswers.map((qa, index) => (
                    <div key={index} className="bg-white rounded-lg p-4 border-2 border-purple-200">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-purple-600 font-bold">Q{index + 1}:</span>
                        <p className="font-semibold text-gray-800">{qa.question}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-pink-600 font-bold">A{index + 1}:</span>
                        <div className="flex-1 prose prose-sm max-w-none">
                          <MarkdownRenderer content={qa.answer} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* レベルアップ通知モーダル */}
      {showLevelUpNotification && levelUpInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 text-center animate-bounce-in">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2 text-green-600">レベルアップ！</h2>
            <p className="text-gray-700 mb-4">
              <span className="text-lg">
                {levelUpInfo.from === 'beginner' ? '初級' : levelUpInfo.from === 'intermediate' ? '中級' : '上級'}
              </span>
              <span className="mx-2">→</span>
              <span className="text-xl font-bold text-green-600">
                {levelUpInfo.to === 'beginner' ? '初級' : levelUpInfo.to === 'intermediate' ? '中級' : '上級'}
              </span>
              <span className="ml-1">
                {levelUpInfo.to === 'intermediate' ? '🌿' : '🌳'}
              </span>
            </p>
            <p className="text-sm text-gray-600 mb-6">
              {levelUpInfo.to === 'intermediate'
                ? '基礎が身についてきました！パターン認識力を磨いていきましょう。'
                : '素晴らしい！より効率的で洗練された解法を学んでいきましょう。'
              }
            </p>
            <Button
              onClick={() => setShowLevelUpNotification(false)}
              className="w-full"
            >
              ✓ ありがとう！
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

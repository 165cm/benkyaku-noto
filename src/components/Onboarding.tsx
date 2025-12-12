import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Target, Brain, ArrowRight, CheckCircle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

interface OnboardingProps {
  onComplete: () => void
}

const steps = [
  {
    icon: BookOpen,
    title: 'ようこそ！弁却ノートへ',
    description: '参考書の問題を効率的に管理し、\nAI駆動の復習で学習効率を最大化しましょう。',
    tip: null,
  },
  {
    icon: Target,
    title: 'Step 1: 問題集を作成',
    description: '「問題集」ページから新しい問題集を作成します。\n目次画像からAIが自動でインポートすることもできます。',
    tip: '目次画像から自動インポートすると、セクションと問題番号が一括で登録されます',
  },
  {
    icon: Brain,
    title: 'Step 2: 学習を記録',
    description: '問題を解いたら ◯ △ × で結果を記録。\nシステムが最適な復習タイミングを計算します。',
    tip: '忘却曲線に基づいて、忘れかけた頃に復習することで記憶が定着します',
  },
  {
    icon: CheckCircle,
    title: '準備完了！',
    description: 'さあ、最初の問題集を作成してみましょう。\n学習の第一歩を踏み出しましょう！',
    tip: null,
  },
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()

  const isLastStep = currentStep === steps.length - 1
  const step = steps[currentStep]
  const Icon = step.icon

  const handleNext = () => {
    if (isLastStep) {
      localStorage.setItem('onboarding_completed', 'true')
      onComplete()
      navigate('/workbooks')
    } else {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleSkip = () => {
    localStorage.setItem('onboarding_completed', 'true')
    onComplete()
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  return (
    <Modal isOpen={true} onClose={handleSkip} title="">
      <div className="text-center py-4">
        {/* アイコン */}
        <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Icon size={40} className="text-blue-600" />
        </div>

        {/* タイトル */}
        <h2 className="text-2xl font-bold mb-4 text-gray-900">{step.title}</h2>

        {/* 説明 */}
        <p className="text-gray-600 whitespace-pre-line mb-4 leading-relaxed">
          {step.description}
        </p>

        {/* Tips */}
        {step.tip && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-6 text-left">
            <p className="text-sm text-blue-800">
              💡 <span className="font-medium">ヒント:</span> {step.tip}
            </p>
          </div>
        )}

        {/* 進行状況インジケーター */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'bg-blue-600 scale-110'
                  : index < currentStep
                  ? 'bg-blue-300'
                  : 'bg-gray-200'
              }`}
              aria-label={`ステップ ${index + 1}`}
            />
          ))}
        </div>

        {/* ナビゲーションボタン */}
        <div className="flex gap-3 justify-center">
          {currentStep > 0 && (
            <Button variant="secondary" onClick={handlePrevious}>
              戻る
            </Button>
          )}
          <Button variant="secondary" onClick={handleSkip}>
            スキップ
          </Button>
          <Button onClick={handleNext}>
            {isLastStep ? '始める' : '次へ'}
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// オンボーディング状態を確認するユーティリティ
export function isOnboardingCompleted(): boolean {
  return localStorage.getItem('onboarding_completed') === 'true'
}

export function resetOnboarding(): void {
  localStorage.removeItem('onboarding_completed')
}

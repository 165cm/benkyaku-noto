import { useState } from 'react'
import { Info, X } from 'lucide-react'

interface InfoTooltipProps {
  content: string
  size?: number
}

export default function InfoTooltip({ content, size = 14 }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex cursor-help text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="詳細情報"
      >
        <Info size={size} />
      </button>

      {/* モーダル（スマホ・タブレット対応） */}
      {isOpen && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* ツールチップコンテンツ */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-sm">
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="閉じる"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {content}
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}

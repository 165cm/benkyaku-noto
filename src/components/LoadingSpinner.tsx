import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  fullScreen?: boolean
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 24,
  md: 40,
  lg: 56,
}

export default function LoadingSpinner({
  fullScreen = false,
  message = '読み込み中...',
  size = 'md',
}: LoadingSpinnerProps) {
  const content = (
    <div className="flex flex-col items-center gap-3">
      <Loader2
        size={sizes[size]}
        className="animate-spin text-blue-600"
      />
      {message && (
        <p className="text-gray-600 text-sm">{message}</p>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12">
      {content}
    </div>
  )
}

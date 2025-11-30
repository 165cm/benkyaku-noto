import { useEffect } from 'react'
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'
import { useToastStore, type Toast as ToastType } from '@/store/toastStore'

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

interface ToastProps {
  toast: ToastType
  onClose: () => void
}

function Toast({ toast, onClose }: ToastProps) {
  const { type, title, message, action } = toast

  // アイコンとスタイルを取得
  const config = getToastConfig(type)

  return (
    <div
      className={`${config.bgColor} ${config.borderColor} border-l-4 rounded-md shadow-lg p-3 pointer-events-auto animate-slide-in-right`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        {/* アイコン */}
        <div className={`${config.iconColor} flex-shrink-0 mt-0.5`}>
          {config.icon}
        </div>

        {/* コンテンツ */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${config.textColor}`}>{title}</p>
          {message && (
            <p className={`text-xs mt-0.5 ${config.subTextColor}`}>{message}</p>
          )}

          {/* アクションボタン */}
          {action && (
            <button
              onClick={action.onClick}
              className={`text-xs font-medium mt-1 ${config.actionColor} hover:underline`}
            >
              {action.label}
            </button>
          )}
        </div>

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          className={`${config.closeColor} hover:opacity-70 flex-shrink-0`}
          aria-label="閉じる"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function getToastConfig(type: ToastType['type']) {
  switch (type) {
    case 'success':
      return {
        icon: <CheckCircle size={20} />,
        bgColor: 'bg-green-50',
        borderColor: 'border-green-500',
        iconColor: 'text-green-600',
        textColor: 'text-green-800',
        subTextColor: 'text-green-700',
        actionColor: 'text-green-700',
        closeColor: 'text-green-600',
      }
    case 'error':
      return {
        icon: <XCircle size={20} />,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-500',
        iconColor: 'text-red-600',
        textColor: 'text-red-800',
        subTextColor: 'text-red-700',
        actionColor: 'text-red-700',
        closeColor: 'text-red-600',
      }
    case 'warning':
      return {
        icon: <AlertCircle size={20} />,
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-500',
        iconColor: 'text-yellow-600',
        textColor: 'text-yellow-800',
        subTextColor: 'text-yellow-700',
        actionColor: 'text-yellow-700',
        closeColor: 'text-yellow-600',
      }
    case 'info':
      return {
        icon: <Info size={20} />,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-500',
        iconColor: 'text-blue-600',
        textColor: 'text-blue-800',
        subTextColor: 'text-blue-700',
        actionColor: 'text-blue-700',
        closeColor: 'text-blue-600',
      }
  }
}

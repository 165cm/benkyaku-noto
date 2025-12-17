import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  checkboxLabel?: string
  onCheckboxChange?: (checked: boolean) => void
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '確認',
  cancelText = 'キャンセル',
  variant = 'default',
  checkboxLabel,
  onCheckboxChange,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error('ConfirmDialog error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-gray-600 mb-6 whitespace-pre-wrap">{message}</p>

      {/* チェックボックス（オプション） */}
      {checkboxLabel && onCheckboxChange && (
        <label className="flex items-center gap-2 mb-4 text-sm text-gray-600 cursor-pointer w-fit">
          <input
            type="checkbox"
            onChange={(e) => onCheckboxChange(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          {checkboxLabel}
        </label>
      )}

      <div className="flex gap-3 justify-end">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={isLoading}
        >
          {cancelText}
        </Button>
        <Button
          variant={variant === 'danger' ? 'error' : 'primary'}
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? '処理中...' : confirmText}
        </Button>
      </div>
    </Modal>
  )
}

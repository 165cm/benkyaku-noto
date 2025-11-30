import { Component } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import Button from './Button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * エラーバウンダリコンポーネント
 *
 * 子コンポーネントでエラーが発生した場合にキャッチし、
 * フォールバックUIを表示します。
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // エラーログをコンソールに出力（プロダクションでは外部サービスに送信することも可能）
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    // ページをリロードしてアプリを初期状態に戻す
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // カスタムフォールバックUIが提供されている場合はそれを使用
      if (this.props.fallback) {
        return this.props.fallback
      }

      // デフォルトのエラーUI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-red-100 p-3">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              エラーが発生しました
            </h1>

            <p className="text-gray-600 mb-6">
              申し訳ございません。予期しないエラーが発生しました。
              {this.state.error && (
                <span className="block mt-2 text-sm text-gray-500">
                  {this.state.error.message}
                </span>
              )}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReset} variant="primary">
                アプリを再起動
              </Button>
              <Button
                onClick={() => window.history.back()}
                variant="secondary"
              >
                前のページに戻る
              </Button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                問題が解決しない場合は、ブラウザのキャッシュをクリアしてください。
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

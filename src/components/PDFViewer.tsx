import { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

// PDF.js workerの設定（ローカルファイルを使用してCORS問題を回避）
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PDFViewerProps {
  pdfUrl: string
  initialPage?: number
  onPageChange?: (page: number) => void
}

export default function PDFViewer({ pdfUrl, initialPage = 1, onPageChange }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(initialPage)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // initialPageが変更されたら同期
  useEffect(() => {
    if (initialPage >= 1) {
      setPageNumber(initialPage)
    }
  }, [initialPage])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
    // PDFロード完了後、initialPageに移動
    if (initialPage >= 1 && initialPage <= numPages) {
      setPageNumber(initialPage)
    }
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF読み込みエラー:', error)
    console.error('PDF URL:', pdfUrl)
    // CORSエラーの場合の詳細メッセージ
    if (error.message?.includes('fetch') || error.message?.includes('CORS')) {
      setError('PDFの読み込みに失敗しました（CORSエラーの可能性）')
    } else {
      setError(`PDFの読み込みに失敗しました: ${error.message || '不明なエラー'}`)
    }
    setLoading(false)
  }

  const goToPrevPage = () => {
    const newPage = Math.max(pageNumber - 1, 1)
    setPageNumber(newPage)
    onPageChange?.(newPage)
  }

  const goToNextPage = () => {
    const newPage = Math.min(pageNumber + 1, numPages)
    setPageNumber(newPage)
    onPageChange?.(newPage)
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page)
      onPageChange?.(page)
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg p-8">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">{error}</p>
          <p className="text-sm text-gray-600">PDFファイルを確認してください</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg">
      {/* コントロールバー */}
      <div className="flex items-center justify-between p-3 bg-white border-b border-gray-200 rounded-t-lg">
        <Button
          variant="secondary"
          size="sm"
          onClick={goToPrevPage}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="flex items-center gap-2">
          <input
            type="number"
            value={pageNumber}
            onChange={(e) => goToPage(parseInt(e.target.value))}
            className="w-16 px-2 py-1 text-center border border-gray-300 rounded"
            min={1}
            max={numPages}
          />
          <span className="text-sm text-gray-600">/ {numPages || '...'} ページ</span>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={goToNextPage}
          disabled={pageNumber >= numPages}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* PDF表示エリア */}
      <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-600">PDFを読み込み中...</p>
          </div>
        )}
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  )
}

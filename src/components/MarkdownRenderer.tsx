interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // マークダウンをパースして要素に変換
  const parseMarkdown = (text: string) => {
    const lines = text.split('\n')
    const elements: JSX.Element[] = []
    let currentList: string[] = []
    let listKey = 0

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`list-${listKey++}`} className="my-3 ml-4 space-y-1">
            {currentList.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-gray-400 mt-1.5">•</span>
                <span>{parseInline(item)}</span>
              </li>
            ))}
          </ul>
        )
        currentList = []
      }
    }

    // インライン要素（太字など）をパース
    const parseInline = (text: string) => {
      const parts = text.split(/(\*\*[^*]+\*\*)/g)
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-gray-900">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return part
      })
    }

    let lineKey = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // 空行
      if (line === '') {
        flushList()
        continue
      }

      // 見出し3 (###)
      if (line.startsWith('### ')) {
        flushList()
        elements.push(
          <h3
            key={`h3-${lineKey++}`}
            className="text-lg font-bold text-gray-900 mt-6 mb-3 pb-2 border-b border-gray-200"
          >
            {line.slice(4)}
          </h3>
        )
        continue
      }

      // 見出し2 (##)
      if (line.startsWith('## ')) {
        flushList()
        elements.push(
          <h2
            key={`h2-${lineKey++}`}
            className="text-xl font-bold text-gray-900 mt-6 mb-3"
          >
            {line.slice(3)}
          </h2>
        )
        continue
      }

      // リスト項目
      if (line.startsWith('- ') || line.startsWith('* ')) {
        currentList.push(line.slice(2))
        continue
      }

      // 番号付きリスト
      if (/^\d+\.\s/.test(line)) {
        flushList()
        const match = line.match(/^(\d+)\.\s(.+)$/)
        if (match) {
          elements.push(
            <div key={`ol-${lineKey++}`} className="flex items-start gap-3 my-2">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                {match[1]}
              </span>
              <span className="flex-1">{parseInline(match[2])}</span>
            </div>
          )
        }
        continue
      }

      // 通常の段落
      flushList()
      elements.push(
        <p key={`p-${lineKey++}`} className="my-3 text-gray-700 leading-relaxed">
          {parseInline(line)}
        </p>
      )
    }

    flushList()
    return elements
  }

  return (
    <div className="prose-custom">
      {parseMarkdown(content)}
    </div>
  )
}

import { getOpenAIApiKey } from './storage'

export interface TableOfContentsSection {
  title: string
  category?: string // 親カテゴリ（例: "言語", "数学"）
  level: number // 0: 章, 1: 節, 2: 項
  page?: number
}

export interface ParsedTableOfContents {
  workbookTitle: string
  subject: string
  sections: TableOfContentsSection[]
  tags: string[]
}

// 画像をBase64に変換
export async function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// GPT-4 Vision APIで目次を解析（複数画像対応）
export async function parseTableOfContents(
  imageBase64Array: string[]
): Promise<ParsedTableOfContents> {
  const apiKey = getOpenAIApiKey()

  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません')
  }

  // コンテンツを構築（テキスト + 複数画像）
  const requestContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: `以下の参考書の目次画像（${imageBase64Array.length}枚）を解析して、JSON形式で構造化してください。

複数の画像がある場合は、それらを統合して1つの目次として構造化してください。

要件:
1. workbookTitle: 参考書のタイトル（画像から読み取れる場合）
2. subject: 科目名（例: 数学、英語、物理など）
3. sections: 章・節・項の階層構造を順番に全て抽出
   - title: セクションのタイトル
   - category: 親カテゴリ（例: "言語"、"数学"、"知識"など。明確な分類がある場合のみ）
   - level: 0=章、1=節、2=項
   - page: ページ番号（あれば）
4. tags: 適切なタグ（例: ["基本", "応用", "頻出"]など）

categoryは、目次の大分類（例：公務員試験の「言語」「数学」「知識」など）が明示されている場合のみ設定してください。
セクションが特定のカテゴリに属していない場合や不明な場合は省略してください。

JSON形式で出力してください。他のテキストは含めないでください。`,
    },
    ...imageBase64Array.map((base64) => ({
      type: 'image_url',
      image_url: {
        url: base64,
      },
    })),
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: requestContent,
        },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI API Error: ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content

  // JSONのみを抽出（```json ``` で囲まれている場合に対応）
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content

  try {
    return JSON.parse(jsonStr)
  } catch (error) {
    console.error('Failed to parse JSON:', content)
    throw new Error('APIの応答をパースできませんでした')
  }
}

// OCR結果の型定義
export interface OCRResult {
  problemText: string // 抽出された問題文（Markdown + LaTeX）
  hasMultipleChoice: boolean
  choices?: string[]
  hasDiagram: boolean
  diagramDescription?: string
  confidence: number // OCRの確信度 (0.0-1.0)
}

// GPT-4o Visionで問題文をOCR
export async function extractProblemTextFromImage(imageBase64: string): Promise<OCRResult> {
  const apiKey = getOpenAIApiKey()

  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `以下の画像から問題文を正確に抽出してください。

# 抽出ルール
1. 数式はLaTeX記法で表現（例: $\\frac{1}{2}$, $x^2 + y^2 = r^2$）
2. 図表がある場合は [図: 説明] のように記述
3. 選択肢がある場合は番号付きで抽出
4. 問題番号も含めて抽出

# 出力形式
JSON形式で以下を返してください:

\`\`\`json
{
  "problemText": "抽出された問題文（Markdown + LaTeX）",
  "hasMultipleChoice": true/false,
  "choices": ["選択肢1", "選択肢2", ...],
  "hasDiagram": true/false,
  "diagramDescription": "図の説明",
  "confidence": 0.0-1.0
}
\`\`\`

JSONのみを返してください。他のテキストは含めないでください。`,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageBase64,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI API Error: ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content

  // JSONのみを抽出
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content

  try {
    return JSON.parse(jsonStr)
  } catch (error) {
    console.error('Failed to parse JSON:', content)
    throw new Error('OCRの応答をパースできませんでした')
  }
}

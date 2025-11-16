import { getOpenAIApiKey } from './storage'

export interface TableOfContentsSection {
  title: string
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

// GPT-4 Vision APIで目次を解析
export async function parseTableOfContents(
  imageBase64: string
): Promise<ParsedTableOfContents> {
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
              text: `以下の参考書の目次画像を解析して、JSON形式で構造化してください。

要件:
1. workbookTitle: 参考書のタイトル（画像から読み取れる場合）
2. subject: 科目名（例: 数学、英語、物理など）
3. sections: 章・節・項の階層構造
   - title: セクションのタイトル
   - level: 0=章、1=節、2=項
   - page: ページ番号（あれば）
4. tags: 適切なタグ（例: ["基本", "応用", "頻出"]など）

JSON形式で出力してください。他のテキストは含めないでください。`,
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

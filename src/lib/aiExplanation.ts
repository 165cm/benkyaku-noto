import { getOpenAIApiKey } from './storage'
import { addExplanation, getExplanationSectionKeys } from './db'
import { calculateSectionStats, type SectionStats } from './review'

// OpenAI APIを使用して解説を生成
export async function generateExplanation(section: SectionStats): Promise<string> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。')
  }

  const prompt = `あなたは優秀な学習コーチです。以下の問題セクションについて、学習者が苦手を克服できるよう解説を生成してください。

## セクション情報
- カテゴリ: ${section.category}
- セクション名: ${section.title}
- 現在の正答率: ${section.accuracy}%
- 学習済み問題数: ${section.studiedCount}/${section.problems.length}問

## 生成する解説の内容
以下の形式でマークダウンで解説を生成してください：

### 解き方のコツ
このセクションの問題を解く際の基本的なアプローチと考え方を説明してください。

### 典型的な間違いパターン
学習者がよく犯す間違いとその原因を3つ程度挙げてください。

### 暗記ポイント
覚えておくべき公式、パターン、キーワードをリストアップしてください。

### 類似問題への応用
このセクションで学んだ知識を他の問題にどう応用できるか説明してください。

### 学習アドバイス
正答率${section.accuracy}%の学習者に対する具体的なアドバイスを提供してください。

解説は具体的で実践的な内容にしてください。`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'あなたは学習支援の専門家です。わかりやすく実践的な解説を提供してください。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI API エラー: ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// 次に解説を生成すべきセクションを取得（生成済みをスキップ）
export async function getNextSectionForExplanation(): Promise<SectionStats | null> {
  const sectionStats = await calculateSectionStats()
  const existingKeys = await getExplanationSectionKeys()

  // 生成済みセクションをスキップ
  const unexlainedSections = sectionStats.filter(
    section => !existingKeys.includes(section.sectionKey)
  )

  if (unexlainedSections.length === 0) {
    return null
  }

  // 最も正答率の低いセクションを返す
  return unexlainedSections[0]
}

// 解説を生成して保存
export async function generateAndSaveExplanation(): Promise<{
  sectionKey: string
  category: string
  title: string
} | null> {
  const section = await getNextSectionForExplanation()

  if (!section) {
    return null
  }

  const content = await generateExplanation(section)

  await addExplanation({
    sectionKey: section.sectionKey,
    category: section.category,
    sectionTitle: section.title,
    content,
    accuracy: section.accuracy || 0,
  })

  return {
    sectionKey: section.sectionKey,
    category: section.category,
    title: section.title,
  }
}

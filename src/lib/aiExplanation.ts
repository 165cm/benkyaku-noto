import { getOpenAIApiKey } from './storage'
import { addExplanation, getExplanationSectionKeys } from './db'
import { calculateSectionStats, type SectionStats } from './review'

// GPTに全データを送って分析と解説を生成
export async function generateExplanationWithAnalysis(
  allSections: SectionStats[],
  existingKeys: string[]
): Promise<{ topic: string; category: string; content: string }> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。')
  }

  // 全セクションのデータをJSON形式で準備
  const sectionsData = allSections.map(section => ({
    sectionKey: section.sectionKey,
    category: section.category,
    title: section.title,
    accuracy: section.accuracy,
    studiedCount: section.studiedCount,
    totalProblems: section.problems.length,
    alreadyExplained: existingKeys.includes(section.sectionKey)
  }))

  const prompt = `あなたは優秀な学習コーチです。以下は学習者の全セクション別の正答率データです。
このデータを分析し、学習者が最も優先的に理解すべきポイントを特定して解説を生成してください。

## 全セクションの学習データ
\`\`\`json
${JSON.stringify(sectionsData, null, 2)}
\`\`\`

## 指示
1. alreadyExplained: true のセクションは解説済みなのでスキップしてください
2. 単純に正答率が低いセクションを選ぶのではなく、以下を考慮してください：
   - 基礎的な概念の理解不足が他の分野に影響していないか
   - 複数のセクションに共通する弱点パターンはないか
   - 学習量（studiedCount）と正答率のバランス
   - 改善による波及効果が大きいトピックはどれか

3. 分析結果に基づいて、以下の形式でマークダウンの解説を生成してください：

---
SELECTED_TOPIC: [選んだセクションのsectionKey]
SELECTED_CATEGORY: [選んだセクションのcategory]
---

## 選定理由
なぜこのトピックを最優先で学ぶべきか、データに基づいて説明してください。

## 解き方のコツ
このトピックの問題を解く際の基本的なアプローチと考え方を説明してください。

## 典型的な間違いパターン
学習者がよく犯す間違いとその原因を3つ程度挙げてください。

## 暗記ポイント
覚えておくべき公式、パターン、キーワードをリストアップしてください。

## 他セクションとの関連
このトピックを理解することで改善が期待できる関連セクションがあれば説明してください。

## 学習アドバイス
この学習者のデータパターンに基づいた具体的なアドバイスを提供してください。`

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
          content: 'あなたは学習支援の専門家です。学習データを分析し、最も効果的な学習ポイントを特定して解説を提供してください。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 3000,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OpenAI API エラー: ${error.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content

  // レスポンスからトピック情報を抽出
  const topicMatch = content.match(/SELECTED_TOPIC:\s*(.+)/)
  const categoryMatch = content.match(/SELECTED_CATEGORY:\s*(.+)/)

  const topic = topicMatch ? topicMatch[1].trim() : 'unknown'
  const category = categoryMatch ? categoryMatch[1].trim() : 'unknown'

  // メタデータ行を除去したコンテンツを返す
  const cleanContent = content
    .replace(/---\s*\n?SELECTED_TOPIC:[^\n]+\n?SELECTED_CATEGORY:[^\n]+\n?---/g, '')
    .trim()

  return { topic, category, content: cleanContent }
}

// 未解説セクションがあるか確認
export async function hasUnexplainedSections(): Promise<boolean> {
  const sectionStats = await calculateSectionStats()
  const existingKeys = await getExplanationSectionKeys()

  const unexplainedSections = sectionStats.filter(
    section => !existingKeys.includes(section.sectionKey)
  )

  return unexplainedSections.length > 0
}

// 解説を生成して保存（GPTが分析して最適なトピックを選択）
export async function generateAndSaveExplanation(): Promise<{
  sectionKey: string
  category: string
  title: string
} | null> {
  const sectionStats = await calculateSectionStats()
  const existingKeys = await getExplanationSectionKeys()

  // 未解説セクションがない場合
  const unexplainedSections = sectionStats.filter(
    section => !existingKeys.includes(section.sectionKey)
  )

  if (unexplainedSections.length === 0) {
    return null
  }

  // GPTに全データを送って分析・解説生成
  const result = await generateExplanationWithAnalysis(sectionStats, existingKeys)

  // GPTが選んだセクションの情報を取得
  const selectedSection = sectionStats.find(s => s.sectionKey === result.topic)
  const sectionTitle = selectedSection?.title || result.topic

  await addExplanation({
    sectionKey: result.topic,
    category: result.category,
    sectionTitle: sectionTitle,
    content: result.content,
    accuracy: selectedSection?.accuracy || 0,
  })

  return {
    sectionKey: result.topic,
    category: result.category,
    title: sectionTitle,
  }
}

import { getOpenAIApiKey } from './storage'
import { determineUserLevel, getLevelGuidelines } from './userLevel'
import type { UserLevel } from '@/types'

// 画像ベース問題の解説を生成
export async function generateImageBasedExplanation(
  problemText: string,
  answer?: string,
  imageBase64?: string
): Promise<string> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。')
  }

  // ユーザーレベルを判定
  const userLevel = await determineUserLevel()

  // プロンプトを構築
  const systemPrompt = buildSystemPrompt(userLevel)
  const userPrompt = buildUserPrompt(problemText, userLevel, answer, imageBase64)

  // メッセージコンテンツを構築
  const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: userPrompt,
    },
  ]

  // 画像がある場合は追加
  if (imageBase64) {
    messageContent.push({
      type: 'image_url',
      image_url: {
        url: imageBase64,
      },
    })
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
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: messageContent,
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
  return data.choices[0].message.content
}

// システムプロンプトを構築
function buildSystemPrompt(userLevel: UserLevel): string {
  const sectionStats = userLevel.weakSections.map(key => {
    const [category, ...titleParts] = key.split('-')
    return `  - ${category} > ${titleParts.join('-')}`
  }).join('\n')

  return `あなたは受験生の個別指導を行うAI講師です。
学習者のレベルや苦手分野を考慮し、最適化された解説を提供してください。

# 学習者のプロフィール
- **レベル**: ${getLevelLabel(userLevel.level)} (全体正解率: ${userLevel.overallAccuracy}%)
- **学習量**: ${getStudyVolumeLabel(userLevel.studyVolume)}
- **最近の傾向**: ${getTrendLabel(userLevel.recentTrend)}
${userLevel.weakSections.length > 0 ? `- **特に苦手な分野**:\n${sectionStats}` : ''}

# 解説レベルの調整指針

${getLevelGuidelines(userLevel.level)}

# 出力形式（Markdown）

必ず以下の構造で出力してください:

## ✅ この問題の答え
[問題の正解。答えが指定されている場合は必ずそれを記載してください]

## 🎯 この問題のポイント
[問題の本質、何を問われているか]

## 📝 解き方
[ステップバイステップの解法。レベルに応じた詳しさで]

### ステップ1: [見出し]
[説明]

### ステップ2: [見出し]
[説明]

...

## ⚠️ よくある間違い
[この問題で間違えやすいポイント、その理由]

## 💡 覚えておくべき公式・知識
[暗記すべき内容、公式、定理など]

## 🔗 関連する分野
[この問題が他のどの分野と関連するか。特に苦手分野との関連を強調]
${userLevel.weakSections.length > 0 ?
  `\n※ あなたが苦手としている分野との関連があれば、その点を特に詳しく説明してください。`
  : ''}

## 📚 学習アドバイス
[この問題を通じて、今後どのように学習を進めるべきか]`
}

// ユーザープロンプトを構築
function buildUserPrompt(
  problemText: string,
  userLevel: UserLevel,
  answer?: string,
  imageBase64?: string
): string {
  return `以下の問題について、上記の学習者プロフィールに基づいて最適化された解説を生成してください。

# 問題文
${problemText}

${answer ? `# この問題の答え\n${answer}\n\n**重要**: 上記の答えを前提として、解説を生成してください。解説の冒頭「## ✅ この問題の答え」セクションに必ずこの答えを記載してください。` : ''}

${imageBase64 ? `# 問題画像\n[画像が添付されています。問題文と合わせて確認してください]` : ''}

# 指示
- 学習者のレベル（${getLevelLabel(userLevel.level)}）に合わせた説明をしてください
- 学習者の苦手分野を考慮し、関連する知識を補足してください
${answer ? '- **この問題の答えは「' + answer + '」です。この答えを前提に解説を書いてください**' : '- 問題を解いて答えを導き出し、「## ✅ この問題の答え」セクションに記載してください'}
- 出力形式に従って、構造化されたMarkdownで解説を生成してください
- 数式がある場合はLaTeX記法（$...$）を使用してください`
}

// レベルのラベルを取得
function getLevelLabel(level: string): string {
  switch (level) {
    case 'beginner':
      return '初級'
    case 'intermediate':
      return '中級'
    case 'advanced':
      return '上級'
    default:
      return level
  }
}

// 学習量のラベルを取得
function getStudyVolumeLabel(volume: string): string {
  switch (volume) {
    case 'low':
      return '学習開始段階'
    case 'medium':
      return '中程度の学習量'
    case 'high':
      return '豊富な学習量'
    default:
      return volume
  }
}

// 傾向のラベルを取得
function getTrendLabel(trend?: string): string {
  if (!trend) return 'データ不足'

  switch (trend) {
    case 'improving':
      return '上昇傾向 📈'
    case 'stable':
      return '安定'
    case 'declining':
      return '要注意（下降傾向）⚠️'
    default:
      return trend
  }
}

// 問題文を編集して解説を再生成
export async function regenerateExplanation(
  editedText: string,
  userLevel: UserLevel,
  answer?: string,
  imageBase64?: string
): Promise<string> {
  // 既存のuserLevelを使用して再生成
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません。')
  }

  const systemPrompt = buildSystemPrompt(userLevel)
  const userPrompt = buildUserPrompt(editedText, userLevel, answer, imageBase64)

  const messageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: userPrompt,
    },
  ]

  if (imageBase64) {
    messageContent.push({
      type: 'image_url',
      image_url: {
        url: imageBase64,
      },
    })
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
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: messageContent,
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
  return data.choices[0].message.content
}

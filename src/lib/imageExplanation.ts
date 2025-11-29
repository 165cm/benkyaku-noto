import { getOpenAIApiKey } from './storage'
import { determineUserLevel, getLevelGuidelines } from './userLevel'
import type { UserLevel } from '@/types'

// 画像ベース問題の解説を生成
export async function generateImageBasedExplanation(
  problemText: string,
  answer?: string,
  imageBase64?: string,
  targetProblemNumber?: string
): Promise<{ explanation: string; suggestedQuestions: string[] }> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。')
  }

  // ユーザーレベルを判定
  const userLevel = await determineUserLevel()

  // プロンプトを構築
  const systemPrompt = buildSystemPrompt(userLevel)
  const userPrompt = buildUserPrompt(problemText, userLevel, answer, imageBase64, targetProblemNumber)

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
  const content = data.choices[0].message.content

  // 追加質問候補を抽出（最後のセクションから）
  const suggestedQuestions = extractSuggestedQuestions(content)

  return {
    explanation: content,
    suggestedQuestions,
  }
}

// 追加質問候補を抽出
function extractSuggestedQuestions(content: string): string[] {
  const match = content.match(/##\s*🙋\s*追加で質問できること[\s\S]*?(?=\n##|$)/i)
  if (!match) return []

  const section = match[0]
  const questions: string[] = []
  const lines = section.split('\n')

  for (const line of lines) {
    const questionMatch = line.match(/^\d+\.\s*(.+)$/)
    if (questionMatch) {
      questions.push(questionMatch[1].trim())
    }
  }

  return questions.slice(0, 4) // 最大4つ
}

// システムプロンプトを構築
function buildSystemPrompt(userLevel: UserLevel): string {
  const sectionStats = userLevel.weakSections.map(key => {
    const [category, ...titleParts] = key.split('-')
    return `  - ${category} > ${titleParts.join('-')}`
  }).join('\n')

  return `あなたは高校生に勉強を教える優しい先生です。
**重要な指針**：
- 高校生が読んで理解できる、やさしい日本語で書いてください
- 専門用語は極力避けてください（使う場合は初出時に必ず説明を（ ）で挿入）
- 初回の解説は**一息で読める短さ**にして、追加質問で詳しく答える形式にします
- **数式はLaTeX記法を使わず、普通の文字で書いてください**（例：$x$ではなく「x」、$\times$ではなく「×」）

# 生徒のプロフィール
- **レベル**: ${getLevelLabel(userLevel.level)} (正解率: ${userLevel.overallAccuracy}%)
- **学習量**: ${getStudyVolumeLabel(userLevel.studyVolume)}
- **最近の調子**: ${getTrendLabel(userLevel.recentTrend)}
${userLevel.weakSections.length > 0 ? `- **苦手な分野**:\n${sectionStats}` : ''}

# 解説の書き方

${getLevelGuidelines(userLevel.level)}

**文章のルール**：
1. 中学生でも分かる言葉を使う
2. 専門用語を使う場合は必ず説明を付ける
   例：「漸化式（前の項から次の項を求める式のこと）」
3. 一文は短く、読みやすく
4. 「〜である」より「〜です・ます」調で
5. **数式は普通の文字で書く**（LaTeX記法禁止！）
   良い例：「x × y = 10」「2の2乗 = 4」
   悪い例：「$x \times y = 10$」「$2^2 = 4$」

# 出力形式（Markdown）

必ず以下の構造で出力してください：

## ✅ この問題の答え
[シンプルに答えだけ。1行で]

## 🎯 10秒でわかるこの問題のポイント！
[2-3行で、何を問われているか、どう考えればいいかをサクッと]

## 📝 60秒で解き方を解説！
[ステップは2-3個まで。各ステップは2-3行で簡潔に]

### ステップ1: [見出し]
[2-3行の説明。数式は普通の文字で書く]

### ステップ2: [見出し]
[2-3行の説明。数式は普通の文字で書く]

## 🙋 追加で質問できること
以下の質問をクリックすると、詳しい解説が見られます：

1. [よくある間違いについて教えて]
2. [この問題で使う公式を詳しく知りたい]
3. [類似問題の解き方を教えて]
4. [もっと簡単な解き方はある？]

**注意**: 上記の質問例は必ず4つ挙げてください。ユーザーが追加で聞きたくなりそうな内容を考えてください。`
}

// ユーザープロンプトを構築
function buildUserPrompt(
  problemText: string,
  userLevel: UserLevel,
  answer?: string,
  imageBase64?: string,
  targetProblemNumber?: string
): string {
  return `以下の問題について、生徒が理解しやすい解説を作ってください。

# 問題文
${problemText}

${imageBase64 ? `# 問題画像\n[画像が添付されています。問題文と合わせて確認してください]` : ''}

${targetProblemNumber ? `# 解説対象の問題\n**重要**: 画像には複数の問題が含まれていますが、**問題「${targetProblemNumber}」についてのみ解説してください。**\n他の問題（例：1-1、1-2など）は前提として参照し、必要に応じて「〜という前提があるので」のように触れてください。\n\n` : ''}

${answer ? `# この問題の答え\n${answer}\n\n**重要**: 上記の答えを正解として、その答えになる理由を解説してください。\n` : ''}

# 指示
- 生徒のレベル: ${getLevelLabel(userLevel.level)}（正解率${userLevel.overallAccuracy}%）
- **簡潔に**: 初回の解説は一息で読める短さにしてください
- **やさしく**: 高校生が分かる言葉で書いてください
- **専門用語**: 使う場合は必ず（ ）で説明を付けてください
${answer ? '- 答え「' + answer + '」を前提に、その理由を説明してください' : '- 問題を解いて答えを導き、「## ✅ この問題の答え」に書いてください'}
- **追加質問**: 「## 🙋 追加で質問できること」セクションに、生徒が聞きたくなりそうな質問を4つ必ず挙げてください
- **数式**: LaTeX記法は使わず、普通の文字で書いてください（例：「x × y」「2の2乗」）`
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

// 追加質問に答える
export async function answerFollowUpQuestion(
  question: string,
  originalProblemText: string,
  originalExplanation: string,
  userLevel: UserLevel,
  imageBase64?: string
): Promise<string> {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    throw new Error('OpenAI APIキーが設定されていません。')
  }

  const systemPrompt = `あなたは高校生に勉強を教える優しい先生です。
以下の問題についての追加質問に答えてください。

**文章のルール**：
1. 高校生が分かる言葉を使う
2. 専門用語を使う場合は必ず説明を付ける
3. 一文は短く、読みやすく
4. 「〜です・ます」調で
5. **数式は普通の文字で書く**（LaTeX記法禁止！）

生徒のレベル: ${getLevelLabel(userLevel.level)}（正解率${userLevel.overallAccuracy}%）`

  const userPrompt = `# 元の問題
${originalProblemText}

# これまでの解説
${originalExplanation}

# 生徒からの追加質問
${question}

上記の質問に、分かりやすく答えてください。
- 簡潔に、ポイントを押さえて答えてください
- 具体例があると分かりやすいです
- **数式は普通の文字で書いてください**（例：「x × y」ではなく「x かける y」、$\\times$ではなく「×」）`

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
      max_tokens: 1500,
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

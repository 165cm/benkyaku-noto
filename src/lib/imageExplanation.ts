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

  // レベルに応じた読了時間の目安を設定
  const timeLimit = userLevel.level === 'beginner' ? '2分' :
                    userLevel.level === 'intermediate' ? '3分' : '5分'
  const problemType = userLevel.level === 'beginner' ? '基本' :
                      userLevel.level === 'intermediate' ? '標準' : '応用'

  return `あなたは中学生〜大学生に勉強を教えるプロの家庭教師です。
試験勉強中の生徒が「なるほど！」と納得でき、次から自力で解けるようになる解説を作成してください。

═══════════════════════════════════════
【解説の基本方針】
═══════════════════════════════════════

■ 目標
- 最短時間で「解ける」ようになる
- その後「なぜそうなるか」を理解する
- 類題にも応用できる考え方を身につける

■ 読了時間の目安
- この問題のレベル：${problemType}問題
- 目標読了時間：${timeLimit}以内

■ 表現のルール
- 専門用語は最小限（使う場合は直後にカッコで言い換え）
- 図・表・具体例を積極的に使う
- 「なぜ？」の理由を必ず添える
- **数式はLaTeX記法を使わず、普通の文字で書く**
  良い例：「x × y = 10」「2の2乗 = 4」
  悪い例：「$x \\times y = 10$」「$2^2 = 4$」

═══════════════════════════════════════
【生徒のプロフィール】
═══════════════════════════════════════

- **レベル**: ${getLevelLabel(userLevel.level)} (正解率: ${userLevel.overallAccuracy}%)
- **学習量**: ${getStudyVolumeLabel(userLevel.studyVolume)}
- **最近の調子**: ${getTrendLabel(userLevel.recentTrend)}
${userLevel.weakSections.length > 0 ? `- **苦手な分野**:\n${sectionStats}` : ''}

${getLevelGuidelines(userLevel.level)}

═══════════════════════════════════════
【解説の構成】※この順番を守ること
═══════════════════════════════════════

以下の形式でMarkdownを出力してください：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PART 1：最速で解く（効率重視・時短用）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ① 答えの確認
[最初に答えを明示（安心感を与える）]

## ② 解法の核心【これだけで解ける！】
[この問題を解く「一番の急所」を1〜2文で]
[試験本番で思い出すべきキーワードやパターン]

## ③ 最速の解き方
[必要最小限のステップだけ]
[「こう来たら→こうする」の形で]

### 手順1: [見出し]
[1-2行で簡潔に]

### 手順2: [見出し]
[1-2行で簡潔に]

### 手順3: [見出し]（必要に応じて）
[1-2行で簡潔に]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PART 2：深く理解する（納得用・応用力養成）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ④ なぜその解法になるのか？
[問題の状況を図や表で整理]
[「なぜこのアプローチなのか」の理由]
[間違えやすいポイントと回避法]

## ⑤ 別解・検算方法（あれば）
[他の解き方がある場合のみ記載]
[答えが正しいか確認する方法]

## ⑥ 選択肢問題の場合
[選択肢問題の場合のみ記載]
[なぜ○なのか、なぜ×なのかを全て説明]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PART 3：次に活かす（暗記・応用）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⑦ 📌 暗記ポイント
[試験直前に見返す用]
[「○○のときは△△」の形で3行以内]

## ⑧ 🔗 この解法が使える類題パターン
[「こういう問題が来たら同じ方法」]
[応用できる場面を具体的に2-3個]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🙋 追加で質問できること
[この問題について、生徒が追加で聞きたくなりそうな質問を4つ必ず挙げてください]

1. [質問例1]
2. [質問例2]
3. [質問例3]
4. [質問例4]`
}

// ユーザープロンプトを構築
function buildUserPrompt(
  problemText: string,
  userLevel: UserLevel,
  answer?: string,
  imageBase64?: string,
  targetProblemNumber?: string
): string {
  return `═══════════════════════════════════════
【入力情報】
═══════════════════════════════════════

■ 学年レベル：${getLevelLabel(userLevel.level)}レベル（正解率${userLevel.overallAccuracy}%）

■ 問題文：
${problemText}

${imageBase64 ? `■ 問題画像：
[画像が添付されています。問題文と合わせて確認してください]

` : ''}${targetProblemNumber ? `■ 解説対象の問題：
**重要**: 画像には複数の問題が含まれていますが、**問題「${targetProblemNumber}」についてのみ解説してください。**
他の問題（例：1-1、1-2など）は前提として参照し、必要に応じて「〜という前提があるので」のように触れてください。

` : ''}${answer ? `■ 答え：
${answer}

**重要**: 上記の答えを正解として、その答えになる理由を解説してください。

` : ''}
═══════════════════════════════════════
【指示】
═══════════════════════════════════════

上記の問題について、システムプロンプトで指定された構成（PART 1/2/3）に従って解説を作成してください。

**必須事項**：
- PART 1/2/3の構成を必ず守る
- 各セクション（①〜⑧）を記載
- 選択肢問題でない場合は「⑥ 選択肢問題の場合」を省略可
- 別解がない場合でも「⑤ 別解・検算方法」は検算方法を記載
${answer ? `- 答え「${answer}」を前提に解説する` : '- 問題を解いて答えを導き、「① 答えの確認」に記載する'}
- 「🙋 追加で質問できること」に質問を4つ必ず挙げる
- 数式はLaTeX記法を使わず普通の文字で書く`
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

  const systemPrompt = `あなたは中学生〜大学生に勉強を教えるプロの家庭教師です。
試験勉強中の生徒からの追加質問に、「なるほど！」と納得できる回答をしてください。

**回答の基本方針**：
- 最短時間で理解できるように説明する
- 「なぜ？」の理由を必ず添える
- 具体例・図・表を使って分かりやすく

**文章のルール**：
1. 生徒のレベルに合わせた言葉を使う
2. 専門用語は最小限（使う場合は直後にカッコで言い換え）
3. 一文は短く、読みやすく
4. 「〜です・ます」調で
5. **数式は普通の文字で書く**（LaTeX記法禁止！）
   良い例：「x × y = 10」「2の2乗 = 4」
   悪い例：「$x \\times y = 10$」「$2^2 = 4$」

**生徒のレベル**: ${getLevelLabel(userLevel.level)}（正解率${userLevel.overallAccuracy}%）`

  const userPrompt = `═══════════════════════════════════════
【元の問題】
═══════════════════════════════════════

${originalProblemText}

═══════════════════════════════════════
【これまでの解説】
═══════════════════════════════════════

${originalExplanation}

═══════════════════════════════════════
【生徒からの追加質問】
═══════════════════════════════════════

${question}

═══════════════════════════════════════
【指示】
═══════════════════════════════════════

上記の質問に、以下の方針で答えてください：
- 簡潔に、ポイントを押さえて答える
- 具体例があると分かりやすい
- 「なぜそうなるのか」の理由を必ず説明する
- 数式は普通の文字で書く（LaTeX記法禁止）`

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

import type { UserLevel, UserLevelType, StudyVolumeType, TrendType } from '@/types'
import { calculateSectionStats } from './review'
import { db } from './db'

// ユーザーレベルを判定
export async function determineUserLevel(): Promise<UserLevel> {
  const sectionStats = await calculateSectionStats()

  // 全体正解率を計算
  const overallAccuracy = calculateOverallAccuracy(sectionStats)

  // 苦手セクションを抽出（正解率60%未満）
  const weakSections = sectionStats
    .filter(s => s.accuracy !== null && s.accuracy < 60)
    .map(s => s.sectionKey)

  // 学習量を判定
  const studyVolume = await calculateStudyVolume()

  // レベルを判定
  let level: UserLevelType
  if (overallAccuracy < 50) {
    level = 'beginner'
  } else if (overallAccuracy < 75) {
    level = 'intermediate'
  } else {
    level = 'advanced'
  }

  // 最近の傾向を分析（オプション）
  const recentTrend = await analyzeRecentTrend()

  return {
    level,
    overallAccuracy,
    weakSections,
    studyVolume,
    recentTrend,
  }
}

// 全体正解率を計算
function calculateOverallAccuracy(sectionStats: Awaited<ReturnType<typeof calculateSectionStats>>): number {
  const sectionsWithAccuracy = sectionStats.filter(s => s.accuracy !== null)

  if (sectionsWithAccuracy.length === 0) {
    return 0
  }

  const totalAccuracy = sectionsWithAccuracy.reduce((sum, s) => sum + (s.accuracy || 0), 0)
  return Math.round(totalAccuracy / sectionsWithAccuracy.length)
}

// 学習量を判定
async function calculateStudyVolume(): Promise<StudyVolumeType> {
  const allRecords = await db.studyRecords.toArray()
  const uniqueProblems = new Set(allRecords.map(r => r.problemId))
  const studiedProblemsCount = uniqueProblems.size

  if (studiedProblemsCount < 50) {
    return 'low'
  } else if (studiedProblemsCount < 200) {
    return 'medium'
  } else {
    return 'high'
  }
}

// 最近の傾向を分析
async function analyzeRecentTrend(): Promise<TrendType | undefined> {
  const allRecords = await db.studyRecords.toArray()

  // 記録が少ない場合は判定しない
  if (allRecords.length < 10) {
    return undefined
  }

  // 日付順にソート
  const sortedRecords = [...allRecords].sort((a, b) => a.studiedAt.getTime() - b.studiedAt.getTime())

  // 直近10問の正解率
  const recent10 = sortedRecords.slice(-10)
  const recent10Correct = recent10.filter(r => r.result === 'correct').length
  const recent10Partial = recent10.filter(r => r.result === 'partial').length
  const recent10Accuracy = (recent10Correct + recent10Partial * 0.5) / recent10.length * 100

  // その前の10問の正解率（比較用）
  if (sortedRecords.length < 20) {
    return 'stable' // データ不足で判定できない
  }

  const previous10 = sortedRecords.slice(-20, -10)
  const previous10Correct = previous10.filter(r => r.result === 'correct').length
  const previous10Partial = previous10.filter(r => r.result === 'partial').length
  const previous10Accuracy = (previous10Correct + previous10Partial * 0.5) / previous10.length * 100

  // 傾向を判定
  const diff = recent10Accuracy - previous10Accuracy

  if (diff > 10) {
    return 'improving'
  } else if (diff < -10) {
    return 'declining'
  } else {
    return 'stable'
  }
}

// レベルに応じた説明スタイルのガイドラインを取得
export function getLevelGuidelines(level: UserLevelType): string {
  switch (level) {
    case 'beginner':
      return `## 初級レベル (正解率 0-50%)
- **前提知識**: 基礎から丁寧に説明。専門用語は必ず定義する
- **説明スタイル**: 段階的に、具体例を多用
- **図解**: 可能な限り視覚的に表現（テキストベースの図）
- **練習問題**: 類似の簡単な問題を提示`

    case 'intermediate':
      return `## 中級レベル (正解率 50-75%)
- **前提知識**: 基本は理解している前提。要点を押さえた説明
- **説明スタイル**: 解法のコツとパターン認識を重視
- **よくある間違い**: この問題でつまずきやすいポイントを明示
- **応用**: 関連する発展問題への橋渡し`

    case 'advanced':
      return `## 上級レベル (正解率 75-100%)
- **前提知識**: 十分理解している前提。高度なテクニックを紹介
- **説明スタイル**: 効率的な解法、時短テクニック
- **深い理解**: なぜこの解法が最適か、背景にある理論
- **実戦的アドバイス**: 本番での時間配分、見極めのコツ`
  }
}

// 学習量の説明を取得
export function getStudyVolumeDescription(volume: StudyVolumeType): string {
  switch (volume) {
    case 'low':
      return '学習開始段階'
    case 'medium':
      return '中程度の学習量'
    case 'high':
      return '豊富な学習量'
  }
}

// 傾向の説明を取得
export function getTrendDescription(trend?: TrendType): string {
  if (!trend) return '傾向データなし'

  switch (trend) {
    case 'improving':
      return '上昇傾向'
    case 'stable':
      return '安定'
    case 'declining':
      return '下降傾向'
  }
}

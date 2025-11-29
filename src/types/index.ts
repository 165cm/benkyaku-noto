// 問題集
export interface Workbook {
  id: string
  title: string
  subject: string
  totalProblems: number
  pdfUrl?: string // Firebase StorageのPDF URL
  pdfFileName?: string // PDFファイル名
  createdAt: Date
  updatedAt: Date
}

// 問題
export interface Problem {
  id: string
  workbookId: string
  problemNumber: string // "1", "2", "1-1" など（純粋な連番）
  sectionTitle?: string // セクション名（例: "推論【内訳】"）
  sortOrder: number // 並び替え用（システムが自動管理）
  category?: string // 親カテゴリ（例: "SPI3（非言語）"）
  parentProblemId?: string // 親問題のID（小問の場合）
  page?: number // ページ数
  memo?: string
  isBookmarked?: boolean // ブックマーク（苦手な問題マーク）
  tags?: string[] // タグ（例: ["要復習", "時間がかかる"]）
  createdAt: Date
  deletedAt?: Date // 論理削除用
}

// 学習記録
export type StudyResult = 'correct' | 'partial' | 'incorrect' // ◯/△/×

export interface StudyRecord {
  id: string
  problemId: string
  workbookId: string
  result: StudyResult
  studyTime: number // 秒単位
  studiedAt: Date
  memo?: string
}

// 復習スケジュール
export interface ReviewSchedule {
  problemId: string
  problemNumber: string
  sectionTitle?: string
  category?: string
  workbookTitle: string
  nextReviewDate: Date
  reviewCount: number
  averageScore: number
  lastStudiedAt: Date
  priorityScore: number
}

// 学習統計
export interface StudyStats {
  totalStudyTime: number
  todayStudyTime: number
  weekStudyTime: number
  totalProblemsSolved: number
  correctRate: number
  weeklyData: {
    date: string
    studyTime: number
    problemsSolved: number
    accuracy?: number | null
  }[]
}

// AI生成解説
export interface Explanation {
  id: string
  sectionKey: string // "カテゴリ-セクション名"
  category: string
  sectionTitle: string
  content: string // マークダウン形式の解説
  accuracy: number // 生成時の正答率
  createdAt: Date
}

// ユーザーレベル
export type UserLevelType = 'beginner' | 'intermediate' | 'advanced'
export type StudyVolumeType = 'low' | 'medium' | 'high'
export type TrendType = 'improving' | 'stable' | 'declining'

export interface UserLevel {
  level: UserLevelType
  overallAccuracy: number
  weakSections: string[] // セクションキーの配列
  studyVolume: StudyVolumeType
  recentTrend?: TrendType
}

// 画像ベースのAI解説
export interface ImageBasedExplanation {
  id: string

  // 画像情報
  imageUrl: string // アップロード画像のURL（Data URL）

  // 問題文（OCRで抽出、編集可能）
  extractedText: string // OCRで抽出した問題文
  editedText?: string // ユーザーが編集した問題文
  answer?: string // 問題の答え（ユーザーが入力）
  targetProblemNumber?: string // 解説対象の問題番号（例：1-3、問題3など）

  // 解説内容
  explanationContent: string // マークダウン形式の解説
  suggestedQuestions?: string[] // AIが提案する追加質問（4択）
  followUpExplanations?: { question: string; answer: string }[] // 追加の解説履歴

  // ユーザーレベル情報（生成時点）
  userLevel: UserLevel

  // 問題分類（オプション）
  category?: string
  sectionTitle?: string
  tags?: string[]

  // 関連付け（オプション）
  problemId?: string // 既存の問題に紐付ける場合
  workbookId?: string // 既存の問題集に紐付ける場合

  // メタデータ
  generatedAt: Date // 初回生成日時
  updatedAt?: Date // 再生成日時
  regenerationCount: number // 再生成回数

  createdAt: Date
  deletedAt?: Date // 論理削除
}

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

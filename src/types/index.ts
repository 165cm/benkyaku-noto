// 問題集
export interface Workbook {
  id: string
  title: string
  subject: string
  totalProblems: number
  createdAt: Date
  updatedAt: Date
}

// 問題
export interface Problem {
  id: string
  workbookId: string
  problemNumber: string // "1-5" など
  memo?: string
  createdAt: Date
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
  }[]
}

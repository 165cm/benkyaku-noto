import { db } from './db'
import type { Problem, Workbook } from '@/types'

/**
 * バリデーションエラークラス
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * 問題のバリデーション
 */
export async function validateProblem(
  problem: Partial<Problem>,
  isUpdate = false
): Promise<void> {
  // 必須フィールドのチェック
  if (!problem.workbookId) {
    throw new ValidationError('問題集IDが必要です')
  }

  if (!problem.problemNumber || problem.problemNumber.trim() === '') {
    throw new ValidationError('問題番号が必要です')
  }

  // 問題集の存在チェック
  const workbook = await db.workbooks.get(problem.workbookId)
  if (!workbook) {
    throw new ValidationError('指定された問題集が存在しません')
  }

  // 親問題の存在チェックと整合性チェック
  if (problem.parentProblemId) {
    const parent = await db.problems.get(problem.parentProblemId)
    if (!parent) {
      throw new ValidationError('親問題が見つかりません')
    }

    if (parent.workbookId !== problem.workbookId) {
      throw new ValidationError('親問題は同じ問題集に属している必要があります')
    }

    if (parent.deletedAt) {
      throw new ValidationError('削除された問題を親問題にすることはできません')
    }

    // 循環参照チェック
    if (problem.id) {
      await checkCircularReference(problem.id, problem.parentProblemId)
    }
  }

  // ページ番号のチェック
  if (problem.page !== undefined && problem.page !== null) {
    if (problem.page < 1) {
      throw new ValidationError('ページ番号は1以上である必要があります')
    }
    if (!Number.isInteger(problem.page)) {
      throw new ValidationError('ページ番号は整数である必要があります')
    }
  }

  // sortOrderのチェック
  if (problem.sortOrder !== undefined && problem.sortOrder !== null) {
    if (problem.sortOrder < 0) {
      throw new ValidationError('並び順は0以上である必要があります')
    }
    if (!Number.isInteger(problem.sortOrder)) {
      throw new ValidationError('並び順は整数である必要があります')
    }
  }
}

/**
 * 循環参照チェック
 */
async function checkCircularReference(
  problemId: string,
  parentProblemId: string
): Promise<void> {
  const visited = new Set<string>()
  let currentId: string | undefined = parentProblemId

  while (currentId) {
    if (currentId === problemId) {
      throw new ValidationError('循環参照が検出されました')
    }

    if (visited.has(currentId)) {
      throw new ValidationError('親問題の階層に循環参照が存在します')
    }

    visited.add(currentId)

    const parent = await db.problems.get(currentId)
    currentId = parent?.parentProblemId
  }
}

/**
 * 問題集のバリデーション
 */
export async function validateWorkbook(
  workbook: Partial<Workbook>,
  isUpdate = false
): Promise<void> {
  // 必須フィールドのチェック
  if (!workbook.title || workbook.title.trim() === '') {
    throw new ValidationError('問題集のタイトルが必要です')
  }

  if (!workbook.subject || workbook.subject.trim() === '') {
    throw new ValidationError('科目が必要です')
  }

  // タイトルの長さチェック
  if (workbook.title.length > 200) {
    throw new ValidationError('タイトルは200文字以内である必要があります')
  }

  if (workbook.subject.length > 100) {
    throw new ValidationError('科目は100文字以内である必要があります')
  }
}

/**
 * 学習記録のバリデーション
 */
export async function validateStudyRecord(record: {
  problemId: string
  workbookId: string
  result: 'correct' | 'partial' | 'incorrect'
  studyTime: number
}): Promise<void> {
  // 問題の存在チェック
  const problem = await db.problems.get(record.problemId)
  if (!problem) {
    throw new ValidationError('指定された問題が存在しません')
  }

  if (problem.deletedAt) {
    throw new ValidationError('削除された問題に学習記録を追加できません')
  }

  // 問題集の存在チェック
  const workbook = await db.workbooks.get(record.workbookId)
  if (!workbook) {
    throw new ValidationError('指定された問題集が存在しません')
  }

  // 学習時間のチェック
  if (record.studyTime < 0) {
    throw new ValidationError('学習時間は0以上である必要があります')
  }

  if (!Number.isInteger(record.studyTime)) {
    throw new ValidationError('学習時間は整数である必要があります')
  }

  // 学習時間の上限チェック（24時間以上は異常とみなす）
  if (record.studyTime > 86400) {
    throw new ValidationError('学習時間が異常です（24時間を超えています）')
  }
}

/**
 * CSVインポートデータのバリデーション
 */
export function validateCSVData(data: any[]): void {
  if (!Array.isArray(data)) {
    throw new ValidationError('CSVデータの形式が不正です')
  }

  if (data.length === 0) {
    throw new ValidationError('CSVファイルにデータが含まれていません')
  }

  if (data.length > 10000) {
    throw new ValidationError('一度にインポートできる問題数は10,000件までです')
  }

  // 各行のバリデーション
  data.forEach((row, index) => {
    if (!row.problemNumber || row.problemNumber.trim() === '') {
      throw new ValidationError(`${index + 1}行目: 問題番号が必要です`)
    }

    if (row.problemNumber.length > 500) {
      throw new ValidationError(`${index + 1}行目: 問題番号が長すぎます（500文字以内）`)
    }

    if (row.category && row.category.length > 200) {
      throw new ValidationError(`${index + 1}行目: カテゴリが長すぎます（200文字以内）`)
    }

    if (row.memo && row.memo.length > 5000) {
      throw new ValidationError(`${index + 1}行目: メモが長すぎます（5,000文字以内）`)
    }

    if (row.page !== undefined && row.page !== null) {
      if (row.page < 1 || row.page > 99999) {
        throw new ValidationError(`${index + 1}行目: ページ番号は1〜99999の範囲である必要があります`)
      }
    }
  })
}

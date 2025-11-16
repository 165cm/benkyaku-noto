import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Workbook, Problem, StudyRecord } from '@/types'

export class BenkyakuDB extends Dexie {
  workbooks!: Table<Workbook>
  problems!: Table<Problem>
  studyRecords!: Table<StudyRecord>

  constructor() {
    super('BenkyakuNoto')

    this.version(1).stores({
      workbooks: 'id, title, subject, createdAt',
      problems: 'id, workbookId, problemNumber, createdAt',
      studyRecords: 'id, problemId, workbookId, studiedAt',
    })

    // 論理削除用のdeletedAtフィールドを追加
    this.version(2).stores({
      workbooks: 'id, title, subject, createdAt',
      problems: 'id, workbookId, problemNumber, createdAt, deletedAt',
      studyRecords: 'id, problemId, workbookId, studiedAt',
    })

    // 親子関係用のparentProblemIdフィールドを追加
    this.version(3).stores({
      workbooks: 'id, title, subject, createdAt',
      problems: 'id, workbookId, problemNumber, createdAt, deletedAt, parentProblemId',
      studyRecords: 'id, problemId, workbookId, studiedAt',
    })
  }
}

export const db = new BenkyakuDB()

// ユーティリティ関数
export async function addWorkbook(workbook: Omit<Workbook, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = crypto.randomUUID()
  const now = new Date()

  await db.workbooks.add({
    ...workbook,
    id,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

export async function addProblem(problem: Omit<Problem, 'id' | 'createdAt'>) {
  const id = crypto.randomUUID()

  await db.problems.add({
    ...problem,
    id,
    createdAt: new Date(),
  })

  return id
}

export async function addStudyRecord(record: Omit<StudyRecord, 'id' | 'studiedAt'>) {
  const id = crypto.randomUUID()

  await db.studyRecords.add({
    ...record,
    id,
    studiedAt: new Date(),
  })

  return id
}

export async function getWorkbooks() {
  return await db.workbooks.orderBy('createdAt').reverse().toArray()
}

export async function getWorkbook(id: string) {
  return await db.workbooks.get(id)
}

export async function getProblems(workbookId: string) {
  const problems = await db.problems
    .where('workbookId')
    .equals(workbookId)
    .toArray()

  // 削除されていない問題のみを返す
  return problems
    .filter(p => !p.deletedAt)
    .sort((a, b) => a.problemNumber.localeCompare(b.problemNumber))
}

export async function getProblem(id: string) {
  return await db.problems.get(id)
}

// ゴミ箱の問題を取得（削除済みの問題）
export async function getDeletedProblems(workbookId?: string) {
  let problems = await db.problems.toArray()

  // 削除された問題のみをフィルタ
  problems = problems.filter(p => p.deletedAt)

  // 特定の問題集でフィルタ
  if (workbookId) {
    problems = problems.filter(p => p.workbookId === workbookId)
  }

  // 削除日時の新しい順にソート
  return problems.sort((a, b) => {
    if (!a.deletedAt || !b.deletedAt) return 0
    return b.deletedAt.getTime() - a.deletedAt.getTime()
  })
}

export async function getStudyRecords(problemId: string) {
  return await db.studyRecords
    .where('problemId')
    .equals(problemId)
    .reverse()
    .sortBy('studiedAt')
}

// 問題の正答率を計算
export async function calculateAccuracyForProblem(problemId: string): Promise<number | null> {
  const records = await db.studyRecords
    .where('problemId')
    .equals(problemId)
    .toArray()

  if (records.length === 0) return null

  const correctCount = records.filter(r => r.result === 'correct').length
  const partialCount = records.filter(r => r.result === 'partial').length

  // 正解を1点、部分正解を0.5点として計算
  const totalScore = correctCount + (partialCount * 0.5)
  const accuracy = (totalScore / records.length) * 100

  return Math.round(accuracy)
}

export async function deleteWorkbook(id: string) {
  // 問題集に紐づく問題と学習記録も削除
  const problems = await db.problems.where('workbookId').equals(id).toArray()
  const problemIds = problems.map(p => p.id)

  await db.studyRecords.where('problemId').anyOf(problemIds).delete()
  await db.problems.where('workbookId').equals(id).delete()
  await db.workbooks.delete(id)
}

export async function deleteProblem(id: string) {
  // 論理削除（ゴミ箱に移動）
  await db.problems.update(id, { deletedAt: new Date() })
}

// 問題を復元（ゴミ箱から戻す）
export async function restoreProblem(id: string) {
  await db.problems.update(id, { deletedAt: undefined })
}

// 問題を完全削除（ゴミ箱から削除）
export async function permanentlyDeleteProblem(id: string) {
  await db.studyRecords.where('problemId').equals(id).delete()
  await db.problems.delete(id)
}

export async function updateStudyRecord(
  id: string,
  updates: Partial<Pick<StudyRecord, 'result' | 'studyTime' | 'memo'>>
) {
  await db.studyRecords.update(id, updates)
}

export async function deleteStudyRecord(id: string) {
  await db.studyRecords.delete(id)
}

// 問題を親問題の小問にする（親問題を箱として扱う）
export async function makeSubProblem(problemId: string, parentProblemId: string) {
  const parentProblem = await db.problems.get(parentProblemId)
  const draggedProblem = await db.problems.get(problemId)

  if (!parentProblem || !draggedProblem) return

  // 既存の小問を取得
  const existingSubProblems = await getSubProblems(parentProblemId)

  if (existingSubProblems.length === 0) {
    // 親問題に初めて小問を追加する場合
    // 1. 親問題のデータを「親-1」という新しい小問として作成
    const parentAsSubProblemId = crypto.randomUUID()
    await db.problems.add({
      id: parentAsSubProblemId,
      workbookId: parentProblem.workbookId,
      problemNumber: `${parentProblem.problemNumber}-1`,
      category: parentProblem.category,
      page: parentProblem.page,
      memo: parentProblem.memo,
      parentProblemId: parentProblemId,
      createdAt: new Date(),
    })

    // 親問題の学習記録を新しい小問に移動
    const parentStudyRecords = await db.studyRecords
      .where('problemId')
      .equals(parentProblemId)
      .toArray()

    for (const record of parentStudyRecords) {
      await db.studyRecords.update(record.id, {
        problemId: parentAsSubProblemId,
      })
    }

    // 2. ドラッグされた問題を「親-2」として設定
    await db.problems.update(problemId, {
      problemNumber: `${parentProblem.problemNumber}-2`,
      parentProblemId: parentProblemId,
      category: parentProblem.category,
      page: parentProblem.page,
    })

    // 3. 親問題のメモをクリア（箱としてのみ機能させる）
    await db.problems.update(parentProblemId, {
      memo: undefined,
    })
  } else {
    // 既に小問がある場合は、次の番号を割り当てる
    const maxSubNumber = Math.max(
      ...existingSubProblems.map(p => {
        const parts = p.problemNumber.split('-')
        return parseInt(parts[parts.length - 1]) || 0
      })
    )

    await db.problems.update(problemId, {
      problemNumber: `${parentProblem.problemNumber}-${maxSubNumber + 1}`,
      parentProblemId: parentProblemId,
      category: parentProblem.category,
      page: parentProblem.page,
    })
  }
}

// 小問を独立した問題にする
export async function makeIndependentProblem(problemId: string) {
  await db.problems.update(problemId, { parentProblemId: undefined })
}

// 親問題の小問を取得
export async function getSubProblems(parentProblemId: string) {
  const problems = await db.problems
    .where('parentProblemId')
    .equals(parentProblemId)
    .toArray()

  // 削除されていない問題のみを返す
  return problems
    .filter(p => !p.deletedAt)
    .sort((a, b) => a.problemNumber.localeCompare(b.problemNumber))
}

// 問題集内の既存カテゴリを取得
export async function getCategoriesForWorkbook(workbookId: string): Promise<string[]> {
  const problems = await getProblems(workbookId)
  const categories = new Set<string>()

  problems.forEach(p => {
    if (p.category) {
      categories.add(p.category)
    }
  })

  return Array.from(categories).sort()
}

// 問題が親問題（箱）かどうかを判定
export async function isParentProblem(problemId: string): Promise<boolean> {
  const subProblems = await getSubProblems(problemId)
  return subProblems.length > 0
}

// 学習可能な問題のみを取得（親問題を除外）
export async function getLearnableProblems(workbookId: string): Promise<Problem[]> {
  const allProblems = await getProblems(workbookId)
  const learnableProblems: Problem[] = []

  for (const problem of allProblems) {
    const hasSubProblems = await isParentProblem(problem.id)
    if (!hasSubProblems) {
      learnableProblems.push(problem)
    }
  }

  return learnableProblems
}

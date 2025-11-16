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

// 問題を親問題の小問にする
export async function makeSubProblem(problemId: string, parentProblemId: string) {
  await db.problems.update(problemId, { parentProblemId })
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

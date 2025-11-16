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
  return await db.problems
    .where('workbookId')
    .equals(workbookId)
    .sortBy('problemNumber')
}

export async function getProblem(id: string) {
  return await db.problems.get(id)
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
  await db.studyRecords.where('problemId').equals(id).delete()
  await db.problems.delete(id)
}

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Workbook, Problem, StudyRecord } from '@/types'
import { validateProblem, validateWorkbook, validateStudyRecord } from './validation'

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

    // sortOrderフィールドを追加（並び替え用）
    this.version(4).stores({
      workbooks: 'id, title, subject, createdAt',
      problems: 'id, workbookId, problemNumber, sortOrder, createdAt, deletedAt, parentProblemId',
      studyRecords: 'id, problemId, workbookId, studiedAt',
    }).upgrade(async (tx) => {
      // 既存の問題にsortOrderを割り当て
      // 作成日時順に番号を振る
      const problems = await tx.table('problems').toArray()

      // workbookId ごとにグループ化してソート
      const problemsByWorkbook = new Map<string, any[]>()

      problems.forEach((problem) => {
        if (!problemsByWorkbook.has(problem.workbookId)) {
          problemsByWorkbook.set(problem.workbookId, [])
        }
        problemsByWorkbook.get(problem.workbookId)!.push(problem)
      })

      // 各問題集ごとにsortOrderを割り当て
      for (const [, workbookProblems] of problemsByWorkbook) {
        // 作成日時順にソート
        workbookProblems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

        // sortOrderを割り当て
        for (let i = 0; i < workbookProblems.length; i++) {
          await tx.table('problems').update(workbookProblems[i].id, {
            sortOrder: (i + 1) * 100, // 100刻みで割り当て（間に挿入できるようにする）
          })
        }
      }
    })
  }
}

export const db = new BenkyakuDB()

// ユーティリティ関数
export async function addWorkbook(workbook: Omit<Workbook, 'id' | 'createdAt' | 'updatedAt'>) {
  // バリデーション
  await validateWorkbook(workbook)

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

export async function addProblem(problem: Omit<Problem, 'id' | 'createdAt' | 'sortOrder'>) {
  // バリデーション
  await validateProblem(problem)

  const id = crypto.randomUUID()

  // sortOrderを自動計算：同じworkbookId内の最大値 + 100
  const existingProblems = await db.problems
    .where('workbookId')
    .equals(problem.workbookId)
    .toArray()

  const maxSortOrder = existingProblems.length > 0
    ? Math.max(...existingProblems.map(p => p.sortOrder || 0))
    : 0

  const sortOrder = maxSortOrder + 100

  await db.problems.add({
    ...problem,
    id,
    sortOrder,
    createdAt: new Date(),
  })

  return id
}

export async function addStudyRecord(record: Omit<StudyRecord, 'id' | 'studiedAt'>) {
  // バリデーション
  await validateStudyRecord(record)

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
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) // sortOrder順に並べる
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

// 問題番号を階層構造に基づいて再計算する
export async function recalculateProblemNumbers(workbookId: string) {
  return await db.transaction('rw', db.problems, async () => {
    // 削除されていない問題を取得
    const allProblems = await db.problems
      .where('workbookId')
      .equals(workbookId)
      .toArray()

    const activeProblems = allProblems.filter(p => !p.deletedAt)

    // 親問題（parentProblemIdがない問題）を取得してsortOrder順にソート
    const parentProblems = activeProblems
      .filter(p => !p.parentProblemId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

    // 小問をparentProblemIdでグループ化
    const subProblemsMap = new Map<string, typeof activeProblems>()
    for (const problem of activeProblems) {
      if (problem.parentProblemId) {
        if (!subProblemsMap.has(problem.parentProblemId)) {
          subProblemsMap.set(problem.parentProblemId, [])
        }
        subProblemsMap.get(problem.parentProblemId)!.push(problem)
      }
    }

    // 親問題に番号を割り当て
    let parentNumber = 1
    let baseSortOrder = 100

    for (const parent of parentProblems) {
      const subProblems = subProblemsMap.get(parent.id) || []

      if (subProblems.length > 0) {
        // 小問がある場合、親は箱として番号のみ
        await db.problems.update(parent.id, {
          problemNumber: String(parentNumber),
          sortOrder: baseSortOrder,
        })
        baseSortOrder += 10

        // 小問をsortOrder順にソートして番号を割り当て
        subProblems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        let subNumber = 1
        for (const sub of subProblems) {
          await db.problems.update(sub.id, {
            problemNumber: `${parentNumber}-${subNumber}`,
            sortOrder: baseSortOrder,
          })
          baseSortOrder += 10
          subNumber++
        }
      } else {
        // 小問がない通常の問題
        await db.problems.update(parent.id, {
          problemNumber: String(parentNumber),
          sortOrder: baseSortOrder,
        })
        baseSortOrder += 100
      }

      parentNumber++
    }
  })
}

// 問題を親問題の小問にする（親問題を箱として扱う）
export async function makeSubProblem(problemId: string, parentProblemId: string) {
  // トランザクションで安全に実行
  const draggedProblem = await db.problems.get(problemId)
  if (!draggedProblem) {
    throw new Error('問題が見つかりません')
  }
  const workbookId = draggedProblem.workbookId

  await db.transaction('rw', db.problems, db.studyRecords, async () => {
    const parentProblem = await db.problems.get(parentProblemId)
    const currentDraggedProblem = await db.problems.get(problemId)

    if (!parentProblem || !currentDraggedProblem) {
      throw new Error('問題が見つかりません')
    }

    // バリデーション
    if (currentDraggedProblem.workbookId !== parentProblem.workbookId) {
      throw new Error('異なる問題集の問題は関連付けできません')
    }

    if (problemId === parentProblemId) {
      throw new Error('問題を自分自身の小問にすることはできません')
    }

    if (parentProblem.deletedAt || currentDraggedProblem.deletedAt) {
      throw new Error('削除された問題を操作することはできません')
    }

    // 既存の小問を取得
    const existingSubProblems = await getSubProblems(parentProblemId)

    // sortOrderを計算（親問題の直後に配置）
    const parentSortOrder = parentProblem.sortOrder || 0
    const baseSortOrder = parentSortOrder + 10 // 親問題の10後に配置

    if (existingSubProblems.length === 0) {
      // 親問題に初めて小問を追加する場合
      // 1. 親問題のデータを「親-1」という新しい小問として作成
      const parentAsSubProblemId = crypto.randomUUID()
      await db.problems.add({
        id: parentAsSubProblemId,
        workbookId: parentProblem.workbookId,
        problemNumber: `${parentProblem.problemNumber}-1`,
        sortOrder: baseSortOrder,
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
        sortOrder: baseSortOrder + 1,
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

      const maxSubSortOrder = Math.max(...existingSubProblems.map(p => p.sortOrder || 0))

      await db.problems.update(problemId, {
        problemNumber: `${parentProblem.problemNumber}-${maxSubNumber + 1}`,
        sortOrder: maxSubSortOrder + 1,
        parentProblemId: parentProblemId,
        category: parentProblem.category,
        page: parentProblem.page,
      })
    }
  })

  // 問題番号を再計算
  await recalculateProblemNumbers(workbookId)
}

// 小問を独立した問題にする
export async function makeIndependentProblem(problemId: string) {
  const problem = await db.problems.get(problemId)
  if (!problem) return

  await db.problems.update(problemId, { parentProblemId: undefined })

  // 問題番号を再計算
  await recalculateProblemNumbers(problem.workbookId)
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
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) // sortOrder順に並べる
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

// 問題集の学習記録を全て削除（リセット）
export async function deleteStudyRecordsForWorkbook(workbookId: string) {
  await db.studyRecords.where('workbookId').equals(workbookId).delete()
}

// ゴミ箱を空にする（全ての削除済み問題を完全削除）
export async function emptyTrash() {
  const deletedProblems = await getDeletedProblems()

  for (const problem of deletedProblems) {
    await permanentlyDeleteProblem(problem.id)
  }
}

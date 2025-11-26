import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore'
import { db as firestore } from './firebase'
import type { Workbook, Problem, StudyRecord, Explanation } from '@/types'

// Firestore用の型定義（Dateをserverのタイムスタンプに変換）
type FirestoreWorkbook = Omit<Workbook, 'createdAt' | 'updatedAt'> & {
  createdAt: Timestamp
  updatedAt: Timestamp
}

type FirestoreProblem = Omit<Problem, 'createdAt' | 'deletedAt'> & {
  createdAt: Timestamp
  deletedAt?: Timestamp
}

type FirestoreStudyRecord = Omit<StudyRecord, 'studiedAt'> & {
  studiedAt: Timestamp
}

type FirestoreExplanation = Omit<Explanation, 'createdAt'> & {
  createdAt: Timestamp
}

// ユーザーのルートコレクションパスを取得
function getUserPath(userId: string) {
  return `users/${userId}`
}

// Date <-> Timestamp変換ヘルパー
function dateToTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

function timestampToDate(timestamp: Timestamp): Date {
  return timestamp.toDate()
}

// ================== Workbooks ==================

export async function syncWorkbookToFirestore(userId: string, workbook: Workbook) {
  const workbookRef = doc(firestore, `${getUserPath(userId)}/workbooks/${workbook.id}`)

  const firestoreWorkbook: FirestoreWorkbook = {
    ...workbook,
    createdAt: dateToTimestamp(workbook.createdAt),
    updatedAt: dateToTimestamp(workbook.updatedAt)
  }

  await setDoc(workbookRef, firestoreWorkbook, { merge: true })
}

export async function getWorkbooksFromFirestore(userId: string): Promise<Workbook[]> {
  const workbooksRef = collection(firestore, `${getUserPath(userId)}/workbooks`)
  const snapshot = await getDocs(workbooksRef)

  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreWorkbook
    return {
      ...data,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt)
    }
  })
}

export async function deleteWorkbookFromFirestore(userId: string, workbookId: string) {
  const workbookRef = doc(firestore, `${getUserPath(userId)}/workbooks/${workbookId}`)
  await deleteDoc(workbookRef)
}

// ================== Problems ==================

export async function syncProblemToFirestore(userId: string, problem: Problem) {
  const problemRef = doc(firestore, `${getUserPath(userId)}/problems/${problem.id}`)

  const firestoreProblem: FirestoreProblem = {
    ...problem,
    createdAt: dateToTimestamp(problem.createdAt),
    deletedAt: problem.deletedAt ? dateToTimestamp(problem.deletedAt) : undefined
  }

  await setDoc(problemRef, firestoreProblem, { merge: true })
}

export async function getProblemsFromFirestore(userId: string, workbookId?: string): Promise<Problem[]> {
  const problemsRef = collection(firestore, `${getUserPath(userId)}/problems`)

  let q = query(problemsRef)
  if (workbookId) {
    q = query(problemsRef, where('workbookId', '==', workbookId))
  }

  const snapshot = await getDocs(q)

  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreProblem
    return {
      ...data,
      createdAt: timestampToDate(data.createdAt),
      deletedAt: data.deletedAt ? timestampToDate(data.deletedAt) : undefined
    }
  })
}

export async function deleteProblemFromFirestore(userId: string, problemId: string) {
  const problemRef = doc(firestore, `${getUserPath(userId)}/problems/${problemId}`)
  await deleteDoc(problemRef)
}

// ================== StudyRecords ==================

export async function syncStudyRecordToFirestore(userId: string, record: StudyRecord) {
  const recordRef = doc(firestore, `${getUserPath(userId)}/studyRecords/${record.id}`)

  const firestoreRecord: FirestoreStudyRecord = {
    ...record,
    studiedAt: dateToTimestamp(record.studiedAt)
  }

  await setDoc(recordRef, firestoreRecord, { merge: true })
}

export async function getStudyRecordsFromFirestore(userId: string, problemId?: string): Promise<StudyRecord[]> {
  const recordsRef = collection(firestore, `${getUserPath(userId)}/studyRecords`)

  let q = query(recordsRef, orderBy('studiedAt', 'desc'))
  if (problemId) {
    q = query(recordsRef, where('problemId', '==', problemId), orderBy('studiedAt', 'desc'))
  }

  const snapshot = await getDocs(q)

  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreStudyRecord
    return {
      ...data,
      studiedAt: timestampToDate(data.studiedAt)
    }
  })
}

export async function deleteStudyRecordFromFirestore(userId: string, recordId: string) {
  const recordRef = doc(firestore, `${getUserPath(userId)}/studyRecords/${recordId}`)
  await deleteDoc(recordRef)
}

// ================== Explanations ==================

export async function syncExplanationToFirestore(userId: string, explanation: Explanation) {
  const explanationRef = doc(firestore, `${getUserPath(userId)}/explanations/${explanation.id}`)

  const firestoreExplanation: FirestoreExplanation = {
    ...explanation,
    createdAt: dateToTimestamp(explanation.createdAt)
  }

  await setDoc(explanationRef, firestoreExplanation, { merge: true })
}

export async function getExplanationsFromFirestore(userId: string): Promise<Explanation[]> {
  const explanationsRef = collection(firestore, `${getUserPath(userId)}/explanations`)
  const snapshot = await getDocs(explanationsRef)

  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreExplanation
    return {
      ...data,
      createdAt: timestampToDate(data.createdAt)
    }
  })
}

export async function deleteExplanationFromFirestore(userId: string, explanationId: string) {
  const explanationRef = doc(firestore, `${getUserPath(userId)}/explanations/${explanationId}`)
  await deleteDoc(explanationRef)
}

// ================== Batch Operations ==================

export async function backupAllDataToFirestore(
  userId: string,
  data: {
    workbooks: Workbook[]
    problems: Problem[]
    studyRecords: StudyRecord[]
    explanations: Explanation[]
  }
) {
  const batch = writeBatch(firestore)

  // Workbooks
  data.workbooks.forEach((workbook) => {
    const ref = doc(firestore, `${getUserPath(userId)}/workbooks/${workbook.id}`)
    const firestoreWorkbook: FirestoreWorkbook = {
      ...workbook,
      createdAt: dateToTimestamp(workbook.createdAt),
      updatedAt: dateToTimestamp(workbook.updatedAt)
    }
    batch.set(ref, firestoreWorkbook)
  })

  // Problems
  data.problems.forEach((problem) => {
    const ref = doc(firestore, `${getUserPath(userId)}/problems/${problem.id}`)
    const firestoreProblem: FirestoreProblem = {
      ...problem,
      createdAt: dateToTimestamp(problem.createdAt),
      deletedAt: problem.deletedAt ? dateToTimestamp(problem.deletedAt) : undefined
    }
    batch.set(ref, firestoreProblem)
  })

  // Study Records (バッチサイズ制限に注意、500件ごとに分割)
  const recordBatches = []
  for (let i = 0; i < data.studyRecords.length; i += 500) {
    recordBatches.push(data.studyRecords.slice(i, i + 500))
  }

  // 最初のバッチを現在のbatchに追加
  if (recordBatches.length > 0) {
    recordBatches[0].forEach((record) => {
      const ref = doc(firestore, `${getUserPath(userId)}/studyRecords/${record.id}`)
      const firestoreRecord: FirestoreStudyRecord = {
        ...record,
        studiedAt: dateToTimestamp(record.studiedAt)
      }
      batch.set(ref, firestoreRecord)
    })
  }

  // Explanations
  data.explanations.forEach((explanation) => {
    const ref = doc(firestore, `${getUserPath(userId)}/explanations/${explanation.id}`)
    const firestoreExplanation: FirestoreExplanation = {
      ...explanation,
      createdAt: dateToTimestamp(explanation.createdAt)
    }
    batch.set(ref, firestoreExplanation)
  })

  // 最初のバッチをコミット
  await batch.commit()

  // 残りのStudyRecordsバッチを処理
  for (let i = 1; i < recordBatches.length; i++) {
    const additionalBatch = writeBatch(firestore)
    recordBatches[i].forEach((record) => {
      const ref = doc(firestore, `${getUserPath(userId)}/studyRecords/${record.id}`)
      const firestoreRecord: FirestoreStudyRecord = {
        ...record,
        studiedAt: dateToTimestamp(record.studiedAt)
      }
      additionalBatch.set(ref, firestoreRecord)
    })
    await additionalBatch.commit()
  }
}

export async function restoreAllDataFromFirestore(userId: string) {
  const [workbooks, problems, studyRecords, explanations] = await Promise.all([
    getWorkbooksFromFirestore(userId),
    getProblemsFromFirestore(userId),
    getStudyRecordsFromFirestore(userId),
    getExplanationsFromFirestore(userId)
  ])

  return {
    workbooks,
    problems,
    studyRecords,
    explanations
  }
}

// ================== Data Existence Check ==================

/**
 * Firestoreにユーザーのデータが存在するかチェック
 */
export async function hasCloudData(userId: string): Promise<boolean> {
  try {
    // いずれかのコレクションにデータが存在するかチェック
    const [workbooks, problems, studyRecords, explanations] = await Promise.all([
      getWorkbooksFromFirestore(userId),
      getProblemsFromFirestore(userId),
      getStudyRecordsFromFirestore(userId),
      getExplanationsFromFirestore(userId)
    ])

    return (
      workbooks.length > 0 ||
      problems.length > 0 ||
      studyRecords.length > 0 ||
      explanations.length > 0
    )
  } catch (error) {
    console.error('Error checking cloud data:', error)
    return false
  }
}

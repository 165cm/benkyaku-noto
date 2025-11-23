import type { Problem } from '@/types'
import { db, getSubProblems } from './db'

// 問題をCSV形式にエクスポート（学習統計情報付き、親子関係を含む）
export async function exportProblemsToCSV(problems: Problem[]): Promise<string> {
  // CSVヘッダー
  const headers = ['問題番号', 'セクション', 'カテゴリ', 'ページ', 'メモ', '親問題', '学習回数', '正答率', '最新結果', '最新学習日']

  // 親問題を先に、小問を後に並べ替え
  const sortedProblems: Problem[] = []
  const parentProblems = problems.filter(p => !p.parentProblemId)

  for (const parent of parentProblems) {
    sortedProblems.push(parent)
    // この親の小問を取得
    const subProblems = await getSubProblems(parent.id)
    sortedProblems.push(...subProblems)
  }

  // CSVデータ行（非同期処理）
  const rows = await Promise.all(sortedProblems.map(async (problem) => {
    // 学習記録を取得
    const records = await db.studyRecords
      .where('problemId')
      .equals(problem.id)
      .toArray()

    // 学習統計を計算
    const studyCount = records.length
    let accuracy = ''
    let latestResult = ''
    let latestDate = ''

    if (records.length > 0) {
      // 正答率を計算
      const correctCount = records.filter(r => r.result === 'correct').length
      accuracy = `${Math.round((correctCount / records.length) * 100)}%`

      // 最新の学習記録を取得
      const sortedRecords = records.sort((a, b) =>
        new Date(b.studiedAt).getTime() - new Date(a.studiedAt).getTime()
      )
      const latest = sortedRecords[0]

      // 結果を日本語に変換
      latestResult = latest.result === 'correct' ? '正解'
                   : latest.result === 'partial' ? '部分正解'
                   : '不正解'

      // 日付をフォーマット
      latestDate = new Date(latest.studiedAt).toLocaleDateString('ja-JP')
    }

    // 表示用の問題番号（セクションがある場合は「セクション-番号」形式）
    const displayNumber = problem.sectionTitle
      ? `${problem.sectionTitle}-${problem.problemNumber}`
      : problem.problemNumber

    // 親問題の番号を取得
    let parentNumber = ''
    if (problem.parentProblemId) {
      const parent = problems.find(p => p.id === problem.parentProblemId)
      if (parent) {
        parentNumber = parent.sectionTitle
          ? `${parent.sectionTitle}-${parent.problemNumber}`
          : parent.problemNumber
      }
    }

    return [
      escapeCSVField(displayNumber),
      escapeCSVField(problem.sectionTitle || ''),
      escapeCSVField(problem.category || ''),
      problem.page?.toString() || '',
      escapeCSVField(problem.memo || ''),
      escapeCSVField(parentNumber),
      studyCount.toString(),
      accuracy,
      latestResult,
      latestDate,
    ].join(',')
  }))

  // ヘッダーとデータを結合
  return [headers.join(','), ...rows].join('\n')
}

// CSVフィールドのエスケープ処理
function escapeCSVField(field: string): string {
  // カンマ、改行、ダブルクォートを含む場合はダブルクォートで囲む
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    // ダブルクォートは2つ重ねてエスケープ
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

// CSVファイルをダウンロード
export function downloadCSV(csvContent: string, filename: string): void {
  // BOMを追加してExcelで文字化けを防ぐ
  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

// CSVからインポート（データのパース）
// 注: 学習統計情報（学習回数、正答率、最新結果、最新学習日）はインポート時に無視されます
export interface ParsedProblemData {
  problemNumber: string
  sectionTitle?: string
  category?: string
  page?: number
  memo?: string
  parentProblemNumber?: string
}

export function parseCSV(csvText: string): ParsedProblemData[] {
  const lines = csvText.split('\n').filter(line => line.trim() !== '')

  if (lines.length < 2) {
    throw new Error('CSVファイルが空です')
  }

  // ヘッダー行をスキップ
  const dataLines = lines.slice(1)

  const problems: ParsedProblemData[] = []

  for (const line of dataLines) {
    const fields = parseCSVLine(line)

    if (fields.length < 1) continue

    // 問題情報のみをインポート（フィールド0-5）
    // フィールド6以降（学習統計情報）は無視
    const problem: ParsedProblemData = {
      problemNumber: fields[0] || '',
      sectionTitle: fields[1] || undefined,
      category: fields[2] || undefined,
      page: fields[3] ? parseInt(fields[3]) : undefined,
      memo: fields[4] || undefined,
      parentProblemNumber: fields[5] || undefined,
    }

    if (problem.problemNumber) {
      problems.push(problem)
    }
  }

  return problems
}

// CSV行のパース（ダブルクォートに対応）
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // エスケープされたダブルクォート
        currentField += '"'
        i++ // 次の文字をスキップ
      } else {
        // ダブルクォートの開始/終了
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // フィールドの区切り
      fields.push(currentField)
      currentField = ''
    } else {
      currentField += char
    }
  }

  // 最後のフィールドを追加
  fields.push(currentField)

  return fields
}

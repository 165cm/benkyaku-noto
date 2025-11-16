import type { Problem } from '@/types'

// 問題をCSV形式にエクスポート
export function exportProblemsToCSV(problems: Problem[]): string {
  // CSVヘッダー
  const headers = ['問題番号', 'カテゴリ', 'ページ', 'メモ']

  // CSVデータ行
  const rows = problems.map((problem) => {
    return [
      escapeCSVField(problem.problemNumber),
      escapeCSVField(problem.category || ''),
      problem.page?.toString() || '',
      escapeCSVField(problem.memo || ''),
    ].join(',')
  })

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
export interface ParsedProblemData {
  problemNumber: string
  category?: string
  page?: number
  memo?: string
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

    const problem: ParsedProblemData = {
      problemNumber: fields[0] || '',
      category: fields[1] || undefined,
      page: fields[2] ? parseInt(fields[2]) : undefined,
      memo: fields[3] || undefined,
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

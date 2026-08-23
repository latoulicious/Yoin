import type { ExportRow } from './repo'

const COLUMNS: (keyof ExportRow)[] = [
  'id',
  'occurred_at',
  'kind',
  'amount',
  'category',
  'account',
  'note',
  'transfer_group_id',
]

function field(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /["\r\n,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(',')]
  for (const row of rows) lines.push(COLUMNS.map((column) => field(row[column])).join(','))
  return lines.join('\r\n')
}

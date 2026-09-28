// apps/desktop/src/renderer/src/components/XlsxPreview.tsx
import { useEffect, useState } from 'react'
import ExcelJS from 'exceljs'

interface XlsxPreviewProps {
  data: ArrayBuffer
}

interface CellValue {
  text: string
  isHeader: boolean
}

interface SheetData {
  rows: CellValue[][]
}

export function XlsxPreview({ data }: XlsxPreviewProps) {
  const [sheetData, setSheetData] = useState<SheetData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data.byteLength === 0) return
    const workbook = new ExcelJS.Workbook()
    workbook.xlsx
      .load(data)
      .then(() => {
        const sheet = workbook.worksheets[0]
        if (!sheet) {
          setError('Excel 文件中没有工作表')
          return
        }
        const rows: CellValue[][] = []
        sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
          const cells: CellValue[] = []
          row.eachCell({ includeEmpty: true }, (cell) => {
            const raw = cell.value
            let text = ''
            if (raw === null || raw === undefined) {
              text = ''
            } else if (typeof raw === 'object' && 'richText' in raw) {
              text = (raw as { richText: Array<{ text: string }> }).richText
                .map((r) => r.text)
                .join('')
            } else if (typeof raw === 'object' && 'result' in raw) {
              text = String((raw as { result: unknown }).result ?? '')
            } else {
              text = String(raw)
            }
            cells.push({ text, isHeader: rowNum === 1 })
          })
          rows.push(cells)
        })
        setSheetData({ rows })
      })
      .catch((e) => setError((e as Error).message))
  }, [data])

  if (error) {
    return <p className="text-destructive text-sm p-4">{error}</p>
  }

  if (!sheetData) {
    return <p className="text-muted-foreground text-sm p-4">解析中…</p>
  }

  return (
    <div className="overflow-auto h-full p-4">
      <table className="text-sm border-collapse w-full">
        <tbody>
          {sheetData.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) =>
                cell.isHeader ? (
                  <th
                    key={ci}
                    className="border border-border px-2 py-1 bg-muted font-semibold text-left"
                  >
                    {cell.text}
                  </th>
                ) : (
                  <td key={ci} className="border border-border px-2 py-1">
                    {cell.text}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

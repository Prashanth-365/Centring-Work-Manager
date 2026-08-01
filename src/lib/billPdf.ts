// Native print path for measurement bills (same pattern as weeklyPdf.ts).
//
// The Capacitor WebView's window.print() doesn't open Android's system print
// dialog, so on native we render the bill to a PORTRAIT PDF, write it to the
// app CACHE dir (@capacitor/filesystem), and hand that file to the Android
// share/print sheet (@capacitor/share). Sharing from Cache works because
// Capacitor's FileProvider serves app-owned files — a public Downloads file://
// path would throw FileUriExposedException on Android 7+.
// This module is only imported on native, and jspdf is lazy-loaded so it never
// enters the web bundle.
import { downloadStamp } from './files'
import type { jsPDF as JsPDF } from 'jspdf'

export interface BillPdfSheet {
  /** e.g. "Subba Reddy - Thoguru — Ground Floor" */
  title: string
  /** ISO bill date shown top-left (defaults to today). */
  billDate?: string
  /** Consolidated view: one flat table. */
  table?: { head: string[]; rows: string[][] }
  /** Floor bills: per-section `L X H X n no total` tables in N columns. */
  measureCols?: {
    cols: { name: string; rows: string[][]; total: string }[][]
  }
  /** Boxed section-totals recap (section name / area). */
  recap?: { lines: [string, string][]; total: [string, string] }
  /** Bottom money lines. */
  summary: { label: string; value: string; strong?: boolean; tone?: 'primary' | 'danger' | 'success' }[]
  /** Font size in pt (mirrors the web preview slider). */
  fontSize?: number
  /** Cell padding in pt (mirrors the row-pad slider). */
  rowPad?: number
}

const COMPANY = 'Sri Siddeshwara Swami Prasanna (SSP)'
const COMPANY_SUB = 'Centering · Shuttering · Scaffolding Works'
const CONTACT = 'Eshwar G S — 7899041588'

/** jspdf's built-in fonts are WinAnsi — ₹, arrows, primes, and typographic
 * dashes/quotes render as garbage bytes, so map them to ASCII equivalents. */
const safe = (s: string) =>
  s
    .replace(/\u20B9\s?/g, 'Rs ')
    .replace(/\u2032/g, "'")
    .replace(/\u2033/g, '"')
    .replace(/\u00B7/g, '-')
    .replace(/\u2192/g, 'to')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2212/g, '-')
    .replace(/[^\x20-\x7E]/g, '')

// downloadStamp already imported above

/** Draw company head + bill header on a given page. Returns the y after the header. */
function drawPageHead(
  doc: JsPDF,
  pageW: number,
  margin: number,
  sheet: BillPdfSheet,
): number {
  let y = 32
  // Company name
  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text(COMPANY, pageW / 2, y, { align: 'center' })
  y += 13
  // Subtitle + contact
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(safe(COMPANY_SUB), pageW / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(safe(CONTACT), pageW - margin, y, { align: 'right' })
  y += 6
  doc.setLineWidth(1.0)
  doc.line(margin, y, pageW - margin, y)
  y += 10
  // Bill date left, contact already shown; title centred
  const billDate = sheet.billDate ? new Date(sheet.billDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(billDate, margin, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(sheet.fontSize ?? 10)
  doc.text(safe(sheet.title).toUpperCase(), pageW / 2, y + 2, { align: 'center' })
  y += 12
  doc.setLineWidth(1.2)
  doc.line(margin, y, pageW - margin, y)
  y += 8
  return y
}

/** Draw signature footer on the current page. */
function drawSignatureFoot(
  doc: JsPDF,
  pageW: number,
  pageH: number,
  margin: number,
): void {
  const sy = pageH - 52
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setLineWidth(0.5)
  doc.line(margin, sy, margin + 120, sy)
  doc.line(pageW - margin - 120, sy, pageW - margin, sy)
  doc.text('Owner signature', margin + 60, sy + 11, { align: 'center' })
  doc.text(`For ${safe(COMPANY)}`, pageW - margin - 60, sy + 11, { align: 'center' })
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(120, 120, 120)
  doc.text('Thank you for your business!', pageW / 2, sy + 24, { align: 'center' })
  doc.setTextColor(0, 0, 0)
}

export async function shareBillPdf(opts: { fileTitle: string; sheets: BillPdfSheet[] }): Promise<{ uri: string }> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const sigHeight = 60 // reserved at bottom for signature

  opts.sheets.forEach((sheet, si) => {
    if (si > 0) doc.addPage()

    const fs = sheet.fontSize ?? 9
    const rp = sheet.rowPad ?? 3

    let y = drawPageHead(doc, pageW, margin, sheet)

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - sigHeight - 20) {
        doc.addPage()
        y = drawPageHead(doc, pageW, margin, sheet)
      }
    }

    // Measurements
    if (sheet.measureCols) {
      const numCols = sheet.measureCols.cols.length
      const mColW = (pageW - margin * 2 - (numCols - 1) * 14) / numCols
      const startY = y
      const colStyles = {
        1: { cellWidth: 14, textColor: [138, 151, 163] as [number, number, number], fontSize: Math.max(6, fs - 2) },
        3: { cellWidth: 14, textColor: [138, 151, 163] as [number, number, number], fontSize: Math.max(6, fs - 2) },
        5: { cellWidth: 18, textColor: [138, 151, 163] as [number, number, number], fontSize: Math.max(6, fs - 2) },
        6: { fontStyle: 'bold' as const },
      }
      const drawCol = (secs: NonNullable<BillPdfSheet['measureCols']>['cols'][number], x: number) => {
        let cy = startY
        for (const s of secs) {
          const body = [
            [{ content: safe(s.name), colSpan: 7, styles: { halign: 'left' as const, fontStyle: 'bold' as const, textColor: [26, 82, 118] as [number, number, number], fillColor: [247, 249, 251] as [number, number, number] } }],
            ...s.rows.map((r) => r.map(safe)),
            [
              { content: 'Total', colSpan: 3, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [252, 253, 254] as [number, number, number] } },
              { content: '=', styles: { textColor: [138, 151, 163] as [number, number, number], fontSize: 7, fillColor: [252, 253, 254] as [number, number, number] } },
              { content: safe(s.total), colSpan: 3, styles: { fontStyle: 'bold' as const, fillColor: [252, 253, 254] as [number, number, number] } },
            ],
          ]
          autoTable(doc, {
            body: body as never,
            startY: cy,
            margin: { left: x, top: margin, bottom: sigHeight + 20 },
            tableWidth: mColW,
            theme: 'grid',
            styles: { fontSize: fs, cellPadding: rp, halign: 'center', lineColor: [184, 198, 210], lineWidth: 0.6, textColor: [0, 0, 0] },
            columnStyles: colStyles,
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cy = (doc as any).lastAutoTable.finalY + 8
        }
        return cy
      }
      const pageBefore = doc.getNumberOfPages()
      const endYs: number[] = []
      sheet.measureCols.cols.forEach((colSecs, ci) => {
        if (ci > 0) doc.setPage(pageBefore)
        const x = margin + ci * (mColW + 14)
        endYs.push(drawCol(colSecs, x))
      })
      const pageAfter = doc.getNumberOfPages()
      doc.setPage(pageAfter)
      y = Math.max(...endYs) + 8
    } else if (sheet.table) {
      autoTable(doc, {
        head: [sheet.table.head.map(safe)],
        body: sheet.table.rows.map((r) => r.map(safe)),
        startY: y,
        margin: { left: margin, right: margin, bottom: sigHeight + 20 },
        theme: 'grid',
        styles: { fontSize: fs, cellPadding: rp, halign: 'center' },
        headStyles: { fillColor: [26, 82, 118], textColor: 255 },
        columnStyles: { 0: { halign: 'left' } },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 16
    }

    // Boxed section-totals recap (mirrors the web layout)
    if (sheet.recap) {
      const boxW = 320
      const boxX = (pageW - boxW) / 2
      const lineH = 15
      const pad = 10
      const boxH = pad * 2 + (sheet.recap.lines.length + 1) * lineH + 4
      ensureSpace(boxH + 50)
      // Full-width rule before the recap box (grand-rule in the HTML)
      doc.setDrawColor(51, 51, 51)
      doc.setLineWidth(1.2)
      doc.line(margin, y, pageW - margin, y)
      y += 12
      doc.setDrawColor(51, 51, 51)
      doc.setLineWidth(1)
      doc.roundedRect(boxX, y, boxW, boxH, 4, 4)
      let ry = y + pad + 9
      doc.setFontSize(9.5)
      sheet.recap.lines.forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal')
        doc.text(safe(label), boxX + pad, ry)
        doc.text(`= ${safe(value)}`, boxX + boxW - pad, ry, { align: 'right' })
        ry += lineH
      })
      doc.setLineWidth(0.5)
      doc.setDrawColor(153, 153, 153)
      doc.line(boxX + pad, ry - 10, boxX + boxW - pad, ry - 10)
      doc.setFont('helvetica', 'bold')
      doc.text(safe(sheet.recap.total[0]), boxX + pad, ry + 2)
      doc.text(safe(sheet.recap.total[1]), boxX + boxW - pad, ry + 2, { align: 'right' })
      y += boxH + 14
      // Full-width divider before the money lines
      doc.setDrawColor(51, 51, 51)
      doc.setLineWidth(1.2)
      doc.line(margin, y, pageW - margin, y)
      y += 16
    }

    // Summary lines (HTML .money-box: padded rows, double rule above .final)
    ensureSpace(sheet.summary.length * 20 + 30)
    if (!sheet.recap) {
      // grand-rule before the money lines on the consolidated sheet
      doc.setDrawColor(51, 51, 51)
      doc.setLineWidth(1.2)
      doc.line(margin, y - 6, pageW - margin, y - 6)
      y += 10
    }
    let firstStrongDone = false
    sheet.summary.forEach((line) => {
      if (line.strong && !firstStrongDone) {
        // 3px double rule above TOTAL / GRAND TOTAL
        doc.setDrawColor(51, 51, 51)
        doc.setLineWidth(0.8)
        doc.line(margin, y - 8, pageW - margin, y - 8)
        doc.line(margin, y - 5.5, pageW - margin, y - 5.5)
        y += 6
        firstStrongDone = true
      }
      doc.setFont('helvetica', line.strong ? 'bold' : 'normal')
      doc.setFontSize(line.strong ? 12.5 : 10)
      if (line.tone === 'primary') doc.setTextColor(26, 82, 118)
      else if (line.tone === 'danger') doc.setTextColor(170, 51, 51)
      else if (line.tone === 'success') doc.setTextColor(30, 122, 69)
      else doc.setTextColor(0, 0, 0)
      doc.text(safe(line.label), margin + 4, y)
      doc.text(safe(line.value), pageW - margin - 4, y, { align: 'right' })
      y += line.strong ? 22 : 18
    })
    doc.setTextColor(0, 0, 0)
  })

  // Draw signature footer + page number on EVERY page (per-page repeating footer).
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    drawSignatureFoot(doc, pageW, pageH, margin)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text(`Page ${p} of ${pageCount}`, pageW / 2, pageH - 10, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  }

  const dataUri = doc.output('datauristring')
  const base64 = dataUri.substring(dataUri.indexOf('base64,') + 7)
  const safeName = opts.fileTitle.replace(/[\\/:*?"<>|]/g, '-').replace(/\s*·\s*/g, ' · ').trim()
  const filename = `${safeName || `centering-bill-${downloadStamp()}`}.pdf`

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })

  try {
    await Share.share({
      title: opts.fileTitle,
      text: opts.fileTitle,
      url: uri,
      dialogTitle: 'Print or share bill',
    })
  } catch (e) {
    // User cancel is not an error; anything else propagates to the caller toast.
    const msg = (e as Error)?.message ?? ''
    if (!/cancel/i.test(msg)) throw e
  }
  return { uri }
}

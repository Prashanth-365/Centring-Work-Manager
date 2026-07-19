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

export interface BillPdfSheet {
  /** e.g. "Centering Work Bill — Ground Floor" */
  title: string
  /** label/value pairs shown under the title (Owner, Location, …). */
  info: [string, string][]
  /** Consolidated view: one flat table. */
  table?: { head: string[]; rows: string[][] }
  /** Floor bills: per-section `L X H X n no total` tables in two columns
   * (Roof Slab/Roof always top-right, like the old paper bills). */
  measureCols?: {
    left: { name: string; rows: string[][]; total: string }[]
    right: { name: string; rows: string[][]; total: string }[]
  }
  /** Boxed section-totals recap (section name / area), matching the web layout. */
  recap?: { lines: [string, string][]; total: [string, string] }
  /** Bottom money lines; `strong` renders bold + slightly larger. */
  summary: { label: string; value: string; strong?: boolean; tone?: 'primary' | 'danger' | 'success' }[]
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

export async function shareBillPdf(opts: { fileTitle: string; sheets: BillPdfSheet[] }): Promise<{ uri: string }> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40

  opts.sheets.forEach((sheet, si) => {
    if (si > 0) doc.addPage()
    let y = 48

    // Company head
    doc.setFont('times', 'bold')
    doc.setFontSize(18)
    doc.text(COMPANY, pageW / 2, y, { align: 'center' })
    y += 16
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(safe(COMPANY_SUB).toUpperCase().split('').join(' ').replace(/\s{3}/g, '  '), pageW / 2, y, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(safe(CONTACT), pageW - margin, y, { align: 'right' })
    y += 8
    doc.setLineWidth(1.2)
    doc.line(margin, y, pageW - margin, y)
    y += 22

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(safe(sheet.title).toUpperCase(), pageW / 2, y, { align: 'center' })
    y += 18

    // Info grid — two columns
    doc.setFontSize(9)
    const colW = (pageW - margin * 2) / 2
    sheet.info.forEach(([label, value], i) => {
      const x = margin + (i % 2) * colW
      doc.setFont('helvetica', 'bold')
      doc.text(`${safe(label)}: `, x, y)
      const lw = doc.getTextWidth(`${safe(label)}: `)
      doc.setFont('helvetica', 'normal')
      doc.text(safe(value), x + lw, y)
      if (i % 2 === 1) y += 13
    })
    if (sheet.info.length % 2 === 1) y += 13
    y += 6

    // Measurements
    if (sheet.measureCols) {
      // Two independent autoTable columns, like the paper bills.
      const colW = (pageW - margin * 2 - 14) / 2
      const startY = y
      const colStyles = {
        1: { cellWidth: 14, textColor: [138, 151, 163] as [number, number, number], fontSize: 7 },
        3: { cellWidth: 14, textColor: [138, 151, 163] as [number, number, number], fontSize: 7 },
        5: { cellWidth: 18, textColor: [138, 151, 163] as [number, number, number], fontSize: 7 },
        6: { fontStyle: 'bold' as const },
      }
      const drawCol = (secs: NonNullable<BillPdfSheet['measureCols']>['left'], x: number) => {
        let cy = startY
        for (const s of secs) {
          const body = [
            [{ content: safe(s.name), colSpan: 7, styles: { halign: 'left' as const, fontStyle: 'bold' as const, textColor: [26, 82, 118] as [number, number, number] } }],
            ...s.rows.map((r) => r.map(safe)),
            [
              { content: 'Total', colSpan: 3, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
              { content: '=', styles: { textColor: [138, 151, 163] as [number, number, number], fontSize: 7 } },
              { content: safe(s.total), colSpan: 3, styles: { fontStyle: 'bold' as const } },
            ],
          ]
          autoTable(doc, {
            body: body as never,
            startY: cy,
            margin: { left: x, top: margin, bottom: margin },
            tableWidth: colW,
            theme: 'plain',
            styles: { fontSize: 8.5, cellPadding: 2.5, halign: 'center', lineWidth: 0, lineColor: 240 },
            columnStyles: colStyles,
            didParseCell: (d) => {
              d.cell.styles.lineWidth = { top: 0, right: 0, left: 0, bottom: 0.4 } as never
            },
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cy = (doc as any).lastAutoTable.finalY + 8
        }
        return cy
      }
      const pageBefore = doc.getNumberOfPages()
      const endL = drawCol(sheet.measureCols.left, margin)
      const pageAfterL = doc.getNumberOfPages()
      // autoTable draws on the CURRENT page — jump back so the right column
      // starts beside the left one, not on the overflow page.
      doc.setPage(pageBefore)
      const endR = drawCol(sheet.measureCols.right, margin + colW + 14)
      const pageAfterR = doc.getNumberOfPages()
      doc.setPage(Math.max(pageAfterL, pageAfterR))
      y = Math.max(endL, endR) + 8
    } else if (sheet.table) {
      autoTable(doc, {
        head: [sheet.table.head.map(safe)],
        body: sheet.table.rows.map((r) => r.map(safe)),
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: [26, 82, 118], textColor: 255 },
        columnStyles: { 0: { halign: 'left' } },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 16
    }

    // Content past the table is drawn manually — break to a fresh page instead
    // of letting it run off the bottom (long bills were getting cropped).
    const ensureSpace = (need: number) => {
      if (y + need > pageH - margin) {
        doc.addPage()
        y = margin + 8
      }
    }

    // Boxed section-totals recap (mirrors the web layout)
    if (sheet.recap) {
      const boxW = 320
      const boxX = (pageW - boxW) / 2
      const lineH = 15
      const pad = 10
      const boxH = pad * 2 + (sheet.recap.lines.length + 1) * lineH + 4
      ensureSpace(boxH + 30)
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

    // Summary lines
    ensureSpace(sheet.summary.length * 17 + 20)
    sheet.summary.forEach((line) => {
      doc.setFont('helvetica', line.strong ? 'bold' : 'normal')
      doc.setFontSize(line.strong ? 11 : 9.5)
      if (line.tone === 'primary') doc.setTextColor(26, 82, 118)
      else if (line.tone === 'danger') doc.setTextColor(170, 51, 51)
      else if (line.tone === 'success') doc.setTextColor(30, 122, 69)
      else doc.setTextColor(0, 0, 0)
      doc.text(safe(line.label), margin, y)
      doc.text(safe(line.value), pageW - margin, y, { align: 'right' })
      y += line.strong ? 17 : 14
    })
    doc.setTextColor(0, 0, 0)

    // Signature foot
    ensureSpace(90)
    y = Math.max(y + 40, pageH - 110)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setLineWidth(0.5)
    doc.line(margin, y, margin + 140, y)
    doc.line(pageW - margin - 140, y, pageW - margin, y)
    doc.text('Owner signature', margin + 70, y + 12, { align: 'center' })
    doc.text(`For ${safe(COMPANY)}`, pageW - margin - 70, y + 12, { align: 'center' })
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(102, 102, 102)
    doc.text('Thank you for your business!', pageW / 2, y + 30, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  })

  // Centered page number on every page, below the thank-you line.
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Page ${p} of ${pageCount}`, pageW / 2, pageH - 24, { align: 'center' })
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

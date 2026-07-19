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
  table: { head: string[]; rows: string[][] }
  /** Boxed section-totals recap (section name / area), matching the web layout. */
  recap?: { lines: [string, string][]; total: [string, string] }
  /** Bottom money lines; `strong` renders bold + slightly larger. */
  summary: { label: string; value: string; strong?: boolean; tone?: 'primary' | 'danger' | 'success' }[]
}

const COMPANY = 'Sri Siddeshwara Swami Prassanna (SSP)'
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
    doc.text(safe(COMPANY_SUB).toUpperCase(), pageW / 2, y, { align: 'center' })
    y += 11
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(safe(CONTACT), pageW / 2, y, { align: 'center' })
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

    // Measurement table
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
    ensureSpace(70)
    y = Math.max(y + 40, pageH - 90)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setLineWidth(0.5)
    doc.line(margin, y, margin + 140, y)
    doc.line(pageW - margin - 140, y, pageW - margin, y)
    doc.text('Owner signature', margin + 70, y + 12, { align: 'center' })
    doc.text(`For ${COMPANY}`, pageW - margin - 70, y + 12, { align: 'center' })
  })

  const dataUri = doc.output('datauristring')
  const base64 = dataUri.substring(dataUri.indexOf('base64,') + 7)
  const filename = `centering-bill-${downloadStamp()}.pdf`

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

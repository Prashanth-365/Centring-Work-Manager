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
  /** Bottom money lines; `strong` renders bold + slightly larger. */
  summary: { label: string; value: string; strong?: boolean }[]
}

const COMPANY = 'Sri Siddeshwara Centering Works'
const COMPANY_SUB = 'Centering · Shuttering · Scaffolding Works'

/** jspdf's built-in fonts are WinAnsi — ₹ and prime marks don't render. */
const safe = (s: string) =>
  s.replace(/\u20B9\s?/g, 'Rs ').replace(/\u2032/g, "'").replace(/\u2033/g, '"').replace(/\u00B7/g, '-')

export async function shareBillPdf(opts: { fileTitle: string; sheets: BillPdfSheet[] }): Promise<{ uri: string }> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
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

    // Summary lines
    sheet.summary.forEach((line) => {
      doc.setFont('helvetica', line.strong ? 'bold' : 'normal')
      doc.setFontSize(line.strong ? 11 : 9.5)
      doc.text(safe(line.label), margin, y)
      doc.text(safe(line.value), pageW - margin, y, { align: 'right' })
      y += line.strong ? 17 : 14
    })

    // Signature foot
    y = Math.max(y + 40, doc.internal.pageSize.getHeight() - 90)
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

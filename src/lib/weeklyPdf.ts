// Native print path for the Weekly summary (§ Android print fix).
//
// The Capacitor WebView's window.print() doesn't open Android's system print
// dialog, so on native we render the selected week to a LANDSCAPE PDF, write it to
// the app CACHE dir (@capacitor/filesystem), and hand that file to the Android
// share/print sheet (@capacitor/share). Sharing from Cache works because
// Capacitor's FileProvider can serve app-owned files — sharing a public Downloads
// path would throw FileUriExposedException on Android 7+ (the original failure).
// The web build keeps window.print() (see Weekly.tsx) — this module is only
// imported on the native path, and jspdf is lazy-loaded so it never touches the
// web bundle.
import { format, parseISO } from 'date-fns'
import type { WeeklyRow, WeeklyTotals } from './compute/weekly'
import { downloadStamp } from './files'

export interface WeeklyPdfInput {
  /** Heading, e.g. "Weekly summary · 16 – 22 Jun 2026". */
  title: string
  /** The week's ISO day strings (Mon–Sun) for the column headers. */
  days: string[]
  rows: WeeklyRow[]
  totals: WeeklyTotals
}

const r = (n: number) => String(Math.round(n))
const df = (n: number) => (n === 0 ? '·' : Number.isInteger(n) ? `${n}` : n.toFixed(1))

/**
 * Build the landscape weekly PDF, write it to the app cache dir, and hand it to
 * the Android share/print sheet. Throws on a real failure (not user-cancel) so
 * the caller can surface it via a toast — never silent.
 */
export async function shareWeeklyPdf(input: WeeklyPdfInput): Promise<{ uri: string }> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFontSize(12)
  doc.text(input.title, 28, 28)

  const head = [
    [
      'Worker',
      ...input.days.map((d) => format(parseISO(d), 'EEE')),
      'Days',
      'Wage',
      'Food',
      'Total',
      'Paid',
      'Prev',
      'Final',
    ],
  ]
  const body = input.rows.map((row) => [
    row.worker.name,
    ...row.perDay.map(df),
    df(row.totalDays),
    r(row.totalWage),
    r(row.food),
    r(row.total),
    r(row.paid),
    r(row.previousBalance),
    r(row.finalBalance),
  ])
  const foot = [
    [
      'Total',
      ...input.days.map(() => ''),
      df(input.totals.totalDays),
      r(input.totals.totalWage),
      r(input.totals.food),
      r(input.totals.total),
      r(input.totals.paid),
      r(input.totals.previousBalance),
      r(input.totals.finalBalance),
    ],
  ]

  autoTable(doc, {
    head,
    body,
    foot,
    startY: 40,
    margin: { left: 28, right: 28 },
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', halign: 'right' },
    headStyles: { fillColor: [217, 119, 6], textColor: 255, halign: 'right' },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', cellWidth: 90 } },
  })

  const dataUri = doc.output('datauristring')
  const base64 = dataUri.substring(dataUri.indexOf('base64,') + 7)
  const filename = `centering-weekly-${downloadStamp()}.pdf`

  // Write to the app CACHE dir, then share THAT file — Capacitor's Share plugin
  // serves app-owned files (Cache/Data) via its FileProvider, whereas a public
  // Downloads file:// path throws FileUriExposedException on Android 7+.
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
  const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })

  try {
    await Share.share({
      title: input.title,
      text: input.title,
      url: uri,
      dialogTitle: 'Print or share weekly summary',
    })
  } catch (e) {
    // A user cancel is not an error; anything else propagates to the caller toast.
    const msg = (e as Error)?.message ?? ''
    if (!/cancel/i.test(msg)) throw e
  }
  return { uri }
}

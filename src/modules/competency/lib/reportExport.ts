/**
 * Print and PDF output for the full competency report (CompetencyPrintReport).
 *
 * The old flow scaled the WHOLE report down to fit one A4 page (fine for a one-page summary, but a
 * complete report became unreadable). Both paths now paginate at section boundaries instead:
 *  - print: the report's own markup in a hidden iframe with @page A4 and break-inside:avoid on every
 *    [data-pdf-block] section, zoomed only to fit the page width;
 *  - PDF: each section rasterized separately (html2canvas) and packed onto A4 pages so a section
 *    only ever breaks when it is taller than a page by itself; the branded header opens page 1, a
 *    slim running header sits on the following pages, and every page gets a page number.
 */

export const REPORT_WIDTH_PX = 760

const PRINT_CSS = (marginMm: number) => `
  @page { size: A4 portrait; margin: ${marginMm}mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Vazirmatn", "Segoe UI", sans-serif; }
  [data-pdf-block] { break-inside: avoid; page-break-inside: avoid; }
  [data-pdf-block][data-pdf-breakable] { break-inside: auto; page-break-inside: auto; }
  [data-pdf-running] { display: none !important; }
  tr, img, svg { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  h2, h3 { break-after: avoid; page-break-after: avoid; }
`

/** The same stylesheet, for a harness page or a standalone print view. */
export function reportPrintCss(marginMm = 10): string {
  return PRINT_CSS(marginMm)
}

export async function printReportNode(node: HTMLElement, title: string, marginMm = 10): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    return
  }
  const zoom = Math.min(1, ((210 - marginMm * 2) * (96 / 25.4)) / REPORT_WIDTH_PX)
  doc.open()
  doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${title.replace(/</g, '')}</title>
<base href="${document.baseURI}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap">
<style>${PRINT_CSS(marginMm)} #report-root { zoom: ${zoom.toFixed(4)}; }</style></head>
<body><div id="report-root">${node.innerHTML}</div></body></html>`)
  doc.close()
  try {
    await doc.fonts?.ready
  } catch {
    /* fonts API unavailable — print with whatever is loaded */
  }
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
  win.focus()
  win.print()
  win.addEventListener('afterprint', () => frame.remove())
  setTimeout(() => frame.remove(), 60_000)
}

/** Paginated A4 PDF of a CompetencyPrintReport node. Returns false if nothing could be captured. */
export async function exportReportPdf(node: HTMLElement, filename: string): Promise<boolean> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 9
  const footer = 8
  const contentW = pageW - margin * 2
  const bottom = pageH - margin - footer

  const capture = async (el: HTMLElement) => {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
    return { canvas, hMm: (canvas.height * contentW) / canvas.width }
  }

  const header = node.querySelector<HTMLElement>('[data-pdf-header]')
  const running = node.querySelector<HTMLElement>('[data-pdf-running]')
  const blocks = Array.from(node.querySelectorAll<HTMLElement>('[data-pdf-block]'))
  if (blocks.length === 0 && !header) return false

  // The running header is display:none on screen and in print; show it only while capturing.
  let runningShot: Awaited<ReturnType<typeof capture>> | null = null
  if (running) {
    const prev = running.style.display
    running.style.display = 'flex'
    runningShot = await capture(running)
    running.style.display = prev
  }

  let y = margin
  let page = 1
  const newPage = () => {
    pdf.addPage()
    page += 1
    y = margin
    if (runningShot) {
      pdf.addImage(runningShot.canvas.toDataURL('image/png'), 'PNG', margin, y, contentW, runningShot.hMm)
      y += runningShot.hMm + 3
    }
  }

  if (header) {
    const shot = await capture(header)
    pdf.addImage(shot.canvas.toDataURL('image/png'), 'PNG', margin, y, contentW, shot.hMm)
    y += shot.hMm + 3
  }

  for (const block of blocks) {
    const shot = await capture(block)
    const gap = 3
    if (shot.hMm <= bottom - y) {
      pdf.addImage(shot.canvas.toDataURL('image/png'), 'PNG', margin, y, contentW, shot.hMm)
      y += shot.hMm + gap
      continue
    }
    const pageArea = bottom - margin - (runningShot ? runningShot.hMm + 3 : 0)
    if (shot.hMm <= pageArea) {
      newPage()
      pdf.addImage(shot.canvas.toDataURL('image/png'), 'PNG', margin, y, contentW, shot.hMm)
      y += shot.hMm + gap
      continue
    }
    // Taller than a whole page: slice the bitmap across pages.
    const pxPerMm = shot.canvas.width / contentW
    let offsetPx = 0
    if (bottom - y < 40) newPage()
    while (offsetPx < shot.canvas.height) {
      const sliceMm = Math.min(bottom - y, (shot.canvas.height - offsetPx) / pxPerMm)
      const slicePx = Math.floor(sliceMm * pxPerMm)
      const part = document.createElement('canvas')
      part.width = shot.canvas.width
      part.height = slicePx
      part.getContext('2d')?.drawImage(shot.canvas, 0, offsetPx, shot.canvas.width, slicePx, 0, 0, shot.canvas.width, slicePx)
      pdf.addImage(part.toDataURL('image/png'), 'PNG', margin, y, contentW, sliceMm)
      offsetPx += slicePx
      y += sliceMm + gap
      if (offsetPx < shot.canvas.height) newPage()
    }
  }

  const total = page
  for (let p = 1; p <= total; p += 1) {
    pdf.setPage(p)
    pdf.setFontSize(8)
    pdf.setTextColor(148, 163, 184)
    pdf.text(`FARIN  ·  ${p} / ${total}`, pageW / 2, pageH - margin + 2, { align: 'center' })
  }
  pdf.save(filename)
  return true
}

/**
 * Opens a printable document in a new window — the one place the app writes a print window.
 * `print: true` waits for the page's fonts and opens the print dialog (the browser's «Save as PDF» makes the PDF);
 * leave it off for a document that prints itself or is only for viewing. Returns false when the browser blocked the window.
 */
export function openPrintDocument(html: string, opts: { print?: boolean; delay?: number } = {}): boolean {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.open(); win.document.write(html); win.document.close()
  if (opts.print) {
    const go = () => { try { win.focus(); win.print() } catch { /* the window was closed */ } }
    void (win.document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(go, opts.delay ?? 400))
  }
  return true
}

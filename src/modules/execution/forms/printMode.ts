/** Which paper a technical form is printed on. `legacy` (the paper built into the app) is the default for every form; the approved grid sheet is used for official printing only after the form owner signed its conformity (`printMode[formKey] = 'template'` in the project settings). */
export type PrintMode = 'legacy' | 'template'

export function printModeOf(raw: unknown, formKey: string): PrintMode {
  const pm = (raw as { printMode?: Record<string, unknown> } | null | undefined)?.printMode
  return pm && typeof pm === 'object' && pm[formKey] === 'template' ? 'template' : 'legacy'
}

/** `template` when an approved sheet exists AND (the form was switched to template mode OR the user asked for the experimental preview); otherwise `legacy`. */
export function paperChoice(opts: { mode: PrintMode; hasApproved: boolean; preview: boolean }): 'template' | 'legacy' {
  return opts.hasApproved && (opts.mode === 'template' || opts.preview) ? 'template' : 'legacy'
}

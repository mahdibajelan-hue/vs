import type { KeyboardEvent, MouseEvent } from 'react'

/**
 * Makes a non-button element that already reacts to a click (a selectable table row, a map shape, a card)
 * reachable from the keyboard too: it joins the tab order, Enter or Space activates it, and it gets a button
 * role unless it is a table row (a <tr> keeps its row semantics). With no handler it adds nothing, so
 * `pressable(cond ? fn : undefined)` stays inert exactly like `onClick={undefined}` did.
 */
export function pressable<E extends Element>(handler?: ((e: MouseEvent<E>) => void) | null, opts: { row?: boolean } = {}) {
  if (!handler) return {}
  return {
    onClick: handler,
    onKeyDown: (e: KeyboardEvent<E>) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      handler(e as unknown as MouseEvent<E>)
    },
    tabIndex: 0,
    ...(opts.row ? {} : { role: 'button' as const }),
  }
}

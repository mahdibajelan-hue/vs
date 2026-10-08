import type { ComponentProps } from 'react'
import { Modal } from '../platform'
import { useMsTheme } from '../store/useMsTheme'

/** The platform dialog, re-skinned as a light (or dark) card so the module's own tokens stay readable inside it. */
export function MsModal(props: ComponentProps<typeof Modal>) {
  const dark = useMsTheme((s) => s.dark)
  return <Modal {...props} panelClassName={`ms-modal-panel ${dark ? 'ms-dark' : ''} ${props.panelClassName ?? ''}`} />
}

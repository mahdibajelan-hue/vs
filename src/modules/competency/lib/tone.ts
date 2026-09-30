import type { CSSProperties } from 'react'

/** `--tone` for the .fx-tone-* utilities (styles/farinTheme.css) — readable in both themes. */
export const tone = (color: string, extra?: CSSProperties): CSSProperties => ({ ['--tone' as string]: color, ...extra }) as CSSProperties

export type PaletteToken =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'hot'
  | 'good'
  | 'fair'
  | 'low'

/** A CSS color string from a palette token, optionally tinted. */
export function token(name: PaletteToken, alpha = 1): string {
  const v = `var(--${name})`
  return alpha >= 1 ? `rgb(${v})` : `rgb(${v} / ${alpha})`
}

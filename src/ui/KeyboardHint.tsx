import { memo } from 'react'

const HINTS = [
  { key: '1', label: 'Normal' },
  { key: '2', label: 'Simplify' },
  { key: '3', label: 'Focus' },
  { key: '4', label: 'Expert' },
  { key: 'D', label: 'Debug' },
  { key: 'R', label: 'Recalibrate' },
] as const

/** Demo controls. Fixed at the bottom so the fallback is always one glance away. */
export const KeyboardHint = memo(function KeyboardHint() {
  return (
    <footer className="keyhint" aria-label="Demo keys">
      {HINTS.map((hint, i) => (
        <span key={hint.key} className="keyhint-item">
          {i > 0 && (
            <span className="keyhint-sep" aria-hidden="true">
              ·
            </span>
          )}
          <kbd>{hint.key}</kbd>
          {hint.label}
        </span>
      ))}
    </footer>
  )
})

import { useEffect, useState } from 'react'
import { dismiss, subscribeToasts, type Toast } from '../lib/toast'

/**
 * Toast stack. Mounted once at the App root; listens to the module-level
 * event bus in lib/toast.ts. Bottom-right on desktop, bottom-center on
 * phones (the typical reach-with-thumb zone). Click any toast to dismiss
 * early. Self-styling per kind (success / info / error).
 */
export function Toasts() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setItems), [])
  if (items.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 right-3 z-[60] flex flex-col items-stretch gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[min(22rem,calc(100vw-3rem))]"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-left text-sm shadow-[var(--shadow-soft)] backdrop-blur-xl transition-opacity ${palette(
            t.kind,
          )}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}

function palette(kind: Toast['kind']): string {
  switch (kind) {
    case 'success':
      return 'border-[var(--mint-deep)] bg-[var(--mint-soft)] text-[var(--mint-deep)]'
    case 'error':
      return 'border-[var(--error)] bg-[var(--paper)] text-[var(--error)]'
    case 'info':
    default:
      return 'border-[var(--line-strong)] bg-[var(--paper)] text-[var(--ink)]'
  }
}

/**
 * Tiny event-bus-backed toast system. No React Context, no Provider —
 * just module-level state with a subscribe API. The Toasts component
 * (mounted once in App.tsx) listens; any code can call toast.error(...)
 * from anywhere (handlers, hooks, async callbacks) without prop drilling.
 *
 * Toasts dismiss automatically after `durationMs` (default depends on
 * kind: errors stick around longer than success). Click to dismiss early.
 */
export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  text: string
  durationMs: number
}

type Listener = (next: Toast[]) => void

let queue: Toast[] = []
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(queue)
}

function push(t: Omit<Toast, 'id'>): string {
  const id = Math.random().toString(36).slice(2, 10)
  queue = [...queue, { id, ...t }]
  emit()
  if (t.durationMs > 0) {
    setTimeout(() => dismiss(id), t.durationMs)
  }
  return id
}

export function dismiss(id: string): void {
  const next = queue.filter((t) => t.id !== id)
  if (next.length === queue.length) return
  queue = next
  emit()
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn)
  fn(queue) // hydrate with current
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Default durations — success messages clear quickly so the user moves
 * on; errors linger so they're not missed mid-interaction; info sits
 * in the middle.
 */
const DEFAULTS: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  error: 6000,
}

export const toast = {
  info: (text: string, durationMs = DEFAULTS.info) => push({ kind: 'info', text, durationMs }),
  success: (text: string, durationMs = DEFAULTS.success) =>
    push({ kind: 'success', text, durationMs }),
  error: (text: string, durationMs = DEFAULTS.error) =>
    push({ kind: 'error', text, durationMs }),
}

import { useEffect } from 'react'

export interface ShortcutHandlers {
  onNewCard?: () => void
  onSearch?: () => void
  onHelp?: () => void
}

/**
 * Global keyboard shortcuts for the board view.
 * Only fires when no input/textarea is focused (avoids hijacking typing).
 *
 * - `n` → add a new card
 * - `/` → focus the search input
 * - `?` → show shortcuts help
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'n':
          e.preventDefault()
          handlers.onNewCard?.()
          break
        case '/':
          e.preventDefault()
          handlers.onSearch?.()
          break
        case '?':
          e.preventDefault()
          handlers.onHelp?.()
          break
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}

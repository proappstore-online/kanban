import { useEffect } from 'react'

/**
 * Wire a callback to the Escape key while a component is mounted. Every
 * modal / drawer in the app needs the same listener; extracting the
 * boilerplate into one hook keeps each consumer to a single line and
 * makes the pattern grep-able.
 */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])
}

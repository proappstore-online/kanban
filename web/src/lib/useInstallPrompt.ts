import { useEffect, useState } from 'react'

/**
 * Chrome / Edge / Android browsers fire a `beforeinstallprompt` event when
 * the page is install-eligible. We capture it, call `preventDefault()` so
 * the default banner doesn't appear, and stash the event for later. The
 * Install button calls `prompt()` on it at user-gesture time.
 *
 * iOS Safari doesn't fire this event — users add the app via the share
 * menu manually — so `canInstall` is `false` there and the button is
 * hidden (per `display-mode: standalone` once installed, also hidden).
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Already installed (Chrome standalone / iOS standalone via legacy
    // navigator.standalone). If we're inside the PWA, no need to prompt.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari sets navigator.standalone when running as a PWA.
      (navigator as { standalone?: boolean }).standalone === true
    if (isStandalone) setInstalled(true)

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const outcome = await deferred.userChoice
    if (outcome.outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  return {
    canInstall: !!deferred && !installed,
    installed,
    install,
  }
}

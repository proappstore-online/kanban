import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@proappstore/sdk'
import { app } from '../lib/app'
import { useInstallPrompt } from '../lib/useInstallPrompt'

interface TopBarProps {
  user: User
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

/**
 * Sticky top bar with three flex slots: left (back-button + brand), center
 * (page title), right (page-specific actions). The user identity + sign-out
 * collapse into a kebab menu under sm so the right slot has room for the
 * page-specific actions on phones.
 */
export function TopBar({ user, left, center, right }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--glass-strong)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1540px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {left}
          <a
            href="#"
            className="display-font shrink-0 text-lg font-bold tracking-tight text-[var(--ink)] no-underline"
          >
            kanban
          </a>
        </div>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-medium text-[var(--ink)]">
          {center}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {right}
          <InstallButton />
          <AccountMenu user={user} />
        </div>
      </div>
    </header>
  )
}

/**
 * @login chip + Sign out, collapsed into a kebab on small screens so the
 * page-specific right-slot actions don't crowd the top bar on phones.
 */
function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <>
      {/* Desktop: inline chip + sign out */}
      <span className="hidden text-xs text-[var(--muted)] sm:inline">@{user.login}</span>
      <button
        onClick={() => app.auth.signOut()}
        className="hidden rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] sm:inline-block"
      >
        Sign out
      </button>

      {/* Mobile: kebab dropdown */}
      <div ref={wrapRef} className="relative sm:hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Account menu"
          aria-haspopup="true"
          aria-expanded={open}
          className="flex size-8 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--glass)] text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.login} className="size-8 rounded-full object-cover" />
          ) : (
            <span className="text-xs font-semibold">
              {user.login[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full z-40 mt-2 w-44 rounded-2xl border border-[var(--line)] bg-[var(--paper)] py-2 shadow-[var(--shadow-soft)]">
            <div className="px-4 pb-2 text-xs text-[var(--muted)]">
              @{user.login}
            </div>
            <button
              onClick={() => {
                setOpen(false)
                app.auth.signOut()
              }}
              className="block w-full px-4 py-2 text-left text-sm text-[var(--error)] hover:bg-[var(--paper-deep)]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Captures the browser's `beforeinstallprompt` event and surfaces an
 * Install button when the app isn't already running as a PWA. Hidden on
 * unsupported browsers (Safari iOS exposes Add to Home Screen only via
 * Share menu, which we can't trigger).
 */
function InstallButton() {
  const { canInstall, install } = useInstallPrompt()
  if (!canInstall) return null
  return (
    <button
      onClick={install}
      className="hidden rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-deep)] hover:opacity-80 sm:inline-block"
    >
      Install app
    </button>
  )
}

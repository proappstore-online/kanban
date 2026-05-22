import type { ReactNode } from 'react'
import type { User } from '@proappstore/sdk'
import { useInstallPrompt } from '../lib/useInstallPrompt'

interface TopBarProps {
  user: User
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  /** When set, shows a gear icon linking to workspace settings. */
  settingsHref?: string
}

/**
 * Sticky top bar with three flex slots: left (back-button + brand), center
 * (page title), right (page-specific actions). The user identity + sign-out
 * collapse into a kebab menu under sm so the right slot has room for the
 * page-specific actions on phones.
 */
export function TopBar({ user, left, center, right, settingsHref }: TopBarProps) {
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
          {settingsHref && <SettingsIcon href={settingsHref} />}
          <AccountMenu user={user} />
        </div>
      </div>
    </header>
  )
}

function SettingsIcon({ href }: { href: string }) {
  return (
    <a
      href={href}
      aria-label="Workspace settings"
      title="Settings"
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-[18px]">
        <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.179.971.405 1.416.67l1.405-.586a1 1 0 0 1 1.216.356l.68 1.178a1 1 0 0 1-.236 1.26l-1.11.887a7 7 0 0 1 0 1.316l1.11.887a1 1 0 0 1 .236 1.26l-.68 1.178a1 1 0 0 1-1.216.356l-1.405-.586a7 7 0 0 1-1.416.67l-.295 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a7 7 0 0 1-1.416-.67l-1.405.586a1 1 0 0 1-1.216-.356l-.68-1.178a1 1 0 0 1 .236-1.26l1.11-.887a7 7 0 0 1 0-1.316l-1.11-.887a1 1 0 0 1-.236-1.26l.68-1.178a1 1 0 0 1 1.216-.356l1.405.586a7 7 0 0 1 1.416-.67l.295-1.473ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
      </svg>
    </a>
  )
}

/** Clickable avatar that navigates to the profile page. */
function AccountMenu({ user }: { user: User }) {
  return (
    <a
      href="#/profile"
      aria-label="Profile"
      className="flex size-8 shrink-0 items-center justify-center rounded-full ring-2 ring-transparent hover:ring-[var(--line-strong)] transition-shadow"
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.login} className="size-8 rounded-full object-cover" />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-deep)]">
          {user.login[0]?.toUpperCase() ?? '?'}
        </span>
      )}
    </a>
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

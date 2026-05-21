import type { ReactNode } from 'react'
import type { User } from '@proappstore/sdk'
import { app } from '../lib/app'

interface TopBarProps {
  user: User
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

export function TopBar({ user, left, center, right }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--glass-strong)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1540px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
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
          <span className="hidden text-xs text-[var(--muted)] sm:inline">@{user.login}</span>
          <button
            onClick={() => app.auth.signOut()}
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

import { app } from '../lib/app'

export function SignIn() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-[var(--glass-strong)] p-8 text-center shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <h1 className="display-font text-3xl font-bold text-[var(--ink)]">Kanban Pro</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Team boards with real-time collaboration. Sign in to get started.
        </p>
        <button
          onClick={() => app.auth.signIn()}
          className="mt-6 w-full rounded-2xl bg-[var(--ink)] py-3 text-sm font-semibold text-[var(--paper)] hover:opacity-90"
        >
          Sign in with GitHub
        </button>
        <p className="mt-6 text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
          Part of{' '}
          <a
            href="https://proappstore.online"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--ink)]"
          >
            ProAppStore
          </a>
          {' · '}
          <span title="Worker custom domain attached via the platform's deploy_worker step">
            data on data-kanban.proappstore.online
          </span>
        </p>
      </div>
    </div>
  )
}

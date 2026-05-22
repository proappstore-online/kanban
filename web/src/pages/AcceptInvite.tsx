import { useEffect, useState } from 'react'
import { redeemInvite } from '../lib/db'
import type { Workspace } from '../types'

interface AcceptInviteProps {
  code: string
  onJoined: (workspace: Workspace) => void
}

type State =
  | { kind: 'pending' }
  | { kind: 'ok'; name: string }
  | { kind: 'bad' }

export function AcceptInvite({ code, onJoined }: AcceptInviteProps) {
  const [state, setState] = useState<State>({ kind: 'pending' })

  useEffect(() => {
    let cancelled = false
    redeemInvite(code)
      .then((ws) => {
        if (cancelled) return
        if (!ws) {
          setState({ kind: 'bad' })
          return
        }
        setState({ kind: 'ok', name: ws.name })
        // Brief pause so the user sees what they joined.
        setTimeout(() => onJoined(ws), 600)
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'bad' })
      })
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-[var(--glass-strong)] p-8 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        {state.kind === 'pending' && (
          <p className="text-sm text-[var(--muted)]">Accepting invite…</p>
        )}
        {state.kind === 'ok' && (
          <>
            <h1 className="display-font text-2xl font-bold text-[var(--ink)]">
              You've joined
            </h1>
            <p className="mt-3 text-sm text-[var(--ink)]">{state.name}</p>
          </>
        )}
        {state.kind === 'bad' && (
          <>
            <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Invite invalid</h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              This link has expired, already been used, or doesn't exist. Ask the workspace owner
              for a new one.
            </p>
            <button
              onClick={() => (location.hash = '')}
              className="mt-6 rounded-full border border-[var(--line-strong)] px-4 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              ← Your workspaces
            </button>
          </>
        )}
      </div>
    </div>
  )
}

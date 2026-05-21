import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import { app } from './lib/app'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'
import { Workspaces } from './pages/Workspaces'
import { Boards } from './pages/Boards'
import { Board } from './pages/Board'
import { Settings } from './pages/Settings'
import { AcceptInvite } from './pages/AcceptInvite'
import { listMyWorkspaces } from './lib/db'
import type { WorkspaceWithRole } from './types'

type Route =
  | { name: 'workspaces' }
  | { name: 'boards'; tenantId: string }
  | { name: 'board'; tenantId: string; boardId: string }
  | { name: 'settings'; tenantId: string }
  | { name: 'invite'; code: string }

function parseHash(): Route {
  const h = location.hash
  let m = h.match(/^#\/w\/([\w-]+)\/board\/([\w-]+)$/)
  if (m) return { name: 'board', tenantId: m[1], boardId: m[2] }
  m = h.match(/^#\/w\/([\w-]+)\/settings$/)
  if (m) return { name: 'settings', tenantId: m[1] }
  m = h.match(/^#\/w\/([\w-]+)$/)
  if (m) return { name: 'boards', tenantId: m[1] }
  m = h.match(/^#\/invite\/([\w-]+)$/)
  if (m) return { name: 'invite', code: m[1] }
  return { name: 'workspaces' }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [route, setRoute] = useState<Route>(parseHash())
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[] | null>(null)

  useEffect(() => {
    let cancelled = false
    app.auth.init().finally(() => {
      if (cancelled) return
      setRoute(parseHash())
      setReady(true)
    })
    const unsub = app.auth.onChange((u) => setUser(u))
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => {
      cancelled = true
      unsub()
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  // Refetch workspace list whenever auth changes or route returns to the picker.
  const atWorkspacesRoute = route.name === 'workspaces'
  useEffect(() => {
    if (!user) {
      setWorkspaces(null)
      return
    }
    let cancelled = false
    listMyWorkspaces()
      .then((ws) => {
        if (!cancelled) setWorkspaces(ws)
      })
      .catch(() => {
        if (!cancelled) setWorkspaces([])
      })
    return () => {
      cancelled = true
    }
  }, [user, atWorkspacesRoute])

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    )
  }
  if (!user) return <SignIn />

  // Invite route is reachable before workspace membership is known.
  if (route.name === 'invite') {
    return (
      <AcceptInvite
        code={route.code}
        onJoined={(tenantId) => {
          location.hash = `#/w/${tenantId}`
        }}
      />
    )
  }

  if (workspaces === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    )
  }

  if (workspaces.length === 0) {
    return (
      <Onboarding
        user={user}
        onCreated={(ws) => {
          setWorkspaces([{ ...ws, role: 'owner' }])
          location.hash = `#/w/${ws.id}`
        }}
      />
    )
  }

  if (route.name === 'workspaces') {
    return (
      <Workspaces
        user={user}
        workspaces={workspaces}
        onOpen={(id) => (location.hash = `#/w/${id}`)}
        onCreated={(ws) => {
          setWorkspaces((prev) => [{ ...ws, role: 'owner' }, ...(prev ?? [])])
          location.hash = `#/w/${ws.id}`
        }}
      />
    )
  }

  if (route.name === 'boards') {
    const ws = workspaces.find((w) => w.id === route.tenantId)
    if (!ws) return <NotInWorkspace />
    return (
      <Boards
        user={user}
        workspace={ws}
        onOpen={(boardId) => (location.hash = `#/w/${ws.id}/board/${boardId}`)}
        onSettings={() => (location.hash = `#/w/${ws.id}/settings`)}
        onSwitch={() => (location.hash = '')}
      />
    )
  }

  if (route.name === 'settings') {
    const ws = workspaces.find((w) => w.id === route.tenantId)
    if (!ws) return <NotInWorkspace />
    return <Settings user={user} workspace={ws} onBack={() => (location.hash = `#/w/${ws.id}`)} />
  }

  if (route.name === 'board') {
    const ws = workspaces.find((w) => w.id === route.tenantId)
    if (!ws) return <NotInWorkspace />
    return (
      <Board
        boardId={route.boardId}
        user={user}
        workspace={ws}
        onBack={() => (location.hash = `#/w/${ws.id}`)}
      />
    )
  }

  return null
}

function NotInWorkspace() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6 text-center">
      <div>
        <p className="text-[var(--muted)]">
          You're not a member of this workspace, or it no longer exists.
        </p>
        <button
          onClick={() => (location.hash = '')}
          className="mt-4 rounded-full border border-[var(--line-strong)] px-4 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
        >
          ← All workspaces
        </button>
      </div>
    </div>
  )
}

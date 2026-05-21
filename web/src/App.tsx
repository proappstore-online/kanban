import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import { app } from './lib/app'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'
import { Workspaces } from './pages/Workspaces'
import { Boards } from './pages/Boards'
import { Board } from './pages/Board'
import { Settings } from './pages/Settings'
import { MyTasks } from './pages/MyTasks'
import { AcceptInvite } from './pages/AcceptInvite'
import { listMyWorkspaces } from './lib/db'
import type { WorkspaceWithRole } from './types'

/**
 * Hash routes use a `workspaceRef` that can be either a slug
 * (`acme-marketing-zx7y`) or the raw UUID (back-compat with v1 URLs). We
 * resolve refs to the WorkspaceWithRole at render time and rewrite the URL
 * to use the slug, so any shared link stabilises onto the human-readable
 * form within one navigation.
 */
type Route =
  | { name: 'workspaces' }
  | { name: 'boards'; workspaceRef: string }
  | { name: 'board'; workspaceRef: string; boardId: string; cardId?: string }
  | { name: 'settings'; workspaceRef: string }
  | { name: 'my-tasks'; workspaceRef: string }
  | { name: 'invite'; code: string }

function parseHash(): Route {
  const h = location.hash
  // `/card/<id>` is an optional suffix on the board route. Captured here so
  // the Board page can open the corresponding modal on load; combined with
  // the slug-based URL rewriter further down this makes any view of any
  // card paste-shareable.
  let m = h.match(/^#\/w\/([^/]+)\/board\/([\w-]+)\/card\/([\w-]+)$/)
  if (m)
    return {
      name: 'board',
      workspaceRef: decodeURIComponent(m[1]),
      boardId: m[2],
      cardId: m[3],
    }
  m = h.match(/^#\/w\/([^/]+)\/board\/([\w-]+)$/)
  if (m) return { name: 'board', workspaceRef: decodeURIComponent(m[1]), boardId: m[2] }
  m = h.match(/^#\/w\/([^/]+)\/settings$/)
  if (m) return { name: 'settings', workspaceRef: decodeURIComponent(m[1]) }
  m = h.match(/^#\/w\/([^/]+)\/my$/)
  if (m) return { name: 'my-tasks', workspaceRef: decodeURIComponent(m[1]) }
  m = h.match(/^#\/w\/([^/]+)$/)
  if (m) return { name: 'boards', workspaceRef: decodeURIComponent(m[1]) }
  m = h.match(/^#\/invite\/([\w-]+)$/)
  if (m) return { name: 'invite', code: m[1] }
  return { name: 'workspaces' }
}

/** Match by slug first (preferred URL form), fall back to id (legacy links). */
function findWorkspace(
  workspaces: WorkspaceWithRole[],
  ref: string,
): WorkspaceWithRole | undefined {
  return workspaces.find((w) => w.slug === ref) ?? workspaces.find((w) => w.id === ref)
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

  // Self-heal the URL: if the user hit a UUID-based link, rewrite to the
  // slug form so the next share is human-readable. `history.replaceState`
  // keeps the back-button history clean.
  useEffect(() => {
    if (!workspaces) return
    if (route.name === 'workspaces' || route.name === 'invite') return
    const ws = findWorkspace(workspaces, route.workspaceRef)
    if (!ws || ws.slug === route.workspaceRef) return
    const replaced = location.hash.replace(
      new RegExp(`^#/w/${escapeRegex(route.workspaceRef)}`),
      `#/w/${ws.slug}`,
    )
    history.replaceState(null, '', `${location.pathname}${location.search}${replaced}`)
    setRoute(parseHash())
  }, [workspaces, route])

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
        onJoined={(ws) => {
          location.hash = `#/w/${ws.slug}`
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
          location.hash = `#/w/${ws.slug}`
        }}
      />
    )
  }

  if (route.name === 'workspaces') {
    return (
      <Workspaces
        user={user}
        workspaces={workspaces}
        onOpen={(slug) => (location.hash = `#/w/${slug}`)}
        onCreated={(ws) => {
          setWorkspaces((prev) => [{ ...ws, role: 'owner' }, ...(prev ?? [])])
          location.hash = `#/w/${ws.slug}`
        }}
      />
    )
  }

  if (route.name === 'boards') {
    const ws = findWorkspace(workspaces, route.workspaceRef)
    if (!ws) return <NotInWorkspace />
    return (
      <Boards
        user={user}
        workspace={ws}
        onOpen={(boardId) => (location.hash = `#/w/${ws.slug}/board/${boardId}`)}
        onSettings={() => (location.hash = `#/w/${ws.slug}/settings`)}
        onSwitch={() => (location.hash = '')}
        onMyTasks={() => (location.hash = `#/w/${ws.slug}/my`)}
      />
    )
  }

  if (route.name === 'settings') {
    const ws = findWorkspace(workspaces, route.workspaceRef)
    if (!ws) return <NotInWorkspace />
    return (
      <Settings
        user={user}
        workspace={ws}
        onBack={() => (location.hash = `#/w/${ws.slug}`)}
        onLeft={() => {
          setWorkspaces((prev) => prev?.filter((w) => w.id !== ws.id) ?? null)
          location.hash = ''
        }}
      />
    )
  }

  if (route.name === 'my-tasks') {
    const ws = findWorkspace(workspaces, route.workspaceRef)
    if (!ws) return <NotInWorkspace />
    return (
      <MyTasks
        user={user}
        workspace={ws}
        onBack={() => (location.hash = `#/w/${ws.slug}`)}
        onOpenBoard={(boardId) => (location.hash = `#/w/${ws.slug}/board/${boardId}`)}
      />
    )
  }

  if (route.name === 'board') {
    const ws = findWorkspace(workspaces, route.workspaceRef)
    if (!ws) return <NotInWorkspace />
    return (
      <Board
        boardId={route.boardId}
        initialCardId={route.cardId}
        user={user}
        workspace={ws}
        onBack={() => (location.hash = `#/w/${ws.slug}`)}
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

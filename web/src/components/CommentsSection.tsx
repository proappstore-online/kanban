import { useMemo, useRef, useState } from 'react'
import type { Comment, Member } from '../types'

interface CommentsSectionProps {
  comments: Comment[]
  members: Member[]
  selfUserId: string
  onPost: (body: string) => Promise<void> | void
  onDelete: (commentId: string) => Promise<void> | void
}

/**
 * Comments thread + composer inside CardModal.
 *
 * Composer supports a lightweight `@` autocomplete that surfaces matching
 * workspace members. Picking a member inserts `@<displayName> ` at the
 * caret. The body is otherwise plain text; mention extraction happens
 * server-side (lib/db.parseMentions) — the UI here just helps the user
 * type the right token.
 */
export function CommentsSection({
  comments,
  members,
  selfUserId,
  onPost,
  onDelete,
}: CommentsSectionProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention autocomplete: detect `@partial` at the caret. When matched,
  // overlay a small dropdown of candidates below the textarea. Arrow-key
  // navigation kept simple — click or Enter on the highlighted row picks.
  const [acState, setAcState] = useState<{
    open: boolean
    query: string
    /** Caret position of the `@` so we know what range to replace. */
    atIndex: number
    selectedIndex: number
  }>({ open: false, query: '', atIndex: 0, selectedIndex: 0 })

  const candidates = useMemo(() => {
    if (!acState.open) return []
    const q = acState.query.toLowerCase()
    return members
      .filter(
        (m) =>
          m.userId !== selfUserId &&
          (q === '' ||
            m.displayName.toLowerCase().startsWith(q) ||
            m.displayName.toLowerCase().includes(q)),
      )
      .slice(0, 6)
  }, [acState.open, acState.query, members, selfUserId])

  function onDraftChange(value: string, caret: number) {
    setDraft(value)
    // Look back from the caret for `@<word>` with no whitespace inside.
    const before = value.slice(0, caret)
    const m = before.match(/(?:^|\s)@([A-Za-z0-9-]{0,39})$/)
    if (m) {
      const atIndex = caret - m[1].length - 1
      setAcState({ open: true, query: m[1], atIndex, selectedIndex: 0 })
    } else if (acState.open) {
      setAcState((s) => ({ ...s, open: false }))
    }
  }

  function pick(member: Member) {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart
    const before = draft.slice(0, acState.atIndex)
    const after = draft.slice(caret)
    const inserted = `@${member.displayName} `
    const next = before + inserted + after
    setDraft(next)
    setAcState({ open: false, query: '', atIndex: 0, selectedIndex: 0 })
    // Restore focus + caret position after the inserted token.
    queueMicrotask(() => {
      ta.focus()
      const pos = before.length + inserted.length
      ta.setSelectionRange(pos, pos)
    })
  }

  async function post() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await onPost(body)
      setDraft('')
      setAcState({ open: false, query: '', atIndex: 0, selectedIndex: 0 })
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (acState.open && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcState((s) => ({
          ...s,
          selectedIndex: Math.min(s.selectedIndex + 1, candidates.length - 1),
        }))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcState((s) => ({ ...s, selectedIndex: Math.max(s.selectedIndex - 1, 0) }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(candidates[acState.selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAcState((s) => ({ ...s, open: false }))
        return
      }
    }
    // ⌘/Ctrl-Enter posts. Plain Enter inserts a newline (standard chat UX).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      post()
    }
  }

  return (
    <div>
      <ul className="mt-3 space-y-3">
        {comments.length === 0 ? (
          <li className="text-xs text-[var(--muted)]">No comments yet — start the conversation.</li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar name={c.authorDisplayName} url={c.authorAvatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-[var(--ink)]">
                    {c.authorDisplayName}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {formatTime(c.createdAt)}
                  </span>
                  {c.authorId === selfUserId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Delete this comment?')) onDelete(c.id)
                      }}
                      className="ml-auto rounded-full px-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--error)]"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <CommentBody body={c.body} members={members} />
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="relative mt-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) =>
            onDraftChange(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }
          onKeyUp={(e) =>
            onDraftChange(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }
          onClick={(e) =>
            onDraftChange(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }
          onKeyDown={onKeyDown}
          placeholder="Write a comment… type @ to mention. ⌘+Enter to post."
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] p-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--line-strong)]"
        />
        {acState.open && candidates.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)]">
            {candidates.map((m, idx) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(m)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    idx === acState.selectedIndex ? 'bg-[var(--paper-deep)]' : ''
                  } hover:bg-[var(--paper-deep)]`}
                >
                  <Avatar name={m.displayName} url={m.avatarUrl} />
                  <span className="text-[var(--ink)]">@{m.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || busy}
          className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-xs font-semibold text-[var(--paper)] disabled:opacity-40"
        >
          {busy ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </div>
  )
}

/**
 * Render a comment body: preserve newlines, autolink URLs, highlight
 * `@login` tokens that resolve to a member.
 */
function CommentBody({ body, members }: { body: string; members: Member[] }) {
  const memberLogins = useMemo(
    () => new Set(members.map((m) => m.displayName.toLowerCase())),
    [members],
  )
  // Split into tokens: URLs, @logins, plain text. Cheap regex pass —
  // good enough for inline rendering of v1 comments.
  const tokens = useMemo(() => {
    const out: { kind: 'text' | 'mention' | 'url'; value: string }[] = []
    const re = /(https?:\/\/[^\s]+)|((?:^|[^A-Za-z0-9_])@[A-Za-z0-9-]{1,39})/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      if (m.index > last) out.push({ kind: 'text', value: body.slice(last, m.index) })
      if (m[1]) {
        out.push({ kind: 'url', value: m[1] })
        last = re.lastIndex
      } else if (m[2]) {
        // The mention regex includes the leading non-word boundary char (or
        // empty at start). Keep the prefix as text and the @login as a
        // mention token.
        const raw = m[2]
        const at = raw.indexOf('@')
        if (at > 0) out.push({ kind: 'text', value: raw.slice(0, at) })
        const login = raw.slice(at + 1)
        if (memberLogins.has(login.toLowerCase())) {
          out.push({ kind: 'mention', value: login })
        } else {
          out.push({ kind: 'text', value: `@${login}` })
        }
        last = re.lastIndex
      }
    }
    if (last < body.length) out.push({ kind: 'text', value: body.slice(last) })
    return out
  }, [body, memberLogins])

  return (
    <div className="whitespace-pre-wrap break-words text-sm text-[var(--ink)]">
      {tokens.map((t, i) => {
        if (t.kind === 'mention') {
          return (
            <span
              key={i}
              className="rounded bg-[var(--accent-soft)] px-1 text-[var(--accent-deep)]"
            >
              @{t.value}
            </span>
          )
        }
        if (t.kind === 'url') {
          return (
            <a
              key={i}
              href={t.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--sky-deep)] underline"
            >
              {t.value}
            </a>
          )
        }
        return <span key={i}>{t.value}</span>
      })}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return <img src={url} alt={name} className="size-7 shrink-0 rounded-full object-cover" />
  }
  const initial = name[0]?.toUpperCase() ?? '?'
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-deep)]">
      {initial}
    </span>
  )
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

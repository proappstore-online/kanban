import { useMemo, useState } from 'react'
import type { Assignee, Member } from '../types'

interface MemberPickerProps {
  members: Member[]
  selected: Assignee[]
  onToggle: (member: Member) => void
}

/**
 * Compact searchable list of workspace members for assigning to a card.
 * Selected members render with a checkmark; click to toggle.
 */
export function MemberPicker({ members, selected, onToggle }: MemberPickerProps) {
  const [query, setQuery] = useState('')
  const selectedIds = useMemo(() => new Set(selected.map((s) => s.userId)), [selected])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q),
    )
  }, [members, query])

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members…"
        aria-label="Search workspace members"
        className="w-full rounded-t-2xl bg-transparent px-3 py-2 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
      />
      <ul className="max-h-48 overflow-y-auto border-t border-[var(--line)]">
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-center text-xs text-[var(--muted)]">No members</li>
        ) : (
          filtered.map((m) => {
            const isSelected = selectedIds.has(m.userId)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onToggle(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--paper-deep)]"
                >
                  <Avatar name={m.displayName} url={m.avatarUrl} />
                  <span className="min-w-0 flex-1 truncate text-[var(--ink)]">
                    {m.displayName}
                  </span>
                  {isSelected && (
                    <span className="text-[var(--mint-deep)]" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return <img src={url} alt={name} className="size-6 shrink-0 rounded-full object-cover" />
  }
  const initial = name[0]?.toUpperCase() ?? '?'
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent-deep)]">
      {initial}
    </span>
  )
}

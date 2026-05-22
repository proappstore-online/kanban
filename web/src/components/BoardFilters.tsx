import { useEffect, useRef, useState } from 'react'
import type { BoardWithLists, Label, Member } from '../types'

/**
 * Client-side filter state for the board view. `null` on assignee means
 * "no filter"; `'me'` means the current user; otherwise a userId. Labels
 * is a Set of label IDs — any match keeps the card. Status maps to the
 * kind of the card's list.
 */
export interface BoardFilter {
  text: string
  assignee: 'all' | 'unassigned' | 'me' | string // userId
  labelIds: Set<string>
}

export const EMPTY_FILTER: BoardFilter = {
  text: '',
  assignee: 'all',
  labelIds: new Set(),
}

interface BoardFiltersProps {
  board: BoardWithLists
  members: Member[]
  selfUserId: string
  value: BoardFilter
  onChange: (next: BoardFilter) => void
  totalCards: number
  visibleCards: number
}

/**
 * Filter toolbar rendered above the board's list strip. Lives between the
 * TopBar and the DndContext. Active filters show as filled chips; inactive
 * filters show as outlines. Clear button resets to EMPTY_FILTER. The "X of Y
 * cards" counter on the right gives a quick sanity check that the filter
 * isn't accidentally hiding everything.
 */
export function BoardFilters({
  board,
  members,
  selfUserId,
  value,
  onChange,
  totalCards,
  visibleCards,
}: BoardFiltersProps) {
  const labels = boardLabels(board)
  const active = value.assignee !== 'all' || value.labelIds.size > 0 || value.text !== ''
  const me = members.find((m) => m.userId === selfUserId)

  return (
    <div className="border-b border-[var(--line)] bg-[var(--glass)]/40 px-2 py-2 sm:px-6">
      <div className="mx-auto flex max-w-[1540px] flex-wrap items-center gap-2 text-xs">
        <input
          type="text"
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder="Search cards…"
          aria-label="Search cards"
          className="w-28 min-w-0 rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:w-40 focus:border-[var(--line-strong)] transition-[width] sm:w-36 sm:focus:w-48"
        />
        <AssigneePicker
          members={members}
          me={me}
          value={value.assignee}
          onChange={(a) => onChange({ ...value, assignee: a })}
        />
        {labels.length > 0 && (
          <LabelMultiPicker
            labels={labels}
            value={value.labelIds}
            onChange={(next) => onChange({ ...value, labelIds: next })}
          />
        )}
        {active && (
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[var(--muted)]">
          {active ? `${visibleCards} of ${totalCards} cards` : `${totalCards} cards`}
        </span>
      </div>
    </div>
  )
}

function AssigneePicker({
  members,
  me,
  value,
  onChange,
}: {
  members: Member[]
  me: Member | undefined
  value: BoardFilter['assignee']
  onChange: (next: BoardFilter['assignee']) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isActive = value !== 'all'
  const label =
    value === 'all'
      ? 'Anyone'
      : value === 'me'
      ? `Me (@${me?.displayName ?? '…'})`
      : value === 'unassigned'
      ? 'Unassigned'
      : `@${members.find((m) => m.userId === value)?.displayName ?? '…'}`

  function pick(next: BoardFilter['assignee']) {
    onChange(next)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full px-3 py-1 ${
          isActive
            ? 'bg-[var(--ink)] text-[var(--paper)]'
            : 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
        }`}
      >
        <span>Assignee: {label}</span>
        <span aria-hidden className="text-[8px]">
          ▾
        </span>
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-[var(--shadow-soft)]">
          <Row label="Anyone" active={value === 'all'} onClick={() => pick('all')} />
          {me && (
            <Row
              label={`Me (@${me.displayName})`}
              active={value === 'me'}
              onClick={() => pick('me')}
            />
          )}
          <Row
            label="Unassigned"
            active={value === 'unassigned'}
            onClick={() => pick('unassigned')}
          />
          <li className="my-1 border-t border-[var(--line)]" aria-hidden />
          {members
            .filter((m) => m.userId !== me?.userId)
            .map((m) => (
              <Row
                key={m.id}
                label={`@${m.displayName}`}
                active={value === m.userId}
                onClick={() => pick(m.userId)}
              />
            ))}
        </ul>
      )}
    </div>
  )
}

function Row({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-[var(--paper-deep)] ${
          active ? 'text-[var(--ink)] font-semibold' : 'text-[var(--muted)]'
        }`}
      >
        <span>{label}</span>
        {active && <span aria-hidden>✓</span>}
      </button>
    </li>
  )
}

function LabelMultiPicker({
  labels,
  value,
  onChange,
}: {
  labels: Label[]
  value: Set<string>
  onChange: (next: Set<string>) => void
}) {
  function toggle(id: string) {
    const next = new Set(value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[var(--muted)]">Labels:</span>
      {labels.map((l) => {
        const on = value.has(l.id)
        const styles = labelStyles(l.color)
        return (
          <button
            key={l.id}
            onClick={() => toggle(l.id)}
            className={`inline-flex h-[22px] items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide transition-opacity ${
              on ? '' : 'opacity-40 hover:opacity-80'
            }`}
            style={{ background: styles.bg, color: styles.fg }}
          >
            {l.name || l.color}
          </button>
        )
      })}
    </div>
  )
}

function boardLabels(board: BoardWithLists): Label[] {
  // Deduplicate labels actually in use on this board's cards. The labels
  // table may have more rows than are visibly applied — we only show
  // filterable labels (=ones that would actually narrow the set).
  const byId = new Map<string, Label>()
  for (const list of board.lists) {
    for (const card of list.cards) {
      for (const l of card.labels) {
        if (!byId.has(l.id)) byId.set(l.id, l)
      }
    }
  }
  return Array.from(byId.values())
}

function labelStyles(color: Label['color']): { bg: string; fg: string } {
  switch (color) {
    case 'accent':
      return { bg: 'var(--accent-soft)', fg: 'var(--accent-deep)' }
    case 'sky':
      return { bg: 'var(--sky-soft)', fg: 'var(--sky-deep)' }
    case 'mint':
      return { bg: 'var(--mint-soft)', fg: 'var(--mint-deep)' }
    case 'warning':
      return { bg: 'rgba(198, 134, 42, 0.16)', fg: 'var(--warning)' }
    case 'error':
      return { bg: 'rgba(199, 79, 67, 0.14)', fg: 'var(--error)' }
    case 'muted':
      return { bg: 'var(--line)', fg: 'var(--muted)' }
  }
}

/**
 * Apply a BoardFilter to a card. Returns true if the card should be
 * visible. Pulled out so the board page and any future "filtered view"
 * can share the same predicate.
 */
export function matchesFilter(
  card: { title: string; assignees: { userId: string }[]; labels: { id: string }[] },
  filter: BoardFilter,
  selfUserId: string,
): boolean {
  // Text search — case-insensitive substring match on title
  if (filter.text) {
    if (!card.title.toLowerCase().includes(filter.text.toLowerCase())) return false
  }
  // Assignee
  if (filter.assignee === 'me') {
    if (!card.assignees.some((a) => a.userId === selfUserId)) return false
  } else if (filter.assignee === 'unassigned') {
    if (card.assignees.length > 0) return false
  } else if (filter.assignee !== 'all') {
    if (!card.assignees.some((a) => a.userId === filter.assignee)) return false
  }
  // Labels — match ANY of the selected (OR semantics; common kanban UX)
  if (filter.labelIds.size > 0) {
    const has = card.labels.some((l) => filter.labelIds.has(l.id))
    if (!has) return false
  }
  return true
}

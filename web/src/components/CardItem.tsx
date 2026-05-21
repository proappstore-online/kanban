import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Assignee, Card, LabelColor, ListKind } from '../types'
import { STATUS_KINDS, STATUS_LABEL } from '../types'

interface CardItemProps {
  card: Card
  listKind: ListKind
  onClick: () => void
  /** Optional quick-status changer — pill becomes a dropdown when provided. */
  onChangeStatus?: (next: ListKind) => void
}

export function CardItem({ card, listKind, onClick, onChangeStatus }: CardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', cardId: card.id },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const labels = card.labels ?? []
  const checklist = card.checklist ?? []
  const checkedCount = checklist.filter((i) => i.done).length
  const checklistDone = checklist.length > 0 && checkedCount === checklist.length

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="group cursor-grab touch-none rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3 text-sm text-[var(--ink)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--line-strong)] active:cursor-grabbing"
    >
      {(labels.length > 0 || listKind !== 'other') && (
        <div className="-mt-0.5 mb-2 flex flex-wrap items-center gap-1">
          {listKind !== 'other' && (
            <StatusPill kind={listKind} onChange={onChangeStatus} />
          )}
          {labels.map((l) => (
            <LabelChip key={l.id} color={l.color} name={l.name} />
          ))}
        </div>
      )}

      <div className="font-medium">{card.title}</div>

      {card.description ? (
        <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{card.description}</div>
      ) : null}

      {(card.dueAt !== undefined ||
        card.etaAt !== undefined ||
        checklist.length > 0 ||
        card.commentCount > 0 ||
        card.assignees.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.dueAt !== undefined && <DueChip dueAt={card.dueAt} />}
          {card.etaAt !== undefined && (
            <EtaChip etaAt={card.etaAt} dueAt={card.dueAt} />
          )}
          {checklist.length > 0 && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                checklistDone
                  ? 'bg-[var(--mint-soft)] text-[var(--mint-deep)]'
                  : 'border border-[var(--line)] text-[var(--muted)]'
              }`}
              title={`${checkedCount} of ${checklist.length} done`}
            >
              <span aria-hidden>✓</span>
              {checkedCount}/{checklist.length}
            </span>
          )}
          {card.commentCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]"
              title={`${card.commentCount} comment${card.commentCount === 1 ? '' : 's'}`}
            >
              <span aria-hidden>💬</span>
              {card.commentCount}
            </span>
          )}
          {card.assignees.length > 0 && <AssigneeStack assignees={card.assignees} />}
        </div>
      )}
    </div>
  )
}

function AssigneeStack({ assignees }: { assignees: Assignee[] }) {
  const shown = assignees.slice(0, 3)
  const extra = assignees.length - shown.length
  return (
    <div className="ml-auto flex items-center -space-x-1.5">
      {shown.map((a) => (
        <AssigneeBubble key={a.userId} a={a} />
      ))}
      {extra > 0 && (
        <span
          className="flex size-[18px] items-center justify-center rounded-full border-2 border-[var(--paper)] bg-[var(--paper-deep)] text-[9px] font-semibold text-[var(--muted)]"
          title={assignees
            .slice(3)
            .map((a) => a.displayName)
            .join(', ')}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

function AssigneeBubble({ a }: { a: Assignee }) {
  if (a.avatarUrl) {
    return (
      <img
        src={a.avatarUrl}
        alt={a.displayName}
        title={a.displayName}
        className="size-[18px] rounded-full border-2 border-[var(--paper)] object-cover"
      />
    )
  }
  const initial = a.displayName[0]?.toUpperCase() ?? '?'
  return (
    <span
      className="flex size-[18px] items-center justify-center rounded-full border-2 border-[var(--paper)] bg-[var(--accent-soft)] text-[9px] font-semibold text-[var(--accent-deep)]"
      title={a.displayName}
    >
      {initial}
    </span>
  )
}

function LabelChip({ color, name }: { color: LabelColor; name: string }) {
  const styles = labelStyles(color)
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: styles.bg, color: styles.fg }}
    >
      {name || <span className="block h-1 w-3 rounded-full" style={{ background: styles.fg }} />}
    </span>
  )
}

function DueChip({ dueAt }: { dueAt: number }) {
  const now = Date.now()
  const due = new Date(dueAt)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const dueDay = new Date(dueAt)
  dueDay.setHours(0, 0, 0, 0)
  const daysDelta = Math.round((dueDay.getTime() - startOfToday.getTime()) / 86_400_000)

  let label: string
  let palette: 'overdue' | 'today' | 'soon' | 'later'

  if (dueAt < now && daysDelta < 0) {
    palette = 'overdue'
    label = formatDueLabel(due, daysDelta)
  } else if (daysDelta === 0) {
    palette = 'today'
    label = 'Today'
  } else if (daysDelta <= 2) {
    palette = 'soon'
    label = daysDelta === 1 ? 'Tomorrow' : `In ${daysDelta}d`
  } else {
    palette = 'later'
    label = formatDueLabel(due, daysDelta)
  }

  const styles: Record<'overdue' | 'today' | 'soon' | 'later', CSSProperties> = {
    overdue: { background: 'var(--error)', color: '#fff' },
    today: { background: 'var(--warning)', color: '#000' },
    soon: { background: 'var(--accent-soft)', color: 'var(--accent-deep)' },
    later: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' },
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={styles[palette]}
      title={due.toLocaleString()}
    >
      <span aria-hidden>⏱</span>
      {label}
    </span>
  )
}

function formatDueLabel(d: Date, daysDelta: number): string {
  // Within a week (past or future), prefer the day-name shorthand.
  if (Math.abs(daysDelta) <= 6) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Workflow status as a colored pill — derived from the parent list's `kind`.
 * Lives on the card preview so a team member browsing the My Tasks page or
 * an out-of-list view immediately knows where the card sits in the flow.
 *
 * When `onChange` is provided, the pill becomes a small dropdown menu —
 * tap to pick another status without dragging the card. Critical on mobile
 * (where drag is a hold gesture) and on the My Tasks view (where there's
 * no list strip to drop into).
 */
function StatusPill({
  kind,
  onChange,
}: {
  kind: ListKind
  onChange?: (next: ListKind) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

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

  const palette = statusPalette(kind)
  const style = {
    background: palette.bg,
    color: palette.fg,
  }

  if (!onChange) {
    return (
      <span
        className="inline-flex h-[18px] items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide"
        style={style}
        title={`Status: ${STATUS_LABEL[kind]}`}
      >
        {STATUS_LABEL[kind]}
      </span>
    )
  }

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          // The card itself has an onClick that opens the modal — stop
          // propagation so picking a status doesn't also open the card.
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        // The dnd-kit listeners on the card start a drag on press —
        // stop propagation here so a tap on the pill doesn't initiate
        // one.
        onPointerDown={(e) => e.stopPropagation()}
        className="inline-flex h-[18px] items-center gap-1 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide hover:opacity-90"
        style={style}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Status: ${STATUS_LABEL[kind]} (click to change)`}
      >
        {STATUS_LABEL[kind]}
        <span aria-hidden className="text-[7px]">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[8rem] rounded-xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-[var(--shadow-soft)]"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {STATUS_KINDS.map((k) => {
            const active = k === kind
            const p = statusPalette(k)
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    if (!active) onChange(k)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--paper-deep)] ${
                    active ? 'font-semibold' : ''
                  }`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: p.fg }}
                  />
                  <span className="flex-1 text-[var(--ink)]">{STATUS_LABEL[k]}</span>
                  {active && (
                    <span aria-hidden className="text-[var(--muted)]">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </span>
  )
}

function statusPalette(kind: ListKind): { bg: string; fg: string } {
  switch (kind) {
    case 'new':
      return { bg: 'var(--line)', fg: 'var(--muted)' }
    case 'wip':
      return { bg: 'var(--sky-soft)', fg: 'var(--sky-deep)' }
    case 'testing':
      return { bg: 'rgba(198, 134, 42, 0.16)', fg: 'var(--warning)' }
    case 'launched':
      return { bg: 'var(--mint-soft)', fg: 'var(--mint-deep)' }
    case 'other':
      return { bg: 'var(--line)', fg: 'var(--muted)' }
  }
}

/**
 * ETA chip rendered alongside the due-date chip. When ETA > dueAt the chip
 * goes red ("at risk") — that's the whole point of having two fields: the
 * gap between deadline and current best-estimate is the slip signal.
 */
function EtaChip({ etaAt, dueAt }: { etaAt: number; dueAt?: number }) {
  const atRisk = dueAt !== undefined && etaAt > dueAt
  const d = new Date(etaAt)
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const style: CSSProperties = atRisk
    ? { background: 'var(--error)', color: '#fff' }
    : { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={style}
      title={atRisk ? `ETA ${d.toLocaleString()} — past deadline` : `ETA ${d.toLocaleString()}`}
    >
      <span aria-hidden>🎯</span>
      ETA {label}
    </span>
  )
}

function labelStyles(color: LabelColor): { bg: string; fg: string } {
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

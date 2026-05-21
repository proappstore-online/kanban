import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import type { Assignee, Card, LabelColor } from '../types'

interface CardItemProps {
  card: Card
  onClick: () => void
}

export function CardItem({ card, onClick }: CardItemProps) {
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
      {labels.length > 0 && (
        <div className="-mt-0.5 mb-2 flex flex-wrap gap-1">
          {labels.map((l) => (
            <LabelChip key={l.id} color={l.color} name={l.name} />
          ))}
        </div>
      )}

      <div className="font-medium">{card.title}</div>

      {card.description ? (
        <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{card.description}</div>
      ) : null}

      {(card.dueAt !== undefined || checklist.length > 0 || card.assignees.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.dueAt !== undefined && <DueChip dueAt={card.dueAt} />}
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
          {card.assignees.length > 0 && (
            <AssigneeStack assignees={card.assignees} />
          )}
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

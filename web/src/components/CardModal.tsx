import { useEffect, useRef, useState } from 'react'
import type { Card, ChecklistItem, Comment, Label, LabelColor, Member } from '../types'
import { LABEL_PRESETS } from '../types'
import { useEscape } from '../lib/useEscape'
import { MemberPicker } from './MemberPicker'
import { CommentsSection } from './CommentsSection'

interface CardModalProps {
  card: Card
  members: Member[]
  comments: Comment[]
  selfUserId: string
  onClose: () => void
  onSaveBasics: (patch: {
    title?: string
    description?: string | null
    requirement?: string | null
    acceptanceCriteria?: string | null
    dueAt?: number | null
    etaAt?: number | null
    coverUrl?: string | null
  }) => void
  watching?: boolean
  onToggleWatch?: () => void
  onLabelsChange: (labels: Label[]) => void
  /**
   * Persist a label's display name. Label names are board-scoped — changing
   * one updates every card on the board that uses that label.
   */
  onRenameLabel: (labelId: string, name: string) => void
  onChecklistChange: (items: ChecklistItem[]) => void
  onAssigneeToggle: (member: Member) => void
  onPostComment: (body: string) => Promise<void> | void
  onDeleteComment: (commentId: string) => Promise<void> | void
  /** Soft-archive: card disappears from the live board but stays in D1. */
  onArchive: () => void
  /** Hard-delete: row + children removed. Intended as the secondary action. */
  onDelete: () => void
}

export function CardModal({
  card,
  members,
  comments,
  selfUserId,
  onClose,
  onSaveBasics,
  onLabelsChange,
  onRenameLabel,
  onChecklistChange,
  onAssigneeToggle,
  onPostComment,
  onDeleteComment,
  onArchive,
  onDelete,
  watching,
  onToggleWatch,
}: CardModalProps) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? '')
  const [requirement, setRequirement] = useState(card.requirement ?? '')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(card.acceptanceCriteria ?? '')
  const [dueAt, setDueAt] = useState<number | undefined>(card.dueAt)
  const [etaAt, setEtaAt] = useState<number | undefined>(card.etaAt)
  const [coverUrl, setCoverUrl] = useState(card.coverUrl ?? '')
  const [newItem, setNewItem] = useState('')

  // Snapshots of the basics at open-time, to compute a minimal patch on close
  // (skip the write entirely if nothing changed).
  const initialRef = useRef({
    title: card.title,
    description: card.description ?? '',
    requirement: card.requirement ?? '',
    acceptanceCriteria: card.acceptanceCriteria ?? '',
    dueAt: card.dueAt,
    etaAt: card.etaAt,
    coverUrl: card.coverUrl ?? '',
  })

  useEscape(close)

  function close() {
    const init = initialRef.current
    const patch: {
      title?: string
      description?: string | null
      requirement?: string | null
      acceptanceCriteria?: string | null
      dueAt?: number | null
      etaAt?: number | null
      coverUrl?: string | null
    } = {}
    if (title.trim() && title.trim() !== init.title) patch.title = title.trim()
    if (description !== init.description) patch.description = description.trim() || null
    if (requirement !== init.requirement) patch.requirement = requirement.trim() || null
    if (acceptanceCriteria !== init.acceptanceCriteria)
      patch.acceptanceCriteria = acceptanceCriteria.trim() || null
    if (dueAt !== init.dueAt) patch.dueAt = dueAt ?? null
    if (etaAt !== init.etaAt) patch.etaAt = etaAt ?? null
    if (coverUrl !== init.coverUrl) {
      const trimmed = coverUrl.trim()
      try {
        if (trimmed && new URL(trimmed).protocol !== 'https:') patch.coverUrl = null
        else patch.coverUrl = trimmed || null
      } catch {
        patch.coverUrl = null
      }
    }
    if (Object.keys(patch).length) onSaveBasics(patch)
    onClose()
  }

  function toggleLabel(color: LabelColor) {
    const existing = card.labels.find((l) => l.color === color)
    if (existing) {
      onLabelsChange(card.labels.filter((l) => l.color !== color))
    } else {
      onLabelsChange([
        ...card.labels,
        { id: crypto.randomUUID(), color, name: '' },
      ])
    }
  }

  function addChecklistItem() {
    const t = newItem.trim()
    if (!t) return
    const next: ChecklistItem = {
      id: crypto.randomUUID(),
      text: t,
      done: false,
      position: card.checklist.length,
    }
    onChecklistChange([...card.checklist, next])
    setNewItem('')
  }

  function toggleChecklistItem(id: string) {
    onChecklistChange(card.checklist.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }

  function removeChecklistItem(id: string) {
    onChecklistChange(card.checklist.filter((i) => i.id !== id))
  }

  const checkedCount = card.checklist.filter((i) => i.done).length
  const progressPct = card.checklist.length ? (checkedCount / card.checklist.length) * 100 : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[var(--shadow-soft)] sm:max-h-[85dvh] sm:rounded-3xl"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Card title"
          className="w-full bg-transparent text-lg font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
        />

        <SectionLabel>Assignees</SectionLabel>
        <div className="mt-2">
          <MemberPicker
            members={members}
            selected={card.assignees}
            onToggle={onAssigneeToggle}
          />
        </div>

        <SectionLabel>Labels</SectionLabel>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {LABEL_PRESETS.map(({ color }) => {
            const active = card.labels.find((l) => l.color === color)
            const s = labelStyles(color)
            return (
              <button
                key={color}
                type="button"
                onClick={() => toggleLabel(color)}
                className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide transition-transform hover:scale-105 ${
                  active ? '' : 'opacity-50'
                }`}
                style={{ background: s.bg, color: s.fg }}
                aria-pressed={active != null}
                aria-label={`${color} label`}
              >
                {active?.name || (
                  <span
                    className="block h-1 w-4 rounded-full"
                    style={{ background: s.fg, opacity: active ? 1 : 0.5 }}
                  />
                )}
              </button>
            )
          })}
        </div>
        {card.labels.length > 0 && (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {card.labels.map((l) => (
              <LabelNameInput
                key={l.id}
                label={l}
                onRename={(name) => onRenameLabel(l.id, name)}
              />
            ))}
          </div>
        )}

        <SectionLabel>Dates</SectionLabel>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <DateField
            label="Due date"
            sub="Hard deadline"
            value={dueAt}
            onChange={setDueAt}
          />
          <DateField
            label="ETA"
            sub="Best estimate"
            value={etaAt}
            onChange={setEtaAt}
          />
        </div>
        {etaAt !== undefined && dueAt !== undefined && etaAt > dueAt && (
          <p className="mt-1 text-[11px] text-[var(--error)]">
            ETA is past the due date — at risk.
          </p>
        )}

        <SectionLabel>Cover image</SectionLabel>
        <input
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="Paste an image URL…"
          aria-label="Cover image URL"
          className="mt-2 w-full rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--line-strong)]"
        />
        {coverUrl && (
          <img
            src={coverUrl}
            alt="Cover preview"
            className="mt-2 h-24 w-full rounded-xl object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        {onToggleWatch && (
          <>
            <SectionLabel>Notifications</SectionLabel>
            <button
              onClick={onToggleWatch}
              className={`mt-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                watching
                  ? 'border-[var(--mint)] bg-[var(--mint-soft)] text-[var(--mint-deep)]'
                  : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {watching ? 'Watching — you get notified on all changes' : 'Watch this card'}
            </button>
          </>
        )}

        <SectionLabel>
          Checklist
          {card.checklist.length > 0 && (
            <span className="ml-2 text-[var(--muted)]">
              {checkedCount}/{card.checklist.length}
            </span>
          )}
        </SectionLabel>
        {card.checklist.length > 0 && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
              <div
                className="h-full rounded-full bg-[var(--mint)] transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1.5">
              {card.checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-[var(--paper-deep)]"
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="size-4 cursor-pointer accent-[var(--mint)]"
                  />
                  <span
                    className={`flex-1 text-sm ${item.done ? 'text-[var(--muted)] line-through' : 'text-[var(--ink)]'}`}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    aria-label="Remove item"
                    className="rounded-full px-1.5 text-base leading-none text-[var(--muted)] opacity-40 hover:bg-[var(--paper-deep)] hover:text-[var(--error)] hover:opacity-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addChecklistItem()
              }
            }}
            placeholder="Add an item…"
            aria-label="New checklist item"
            className="flex-1 rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
          />
          <button
            type="button"
            onClick={addChecklistItem}
            disabled={!newItem.trim()}
            className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-[11px] text-[var(--muted)] disabled:opacity-40 enabled:hover:text-[var(--ink)]"
          >
            Add
          </button>
        </div>

        <SectionLabel>Description</SectionLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a more detailed description…"
          aria-label="Card description"
          rows={4}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] p-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--line-strong)]"
        />

        <SectionLabel>Requirement</SectionLabel>
        <textarea
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="What needs to be done? What's the user-visible outcome?"
          aria-label="Card requirement"
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] p-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--line-strong)]"
        />

        <SectionLabel>Acceptance criteria</SectionLabel>
        <textarea
          value={acceptanceCriteria}
          onChange={(e) => setAcceptanceCriteria(e.target.value)}
          placeholder="How do we know this is done? Bullet the checks."
          aria-label="Card acceptance criteria"
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] p-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--line-strong)]"
        />

        <SectionLabel>
          Comments
          {comments.length > 0 && (
            <span className="ml-2 text-[var(--muted)]">{comments.length}</span>
          )}
        </SectionLabel>
        <CommentsSection
          comments={comments}
          members={members}
          selfUserId={selfUserId}
          onPost={onPostComment}
          onDelete={onDeleteComment}
        />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                onClose()
                onArchive()
              }}
              className="rounded-full border border-[var(--line-strong)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
              title="Move to Archived — reversible, keeps history"
            >
              Archive
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    'Permanently delete this card? Comments, mentions, and history are also removed. This cannot be undone — Archive is reversible.',
                  )
                ) {
                  onDelete()
                }
              }}
              className="rounded-full px-3 py-1.5 text-xs text-[var(--error)] hover:bg-[var(--error)]/10"
              title="Hard delete — comments + history removed"
            >
              Delete forever
            </button>
          </div>
          <button
            onClick={close}
            className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-xs font-semibold text-[var(--paper)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
      {children}
    </div>
  )
}

/**
 * Local-draft input for renaming a board-scoped label. We don't propagate
 * every keystroke up to the persist layer — that would issue one DB write
 * per character. Instead, draft locally and fire `onRename` once on blur or
 * Enter, then only if the value has actually changed.
 */
function LabelNameInput({
  label,
  onRename,
}: {
  label: Label
  onRename: (name: string) => void
}) {
  const [draft, setDraft] = useState(label.name)
  // Keep the draft in sync with the persisted value when it changes
  // remotely (e.g. another teammate renamed the label).
  useEffect(() => {
    setDraft(label.name)
  }, [label.name])

  const s = labelStyles(label.color)

  function commit() {
    const next = draft.trim().slice(0, 28)
    if (next === label.name) return
    onRename(next)
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(label.name)
          ;(e.currentTarget as HTMLInputElement).blur()
        }
      }}
      placeholder={`Name this ${label.color} label`}
      aria-label={`Rename ${label.color} label`}
      className="rounded-full border border-[var(--line)] px-3 py-1 text-[11px] outline-none focus:border-[var(--line-strong)]"
      style={{ background: s.bg + '40', color: s.fg }}
      maxLength={28}
    />
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

function toLocalInput(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Datetime field used twice (Due date + ETA). Pulled into its own component
 * so the layout stays consistent and clearing semantics are identical for
 * both. The two-line label lets the user tell the fields apart without
 * tooltips.
 */
function DateField({
  label,
  sub,
  value,
  onChange,
}: {
  label: string
  sub: string
  value: number | undefined
  onChange: (next: number | undefined) => void
}) {
  return (
    <label className="flex flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label} <span className="opacity-60">— {sub}</span>
      </span>
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          value={value !== undefined ? toLocalInput(value) : ''}
          onChange={(e) => {
            const v = e.target.value
            onChange(v ? new Date(v).getTime() : undefined)
          }}
          aria-label={`${label} — ${sub}`}
          className="min-w-0 flex-1 bg-transparent text-xs text-[var(--ink)] outline-none"
        />
        {value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Clear
          </button>
        )}
      </div>
    </label>
  )
}

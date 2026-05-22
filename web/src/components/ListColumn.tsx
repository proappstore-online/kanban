import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Card, List, ListKind } from '../types'
import { CardItem } from './CardItem'

interface ListColumnProps {
  list: List
  onAddCard: (title: string) => void
  onCardClick: (card: Card) => void
  onRename: (title: string) => void
  onDelete: () => void
  /** Move this card to the workflow stage with the given kind on the same board. */
  onQuickStatus?: (card: Card, targetKind: ListKind) => void
  /** Cap the visible cards to this number (default: unlimited). Shows "Show all" when capped. */
  cardCap?: number
}

export function ListColumn({
  list,
  onAddCard,
  onCardClick,
  onRename,
  onDelete,
  onQuickStatus,
  cardCap,
}: ListColumnProps) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(list.title)
  const [expanded, setExpanded] = useState(false)

  const { setNodeRef } = useDroppable({
    id: `list:${list.id}`,
    data: { type: 'list', listId: list.id },
  })

  function commitAdd() {
    const t = newTitle.trim()
    if (t) onAddCard(t)
    setNewTitle('')
    setAdding(false)
  }

  function commitRename() {
    const t = titleDraft.trim()
    if (t && t !== list.title) onRename(t)
    else setTitleDraft(list.title)
    setEditingTitle(false)
  }

  return (
    <div className="flex w-[calc(100vw-2rem)] shrink-0 snap-start flex-col gap-2 rounded-2xl bg-[var(--glass)] p-3 sm:w-72 sm:snap-align-none">
      <div className="flex items-center gap-2 px-1">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setTitleDraft(list.title)
                setEditingTitle(false)
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--ink)] outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--ink)]"
          >
            {list.title}
          </button>
        )}
        <ListBadges list={list} />
        <button
          onClick={() => {
            if (confirm(`Delete list "${list.title}"?`)) onDelete()
          }}
          className="shrink-0 rounded-full px-1 text-xs text-[var(--muted)] hover:text-[var(--error)]"
          aria-label={`Delete ${list.title}`}
        >
          ×
        </button>
      </div>

      <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-[2rem] flex-col gap-2">
          {list.cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-[11px] text-[var(--muted)]">
              Drop a card here, or add one below
            </div>
          ) : (
            <>
              {(cardCap && !expanded ? list.cards.slice(0, cardCap) : list.cards).map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  listKind={list.kind}
                  onClick={() => onCardClick(card)}
                  onChangeStatus={
                    onQuickStatus ? (kind) => onQuickStatus(card, kind) : undefined
                  }
                />
              ))}
              {cardCap && !expanded && list.cards.length > cardCap && (
                <button
                  onClick={() => setExpanded(true)}
                  className="rounded-xl px-2 py-2 text-center text-xs font-medium text-[var(--accent-deep)] hover:bg-[var(--accent-soft)]"
                >
                  Show all {list.cards.length} cards
                </button>
              )}
              {cardCap && expanded && list.cards.length > cardCap && (
                <button
                  onClick={() => setExpanded(false)}
                  className="rounded-xl px-2 py-2 text-center text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Show recent {cardCap} only
                </button>
              )}
            </>
          )}
        </div>
      </SortableContext>

      {adding ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-2">
          <textarea
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                commitAdd()
              }
              if (e.key === 'Escape') {
                setAdding(false)
                setNewTitle('')
              }
            }}
            placeholder="Card title"
            aria-label="New card title"
            rows={2}
            className="resize-none bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />
          <div className="flex gap-2">
            <button
              onClick={commitAdd}
              className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)]"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAdding(false)
                setNewTitle('')
              }}
              className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-xl px-2 py-1.5 text-left text-xs text-[var(--muted)] hover:bg-[var(--glass-hover)] hover:text-[var(--ink)]"
        >
          + Add a card
        </button>
      )}
    </div>
  )
}

/**
 * Compact metadata next to the list title:
 *   - Card count chip (always visible).
 *   - A small red dot if any card in the list is overdue. Surfaces
 *     urgency at the column level so creators see what to look at
 *     without scrolling each list.
 */
function ListBadges({ list }: { list: List }) {
  const now = Date.now()
  const overdue = list.cards.some((c) => c.dueAt !== undefined && c.dueAt < now)
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {overdue && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--error)]"
          aria-label="Has overdue cards"
          title="Has overdue cards"
        />
      )}
      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--paper-deep)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--muted)]">
        {list.cards.length}
      </span>
    </div>
  )
}

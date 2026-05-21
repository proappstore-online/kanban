import type { RoomPeer } from '@proappstore/sdk'

interface PresenceBarProps {
  peers: RoomPeer[]
  selfId: string
}

/**
 * Stack of avatars showing who else is currently looking at this board. The
 * current user is included by the SDK but rendered with a "(you)" tooltip and
 * a slightly different ring so they can identify themselves.
 */
export function PresenceBar({ peers, selfId }: PresenceBarProps) {
  if (peers.length === 0) return null
  const others = peers.filter((p) => p.uid !== selfId)
  const me = peers.find((p) => p.uid === selfId)
  const ordered = me ? [me, ...others] : others
  const shown = ordered.slice(0, 5)
  const extra = ordered.length - shown.length

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-2">
        {shown.map((p) => {
          const isSelf = p.uid === selfId
          const initial = p.login[0]?.toUpperCase() ?? '?'
          return (
            <span
              key={p.uid}
              title={isSelf ? `${p.login} (you)` : p.login}
              className={`flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
                isSelf
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-deep)]'
                  : 'border-[var(--paper)] bg-[var(--mint-soft)] text-[var(--mint-deep)]'
              }`}
            >
              {initial}
            </span>
          )
        })}
        {extra > 0 && (
          <span className="flex size-7 items-center justify-center rounded-full border-2 border-[var(--paper)] bg-[var(--paper-deep)] text-[10px] font-semibold text-[var(--muted)]">
            +{extra}
          </span>
        )}
      </div>
    </div>
  )
}

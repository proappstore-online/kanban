/**
 * Centered "Loading…" placeholder. Reused across the app's many
 * not-yet-ready states (auth init, workspace fetch, board fetch).
 * One source of truth so a styling change (e.g. swap to a spinner)
 * happens in one place.
 */
export function Loading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center text-[var(--muted)]">
      Loading…
    </div>
  )
}

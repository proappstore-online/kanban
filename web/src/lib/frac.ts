/**
 * Fractional indexing for card / list positions.
 *
 * Each list keeps its cards in `position REAL` order. To move a card between
 * two others we pick the midpoint of their positions — no neighbours need to
 * be rewritten. New items at the end use `last + STEP`; new items at the start
 * use `first - STEP`. When two positions get too close to subdivide cleanly,
 * `rebalance` rewrites the whole list to evenly spaced positions.
 *
 * The exact spacing doesn't matter — only the *order* matters. We pick large
 * step (1024) so most ordinary use never needs a rebalance.
 */
const STEP = 1024
const MIN_GAP = 0.0001

/** Position for a single first item in an empty list. */
export function firstPosition(): number {
  return STEP
}

/** Position to insert *between* two existing positions (or at start/end). */
export function between(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return STEP
  if (prev === null && next !== null) return next - STEP
  if (prev !== null && next === null) return prev + STEP
  // Guard against equal positions — offset by MIN_GAP to avoid collapse
  if (prev === next) return prev! + MIN_GAP
  return (prev! + next!) / 2
}

/** True when two positions are so close that subdivision is unsafe. */
export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return false
  return Math.abs(next - prev) < MIN_GAP
}

/** Spread N items evenly across positions for a list rebalance. */
export function evenly(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * STEP)
}

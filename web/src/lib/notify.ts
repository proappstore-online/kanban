import { app } from './app'

/**
 * Send a push notification to a specific user via the platform's
 * peer-to-peer notify endpoint. Fire-and-forget — never throws.
 */
export function notifyUser(
  targetUserId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
): void {
  if (!app.auth.user) return
  // Route through the SDK primitive, which uses the mode-agnostic authenticated
  // transport (bearer or platform-cookie mediation) — no raw token in app code.
  void app.notifications.notifyUser(targetUserId, payload).catch(() => {})
}

import { app } from './app'

/**
 * Send a push notification to a specific user via the platform's
 * peer-to-peer notify endpoint. Fire-and-forget — never throws.
 */
export function notifyUser(
  targetUserId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
): void {
  const token = app.auth.token
  if (!token) return

  fetch('https://api.proappstore.online/v1/notifications/notify-user', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appId: 'kanban',
      targetUserId,
      ...payload,
    }),
  }).catch(() => {})
}

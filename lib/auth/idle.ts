// Sign-out after inactivity (spec A8). The page (components/auth/IdleLogout.tsx)
// watches the user's input and warns before signing her out; the proxy
// (lib/supabase/proxy.ts) is the backstop for a closed tab or a sleeping device.

export const IDLE_TIMEOUT_MS = 10 * 60_000;
export const IDLE_WARNING_MS = 9 * 60_000;

// While she is active the page pings the server at most this often, so the
// server's last-activity time can lag hers by up to this much. Its limit
// allows for that, and it never signs her out before the page would.
export const ACTIVITY_PING_MS = 60_000;
export const SERVER_IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MS + ACTIVITY_PING_MS;

// The server's last-activity time (ms since epoch, the server's clock).
export const ACTIVE_COOKIE = "yw_active";

// /login?reason=idle explains why she is there.
export const IDLE_REASON = "idle";
export const IDLE_LOGIN_PATH = `/login?reason=${IDLE_REASON}`;

// The cookies a sign-out removes: Supabase's session (possibly split into
// .0, .1, …) and the last-activity time.
export function isSessionCookie(name: string) {
  return /^sb-.+-auth-token/.test(name) || name === ACTIVE_COOKIE;
}

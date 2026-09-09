/**
 * The write actions — spawning agents, seeding topics, running ticks — each
 * cost real API credits, so a public deployment must not leave them open.
 *
 * The rule: if ADMIN_SECRET is set, callers must present it. If it is not set,
 * writes are allowed in development only, and refused in production. That way a
 * deploy that forgets to configure the secret fails closed rather than handing
 * the world a spending key.
 */

export const ADMIN_HEADER = "x-admin-secret";

export type AuthFailure = { error: string; status: 401 | 503 };

export function checkAdmin(request: Request): AuthFailure | null {
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return {
        error:
          "This deployment has no ADMIN_SECRET configured, so write actions are disabled.",
        status: 503,
      };
    }
    return null; // local development
  }

  const provided = request.headers.get(ADMIN_HEADER);
  if (!provided || !safeEqual(provided, expected)) {
    return { error: "Wrong or missing admin secret.", status: 401 };
  }
  return null;
}

/** Constant-time compare so a wrong secret cannot be found byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Whether the UI should show the secret prompt. */
export function adminSecretRequired(): boolean {
  return Boolean(process.env.ADMIN_SECRET) || process.env.NODE_ENV === "production";
}

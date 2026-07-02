import crypto from "crypto";
import { createCookieSessionStorage, redirect } from "@remix-run/node";

/**
 * Login gate for the internal ops panel (`/ops`).
 *
 * This is a standalone, team-only dashboard that lives OUTSIDE the Shopify
 * embedded admin (`/app/*`). It never uses `authenticate.admin` — instead it's
 * protected by a single shared password (`OPS_PASSWORD`) and a signed cookie.
 * Meant to be run locally (`npm run ops`), not deployed.
 */

const isProd = process.env.NODE_ENV === "production";

// A stable fallback secret keeps cookie signing working in local dev even if the
// operator forgot to set OPS_SESSION_SECRET. It's only a signing secret for a
// localhost-only panel, not a credential — the real gate is OPS_PASSWORD.
const sessionSecret =
  process.env.OPS_SESSION_SECRET || "ops-dev-insecure-session-secret";

const storage = createCookieSessionStorage({
  cookie: {
    name: "__ops_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/ops",
    secure: isProd,
    secrets: [sessionSecret],
    maxAge: 60 * 60 * 12, // 12h
  },
});

/** True once the operator has logged in with the correct password. */
async function isAuthed(request: Request): Promise<boolean> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return session.get("authed") === true;
}

/**
 * Constant-time compare of a submitted password against `OPS_PASSWORD`.
 * Returns false (locked) when `OPS_PASSWORD` is unset, so the panel is never
 * wide open by accident.
 */
export function verifyOpsPassword(input: string | null | undefined): boolean {
  const expected = process.env.OPS_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(String(input ?? ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Whether OPS_PASSWORD is configured at all (used to warn on the login page). */
export function opsPasswordConfigured(): boolean {
  return Boolean(process.env.OPS_PASSWORD);
}

/** Read-only auth check for the layout header (does not redirect). */
export function getOpsAuthState(request: Request): Promise<boolean> {
  return isAuthed(request);
}

/** Guard a protected loader/action: redirect to /ops/login when not authed. */
export async function requireOps(request: Request): Promise<void> {
  if (!(await isAuthed(request))) {
    throw redirect("/ops/login");
  }
}

/** Create the logged-in session cookie and redirect to the given path. */
export async function commitOpsLogin(request: Request, to = "/ops"): Promise<Response> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("authed", true);
  return redirect(to, {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

/** Destroy the session cookie and redirect to login. */
export async function destroyOpsSession(request: Request): Promise<Response> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/ops/login", {
    headers: { "Set-Cookie": await storage.destroySession(session) },
  });
}

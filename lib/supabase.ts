import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type JwtPayload, type Session as AuthSession } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRole, type Role } from "./workflow";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const BUCKET = "call-recordings";

/** Auth client bound to the user's cookies. Used only for sign-in / sign-out / reading the session. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: proxy.ts refreshes cookies instead
        }
      },
    },
  });
}

/** Service-key client. Bypasses RLS, so only call it after requireRole(). */
export function db() {
  return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

export type Session = { userId: string; email: string; role: Role };

export async function getSession(): Promise<Session | null> {
  return toSession((await (await authClient()).auth.getClaims()).data?.claims);
}

/** PC dialer: same CRM login, sent as "Authorization: Bearer <access token>" instead of a cookie. */
export async function bearerSession(req: Request): Promise<Session | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const { data } = await tokenClient().auth.getClaims(token);
    return toSession(data?.claims);
  } catch {
    return null; // not a JWT at all: getClaims throws while decoding it
  }
}

/** Login for the PC dialer: same users and passwords as the CRM, answered with tokens instead of cookies. */
export async function tokenLogin(email: string, password: string) {
  const { data } = await tokenClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  return tokens(data.session) ?? { error: "Wrong email or password." };
}
export async function tokenRefresh(refresh: string) {
  const { data } = await tokenClient().auth.refreshSession({ refresh_token: refresh });
  return tokens(data.session) ?? { error: "Please log in again." };
}
const tokenClient = () => createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
function tokens(s: AuthSession | null) {
  const role = s?.user.app_metadata?.role;
  return s && isRole(role) ? { access: s.access_token, refresh: s.refresh_token, email: s.user.email ?? "", role } : null;
}

function toSession(c: JwtPayload | undefined): Session | null {
  const role = c?.app_metadata?.role;
  if (!c?.sub || !isRole(role)) return null;
  return { userId: c.sub, email: String(c.email ?? ""), role };
}

/** Pages: bounce to login / own dashboard. Actions: same, so a forged request never runs. */
export async function requireRole(role: Role): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== role) redirect(`/${s.role}`);
  return s;
}

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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
  const { data } = await (await authClient()).auth.getClaims();
  const c = data?.claims;
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

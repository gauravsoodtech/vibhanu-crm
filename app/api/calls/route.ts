// Polled by the dialer panel in the CRM (cookie login).
import { dialerState } from "@/lib/calls";
import { getSession } from "@/lib/supabase";

export async function GET(req: Request) {
  const s = await getSession();
  const state = s && (await dialerState(s, new URL(req.url).searchParams.get("lead") ?? ""));
  return state ? Response.json(state) : Response.json({ error: "Not allowed." }, { status: 403 });
}

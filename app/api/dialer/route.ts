// API for the PC dialer (dialer/connector.mjs). Auth: the same CRM login, as a bearer token.
import { after } from "next/server";
import { callUploadUrl, createCall, dialableLeads, endCall, saveCall, takeRequest } from "@/lib/calls";
import { bearerSession, tokenLogin, tokenRefresh } from "@/lib/supabase";

export const maxDuration = 60; // the AI summary runs after the response

const reply = (r: object) => Response.json(r, { status: "error" in r ? 400 : 200 });
const denied = () => Response.json({ error: "Please log in again." }, { status: 401 });

/** Poll: "I am online" + pick up a call the agent started from the CRM screen. */
export async function GET(req: Request) {
  const s = await bearerSession(req);
  if (!s) return denied();
  const q = new URL(req.url).searchParams;
  const call = await takeRequest(s, q.get("device") ?? "Phone", q.has("busy"));
  return reply({ role: s.role, call, ...(q.has("leads") ? { leads: await dialableLeads(s) } : {}) });
}

export async function POST(req: Request) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (b.action === "login") return reply(await tokenLogin(String(b.email ?? ""), String(b.password ?? "")));
  if (b.action === "refresh") return reply(await tokenRefresh(String(b.refresh ?? "")));

  const s = await bearerSession(req);
  if (!s) return denied();
  const id = String(b.id ?? "");

  switch (b.action) {
    case "start": {
      const r = await createCall(s, String(b.leadId ?? ""), "dialing");
      return reply("error" in r ? r : { id: r.call.id, name: r.name, phone: r.phone });
    }
    case "upload":
      return reply(await callUploadUrl(s, id, String(b.ext ?? "")));
    case "save": {
      const r = await saveCall(s, id, String(b.path ?? ""), Number(b.duration));
      if ("error" in r) return reply(r);
      after(r.ai);
      return reply({ ok: true });
    }
    case "end":
      return reply(await endCall(s, id, b.status === "no_answer" ? "no_answer" : "failed", String(b.note ?? "")));
    default:
      return reply({ error: "Unknown action." });
  }
}

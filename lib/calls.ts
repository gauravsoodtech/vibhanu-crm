import "server-only";
import { analyseCall } from "./ai";
import { logEvent } from "./queries";
import { BUCKET, db, type Session } from "./supabase";
import { AI_EXT, AUDIO_EXT, canDial, DEMO_PHONES, normalizeExt, REQUEST_TTL_S, STALE_CALL_S } from "./workflow";

export type Call = {
  id: string;
  lead_id: string;
  agent_id: string;
  agent_email: string;
  role: string;
  status: "requested" | "dialing" | "saving" | "saved" | "no_answer" | "failed";
  note: string | null;
  duration_s: number | null;
  audio_path: string | null;
  transcript: string | null;
  ai_summary: string | null;
  ai_tag: "hot" | "warm" | "cold" | null;
  ai_status: "pending" | "done" | "failed" | null;
  created_at: string;
};

type Fail = { error: string };
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Lead, only if this user may call it right now. */
export async function dialableLead(s: Session, leadId: string) {
  if (!UUID.test(leadId)) return null;
  const { data } = await db().from("leads").select("id, name, contact_number, stage, claimed_by").eq("id", leadId).maybeSingle();
  return data && canDial(s.role, data.stage, data.claimed_by === s.userId) ? data : null;
}

/** Leads this user may call, for the list inside the PC dialer. */
export async function dialableLeads(s: Session) {
  const q = db().from("leads").select("id, name, contact_number").order("updated_at", { ascending: false }).limit(50);
  if (s.role === "communication" || s.role === "vigilance") return (await q.eq("stage", s.role)).data ?? [];
  if (s.role === "sales") return (await q.eq("stage", "claimed").eq("claimed_by", s.userId)).data ?? [];
  return [];
}

/** `status` is "requested" from the CRM screen (the phone picks it up) or "dialing" when started on the phone itself. */
export async function createCall(
  s: Session,
  leadId: string,
  status: "requested" | "dialing",
): Promise<{ call: Call; phone: string; name: string } | Fail> {
  const lead = await dialableLead(s, leadId);
  if (!lead) return { error: "You cannot call this lead." };
  if (DEMO_PHONES.includes(lead.contact_number)) return { error: "Demo lead: this number is made up, so calling is off. Create a lead with a real number." };

  // Free the agent's line if an older attempt was abandoned (phone offline, app killed).
  const mine = (st: string, olderThan: number, note: string) =>
    db().from("calls").update({ status: "failed", note }).eq("agent_id", s.userId).eq("status", st).lt("created_at", ago(olderThan));
  await mine("requested", REQUEST_TTL_S, "Phone did not pick up the request");
  await mine("dialing", STALE_CALL_S, "Dialer stopped during the call");

  const { data, error } = await db()
    .from("calls")
    .insert({ lead_id: lead.id, agent_id: s.userId, agent_email: s.email, role: s.role, status })
    .select("*")
    .single();
  if (error) return { error: error.code === "23505" ? "You already have a call in progress." : error.message };
  await logEvent(lead.id, s, "Call started");
  return { call: data, phone: lead.contact_number, name: lead.name };
}

/** Phone poll: check in, and atomically take the waiting request (if any) so it is dialled only once. */
export async function takeRequest(s: Session, device: string, busy: boolean) {
  await db().from("dialer_phones").upsert({ agent_id: s.userId, device: device.slice(0, 60), seen_at: new Date().toISOString() });
  if (busy) return null;
  const { data } = await db()
    .from("calls")
    .update({ status: "dialing" })
    .eq("agent_id", s.userId)
    .eq("status", "requested")
    .gte("created_at", ago(REQUEST_TTL_S))
    .select("id, leads(name, contact_number)");
  const c = data?.[0] as unknown as { id: string; leads: { name: string; contact_number: string } } | undefined;
  return c ? { id: c.id, name: c.leads.name, phone: c.leads.contact_number } : null;
}

/** A late recording (phone was offline, call was cancelled in the CRM) is still accepted, so no recording is lost. */
async function openCall(s: Session, id: string): Promise<Call | null> {
  if (!UUID.test(id)) return null;
  const { data } = await db().from("calls").select("*").eq("id", id).eq("agent_id", s.userId).in("status", ["dialing", "saving", "failed"]).maybeSingle();
  return data;
}

/** Signed upload URL: the phone uploads straight to private storage, never through our server. */
export async function callUploadUrl(s: Session, id: string, rawExt: string): Promise<{ path: string; url: string } | Fail> {
  const ext = normalizeExt(rawExt);
  if (!AUDIO_EXT.includes(ext)) return { error: `Use one of: ${AUDIO_EXT.join(", ")}` };
  const call = await openCall(s, id);
  if (!call) return { error: "Call not found." };
  const path = `leads/${call.lead_id}/call-${call.id}.${ext}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error) return { error: error.message };
  await db().from("calls").update({ status: "saving" }).eq("id", id);
  return { path, url: data.signedUrl };
}

/** Upload finished: link the recording to the call and the lead. Returns the job that runs the AI afterwards. */
export async function saveCall(s: Session, id: string, path: string, durationS: number): Promise<{ ai: () => Promise<void> } | Fail> {
  const call = await openCall(s, id);
  if (!call) return { error: "Call not found." };
  if (!AUDIO_EXT.some((e) => path === `leads/${call.lead_id}/call-${call.id}.${e}`)) return { error: "Bad file path." };
  if (!Number.isFinite(durationS) || durationS <= 0) return { error: "Bad duration." };
  const { data: file } = await db().storage.from(BUCKET).download(path);
  if (!file?.size) return { error: "Recording did not upload." };

  const duration_s = Math.round(durationS * 100) / 100;
  const { error } = await db()
    .from("calls")
    .update({ status: "saved", note: null, audio_path: path, duration_s, ai_status: "pending", ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  // Newest call is the lead's recording until Vigilance has verified it. Later calls stay in the call history only.
  await db()
    .from("leads")
    .update({ audio_path: path, audio_duration_s: duration_s, transcript: null, ai_summary: null, ai_tag: null })
    .eq("id", call.lead_id)
    .in("stage", ["communication", "vigilance"]);
  await logEvent(call.lead_id, s, "Call recorded and saved");

  const ai = async () => {
    try {
      const ext = path.split(".").pop()!;
      if (!AI_EXT.includes(ext)) throw new Error(`AI cannot read .${ext}`);
      const r = await analyseCall(await file.arrayBuffer(), `call.${ext}`);
      const out = { transcript: r.transcript, ai_summary: r.summary, ai_tag: r.tag };
      await db().from("calls").update({ ...out, ai_status: "done" }).eq("id", id);
      await db().from("leads").update(out).eq("id", call.lead_id).eq("audio_path", path);
    } catch (e) {
      console.error("AI failed", e);
      await db().from("calls").update({ ai_status: "failed" }).eq("id", id);
    }
  };
  return { ai };
}

/** Call ended without a recording (not answered, cancelled, recorder off). */
export async function endCall(s: Session, id: string, status: "no_answer" | "failed", note: string): Promise<{ ok: true } | Fail> {
  if (!UUID.test(id)) return { error: "Call not found." };
  const { data } = await db()
    .from("calls")
    .update({ status, note: note.slice(0, 200) || null, ended_at: new Date().toISOString() })
    .eq("id", id)
    .eq("agent_id", s.userId)
    .in("status", ["requested", "dialing", "saving"])
    .select("lead_id");
  if (!data?.length) return { error: "Call not found." };
  await logEvent(data[0].lead_id, s, status === "no_answer" ? "Call not answered" : "Call ended without recording");
  return { ok: true };
}

/** Everything the CRM dialer panel shows: is my phone online, and this lead's calls with playable links. */
export async function dialerState(s: Session, leadId: string) {
  if (!(await dialableLead(s, leadId))) return null;
  const [{ data: phone }, { data: rows }] = await Promise.all([
    db().from("dialer_phones").select("device, seen_at").eq("agent_id", s.userId).maybeSingle(),
    db().from("calls").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20),
  ]);
  const calls = await Promise.all(
    ((rows ?? []) as Call[]).map(async ({ audio_path, agent_id, ...c }) => ({
      ...c,
      mine: agent_id === s.userId,
      status: c.status === "requested" && Date.parse(c.created_at) < Date.now() - REQUEST_TTL_S * 1000 ? ("failed" as const) : c.status,
      url: audio_path ? ((await db().storage.from(BUCKET).createSignedUrl(audio_path, 600)).data?.signedUrl ?? null) : null,
    })),
  );
  return { phone: phone && Date.now() - Date.parse(phone.seen_at) < 15_000 ? (phone.device as string) : null, calls };
}
export type DialerState = NonNullable<Awaited<ReturnType<typeof dialerState>>>;

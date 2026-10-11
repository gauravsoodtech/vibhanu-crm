"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analyseCall } from "@/lib/ai";
import { authClient, BUCKET, db, getSession, requireRole, type Session } from "@/lib/supabase";
import { FLOW, isRole, listenedFully, missingFields, nextStage, normalizePhone, pickEditable, type Role } from "@/lib/workflow";

export type Result = { error?: string; ok?: string } | null;

const AUDIO_EXT = ["aac", "mp3", "m4a", "wav", "ogg", "webm"];

async function log(leadId: string, s: Session, action: string) {
  await db().from("lead_events").insert({ lead_id: leadId, actor_email: s.email, role: s.role, action });
}

function done(ok: string): Result {
  revalidatePath("/", "layout");
  return { ok };
}

/** Atomic hand-off: only moves the lead if it is still at this role's stage. */
async function advance(s: Session, id: string): Promise<Result> {
  const from = FLOW[s.role].works!;
  const to = nextStage(s.role, from)!;
  const { data } = await db().from("leads").update({ stage: to }).eq("id", id).eq("stage", from).select("id");
  if (!data?.length) return { error: "This lead was already moved by someone else." };
  await log(id, s, FLOW[s.role].action);
  return done(`${FLOW[s.role].action}: lead sent to ${FLOW[to as Role]?.label ?? "claimed"}.`);
}

// ---------- auth ----------

export async function signIn(_: Result, fd: FormData): Promise<Result> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim().toLowerCase(),
    password: String(fd.get("password") ?? ""),
  });
  if (error) return { error: "Wrong email or password." };
  const role = data.user.app_metadata?.role;
  if (!isRole(role)) {
    await supabase.auth.signOut();
    return { error: "This account has no department assigned." };
  }
  redirect(`/${role}`);
}

export async function signOut() {
  await (await authClient()).auth.signOut();
  redirect("/login");
}

// ---------- 1. Marketing ----------

export async function createLead(_: Result, fd: FormData): Promise<Result> {
  const s = await requireRole("marketing");
  const name = String(fd.get("name") ?? "").trim();
  const phone = normalizePhone(String(fd.get("contact_number") ?? ""));
  if (!name) return { error: "Enter the name." };
  if (!phone) return { error: "Enter a valid 10 digit Indian mobile number." };

  const { data, error } = await db()
    .from("leads")
    .insert({ name, contact_number: phone, created_by: s.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await log(data.id, s, "Create");
  return done(`Lead for ${name} created and sent to Communication.`);
}

// ---------- 2. Communication / 3. Vigilance ----------

export async function saveDetails(_: Result, fd: FormData): Promise<Result> {
  const s = await getSession();
  if (!s || (s.role !== "communication" && s.role !== "vigilance")) redirect("/login");
  const id = String(fd.get("id"));
  const stage = FLOW[s.role].works!;
  const patch = pickEditable(s.role, Object.fromEntries(fd));

  const { data: lead, error } = await db()
    .from("leads")
    .update(patch)
    .eq("id", id)
    .eq("stage", stage)
    .select("*")
    .single();
  if (error || !lead) return { error: "Lead not found in your queue." };

  if (fd.get("intent") !== "advance") {
    await log(id, s, "Edited details");
    return done("Saved.");
  }
  const missing = missingFields(s.role, lead);
  if (missing.length) return { error: `Fill in: ${missing.join(", ").replaceAll("_", " ")}.` };
  if (s.role === "vigilance" && !lead.audio_path) return { error: "Add the call recording first. It is mandatory." };
  return advance(s, id);
}

/** Signed upload URLs: the browser uploads straight to private storage (no 4.5 MB server limit). */
export async function audioUploadUrls(id: string, ext: string) {
  await requireRole("vigilance");
  ext = ext.toLowerCase();
  if (!AUDIO_EXT.includes(ext)) return { error: `Use one of: ${AUDIO_EXT.join(", ")}` };
  const store = db().storage.from(BUCKET);
  const stamp = Date.now();
  const original = `leads/${id}/call-${stamp}.${ext}`;
  const wav = `leads/${id}/ai-${stamp}.wav`;
  const [a, b] = await Promise.all([store.createSignedUploadUrl(original), store.createSignedUploadUrl(wav)]);
  if (a.error || b.error) return { error: (a.error ?? b.error)!.message };
  return { original: { path: original, token: a.data.token }, wav: { path: wav, token: b.data.token } };
}

/** Called after both uploads finish. Stores the path, then runs AI (never blocks the flow). */
export async function attachAudio(id: string, path: string, wavPath: string | null, durationS: number): Promise<Result> {
  const s = await requireRole("vigilance");
  if (!path.startsWith(`leads/${id}/`) || (wavPath && !wavPath.startsWith(`leads/${id}/`))) return { error: "Bad file path." };

  const { data: old } = await db().from("leads").select("audio_path").eq("id", id).eq("stage", "vigilance").single();
  if (!old) return { error: "Lead not found in your queue." };

  const { error } = await db()
    .from("leads")
    .update({ audio_path: path, audio_duration_s: Math.round(durationS * 100) / 100, transcript: null, ai_summary: null, ai_tag: null })
    .eq("id", id);
  if (error) return { error: error.message };
  if (old.audio_path) await db().storage.from(BUCKET).remove([old.audio_path]);
  await log(id, s, old.audio_path ? "Replaced call recording" : "Added call recording");

  if (!wavPath) return done("Recording saved. (AI skipped: browser could not decode this format.)");
  try {
    const { data: wav, error: dlErr } = await db().storage.from(BUCKET).download(wavPath);
    if (dlErr) throw dlErr;
    const ai = await analyseCall(await wav.arrayBuffer());
    await db().from("leads").update({ transcript: ai.transcript, ai_summary: ai.summary, ai_tag: ai.tag }).eq("id", id);
    return done("Recording saved. AI transcript and summary ready.");
  } catch (e) {
    console.error("AI failed", e);
    return done("Recording saved. AI summary unavailable right now.");
  } finally {
    await db().storage.from(BUCKET).remove([wavPath]);
  }
}

// ---------- 4. Support ----------

export async function allocate(_: Result, fd: FormData): Promise<Result> {
  const s = await requireRole("support");
  const id = String(fd.get("id"));
  const checks = { date_ok: fd.get("date_ok") === "on", time_ok: fd.get("time_ok") === "on", address_ok: fd.get("address_ok") === "on" };
  if (!checks.date_ok || !checks.time_ok || !checks.address_ok) return { error: "Verify date, time and complete address first." };
  await db().from("leads").update(checks).eq("id", id).eq("stage", "support");
  return advance(s, id);
}

// ---------- 5. Sales ----------

/** Starts a listen: records the start time server-side and returns a 5 minute signed URL. */
export async function startListening(id: string) {
  const s = await requireRole("sales");
  const { data: lead } = await db()
    .from("leads")
    .update({ audio_play_started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("stage", "sales")
    .select("audio_path")
    .single();
  if (!lead?.audio_path) return { error: "Recording not found." };
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(lead.audio_path, 300);
  if (error) return { error: error.message };
  await log(id, s, "Started listening");
  return { url: data.signedUrl };
}

/** Player hit the end. Server checks real elapsed time, so skipping or speeding up does not count. */
export async function finishListening(id: string): Promise<Result> {
  const s = await requireRole("sales");
  const { data: lead } = await db()
    .from("leads")
    .select("audio_play_started_at, audio_duration_s")
    .eq("id", id)
    .eq("stage", "sales")
    .single();
  if (!lead?.audio_play_started_at) return { error: "Play the recording first." };
  if (!listenedFully(new Date(lead.audio_play_started_at), new Date(), Number(lead.audio_duration_s))) {
    return { error: "The recording must be played completely. Please play it again." };
  }
  await db().from("leads").update({ audio_played_at: new Date().toISOString() }).eq("id", id);
  await log(id, s, "Listened to full recording");
  return done("Recording played fully. You can claim this lead now.");
}

export async function claimLead(_: Result, fd: FormData): Promise<Result> {
  const s = await requireRole("sales");
  const id = String(fd.get("id"));
  const { data } = await db()
    .from("leads")
    .update({ stage: "claimed", claimed_by: s.userId, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("stage", "sales")
    .not("audio_played_at", "is", null)
    .select("id");
  if (!data?.length) return { error: "Play the full recording before claiming (or it was already claimed)." };
  await log(id, s, "Claim");
  return done("Lead claimed. Full details unlocked.");
}

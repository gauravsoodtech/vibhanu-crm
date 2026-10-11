import "server-only";
import { BUCKET, db } from "./supabase";
import { STAGES, type Stage } from "./workflow";

export type Lead = {
  id: string;
  name: string;
  contact_number: string;
  postal_address: string | null;
  visit_date: string | null;
  visit_time: string | null;
  remark: string | null;
  project: string | null;
  budget: string | null;
  stage: Stage;
  audio_path: string | null;
  audio_duration_s: number | null;
  transcript: string | null;
  ai_summary: string | null;
  ai_tag: "hot" | "warm" | "cold" | null;
  audio_played_at: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadEvent = { id: number; actor_email: string; role: string; action: string; at: string };

export async function stageCounts(): Promise<Record<Stage, number>> {
  const { data } = await db().from("leads").select("stage");
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  data?.forEach((r) => counts[r.stage as Stage]++);
  return counts;
}

export async function leadsAt(stage: Stage, columns = "*") {
  const { data } = await db().from("leads").select(columns).eq("stage", stage).order("updated_at", { ascending: false });
  return (data ?? []) as unknown as Lead[];
}

export async function getLead(id: string | undefined, stage: Stage): Promise<Lead | null> {
  if (!id) return null;
  const { data } = await db().from("leads").select("*").eq("id", id).eq("stage", stage).maybeSingle();
  return data;
}

export async function events(leadId: string): Promise<LeadEvent[]> {
  const { data } = await db().from("lead_events").select("*").eq("lead_id", leadId).order("at");
  return data ?? [];
}

export async function audioUrl(path: string | null) {
  if (!path) return null;
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

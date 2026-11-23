// The whole lead workflow in one table. Pure, so it is unit-tested (workflow.test.ts).

export const ROLES = ["marketing", "communication", "vigilance", "support", "sales"] as const;
export type Role = (typeof ROLES)[number];

export const STAGES = ["communication", "vigilance", "support", "sales", "claimed"] as const;
export type Stage = (typeof STAGES)[number];

export type Field = "name" | "contact_number" | "postal_address" | "visit_date" | "visit_time" | "remark" | "project" | "budget";

const DETAILS: Field[] = ["name", "postal_address", "visit_date", "visit_time", "remark", "project", "budget"];

export const FLOW: Record<Role, { label: string; works: Stage | null; next: Stage; action: string; editable: Field[] }> = {
  marketing: { label: "Marketing", works: null, next: "communication", action: "Create", editable: ["name", "contact_number"] },
  communication: { label: "Communication", works: "communication", next: "vigilance", action: "Meeting", editable: DETAILS },
  vigilance: { label: "Vigilance", works: "vigilance", next: "support", action: "Verified", editable: DETAILS },
  support: { label: "Support", works: "support", next: "sales", action: "Allocate", editable: [] },
  sales: { label: "Sales", works: "sales", next: "claimed", action: "Claim", editable: [] },
};

export const STAGE_LABEL: Record<Stage, string> = {
  communication: "With Communication",
  vigilance: "With Vigilance",
  support: "With Support",
  sales: "With Sales",
  claimed: "Claimed",
};

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}

/** Next stage if `role` may move a lead that is at `stage`, else null. */
export function nextStage(role: Role, stage: Stage): Stage | null {
  return FLOW[role].works === stage ? FLOW[role].next : null;
}

/** Keep only the fields this role may edit. Trims strings, empty becomes null. */
export function pickEditable(role: Role, input: Record<string, unknown>) {
  const out: Partial<Record<Field, string | null>> = {};
  for (const f of FLOW[role].editable) {
    if (!(f in input)) continue;
    const v = String(input[f] ?? "").trim();
    out[f] = v === "" ? null : v;
  }
  return out;
}

/** Fields that must be filled before this role can move the lead on. */
export function missingFields(role: Role, lead: Partial<Record<Field, unknown>>): Field[] {
  const required: Field[] =
    role === "marketing" ? ["name", "contact_number"]
    : role === "communication" || role === "vigilance" ? ["name", "postal_address", "visit_date", "visit_time"]
    : [];
  return required.filter((f) => lead[f] == null || String(lead[f]).trim() === "");
}

/** Indian mobile: accepts +91 / 0 prefixes, spaces, dashes. Returns 10 digits or null. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function maskPhone(p: string): string {
  return p.length < 4 ? "xxxx" : p.slice(0, 2) + "x".repeat(p.length - 4) + p.slice(-2);
}

/** Who may call a lead: the department holding it, or the Sales person who claimed it. */
export function canDial(role: Role, stage: Stage, claimedByMe: boolean): boolean {
  if (role === "communication" || role === "vigilance") return FLOW[role].works === stage;
  return role === "sales" && stage === "claimed" && claimedByMe;
}

/** Numbers of the made-up demo leads (scripts/seed.ts). They may belong to real people, so the dialer never calls them. */
export const DEMO_PHONES = ["9810045321", "9958312047", "8800654190", "9716203458", "9899017623"];

/** A request the phone has not picked up after this long is dead (nobody wants a surprise call later). */
export const REQUEST_TTL_S = 30;
/** A call that never reported back after this long is treated as lost. */
export const STALE_CALL_S = 15 * 60;

export const AUDIO_EXT = ["aac", "mp3", "m4a", "wav", "ogg", "webm"];
/** Formats Whisper accepts directly. */
export const AI_EXT = ["mp3", "m4a", "wav", "ogg", "webm"];
export function normalizeExt(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\./, "");
}

/** Sales may only claim after listening to the whole call (5% slack for timer jitter). */
export function listenedFully(startedAt: Date, endedAt: Date, durationS: number): boolean {
  return (endedAt.getTime() - startedAt.getTime()) / 1000 >= durationS * 0.95;
}

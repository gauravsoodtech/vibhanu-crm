// Creates the 5 department logins from the assessment brief. Safe to run again.
// Usage: npm run seed   |   npm run reset (wipe leads + recordings)   |   npm run demo (reset + sample leads)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const USERS = [
  { email: "marketing@vibhanu.com", password: "vibhanu@Marketing", role: "marketing" },
  { email: "communication@vibhanu.com", password: "vibhanu@communication", role: "communication" },
  { email: "vigilance@vibhanu.com", password: "vibhanu@vigilance.com", role: "vigilance" },
  { email: "support@vibhanu.com", password: "vibhanu@support.com", role: "support" },
  { email: "sales@vibhanu.com", password: "vibhanu@sales.com", role: "sales" },
];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const { data: list, error } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;

  for (const u of USERS) {
    const attrs = { password: u.password, email_confirm: true, app_metadata: { role: u.role } };
    const existing = list.users.find((x) => x.email === u.email);
    const res = existing ? await sb.auth.admin.updateUserById(existing.id, attrs) : await sb.auth.admin.createUser({ email: u.email, ...attrs });
    if (res.error) throw res.error;
    console.log(`${existing ? "updated" : "created"}  ${u.role.padEnd(13)} ${u.email}`);
  }

  if (process.argv.includes("--reset")) {
    const { data: files } = await sb.storage.from("call-recordings").list("leads", { limit: 1000 });
    for (const dir of files ?? []) {
      const { data: inner } = await sb.storage.from("call-recordings").list(`leads/${dir.name}`);
      const paths = (inner ?? []).map((f) => `leads/${dir.name}/${f.name}`);
      if (paths.length) await sb.storage.from("call-recordings").remove(paths);
    }
    const { error: delErr } = await sb.from("leads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) throw delErr;
    console.log("reset: all leads, events and recordings removed");
  }

  if (process.argv.includes("--demo")) {
    const ids = Object.fromEntries((await sb.auth.admin.listUsers({ perPage: 200 })).data.users.map((u) => [u.app_metadata?.role, u.id]));
    for (const [i, d] of DEMO.entries()) {
      const at = (min: number) => new Date(Date.now() - (DEMO.length - i) * 37 * 60_000 + min * 60_000).toISOString();
      const { data, error: e } = await sb.from("leads").insert({ ...d.lead, created_by: ids.marketing, created_at: at(0), updated_at: at(d.lead.stage === "vigilance" ? 25 : 0) }).select("id").single();
      if (e) throw e;
      const evts = [{ actor_email: "marketing@vibhanu.com", role: "marketing", action: "Create", at: at(0) }];
      if (d.lead.stage === "vigilance") evts.push({ actor_email: "communication@vibhanu.com", role: "communication", action: "Meeting", at: at(25) });
      await sb.from("lead_events").insert(evts.map((ev) => ({ ...ev, lead_id: data.id })));
    }
    console.log(`demo: ${DEMO.length} sample leads added (made-up names)`);
  }
}

// Made-up sample leads so the queues look like a working day. No audio, no AI output: those come from the live demo.
const DEMO: { lead: Record<string, string> }[] = [
  { lead: { name: "Rohit Malhotra", contact_number: "9810045321", stage: "communication" } },
  { lead: { name: "Sneha Kapoor", contact_number: "9958312047", stage: "communication" } },
  { lead: { name: "Vikas Yadav", contact_number: "8800654190", stage: "communication" } },
  {
    lead: {
      name: "Anjali Mehra", contact_number: "9716203458", stage: "vigilance",
      postal_address: "House 142, Sector 57, Gurugram, Haryana 122003", visit_date: "2026-10-17", visit_time: "11:00",
      project: "Dholera SIR, residential plot", budget: "Under 50 L", remark: "Wants a 200 sq yd plot near the expressway, asked about resale value.",
    },
  },
  {
    lead: {
      name: "Karan Bhatia", contact_number: "9899017623", stage: "vigilance",
      postal_address: "Flat 704, Tower 3, Sector 82, Gurugram, Haryana 122004", visit_date: "2026-10-18", visit_time: "16:30",
      project: "Signature Global", budget: "1 to 2 Cr", remark: "Looking for 3BHK on Dwarka Expressway, needs home loan help.",
    },
  },
];

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

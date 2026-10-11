// Creates the 5 department logins from the assessment brief. Safe to run again.
// Usage: npm run seed            (add --reset to also wipe all leads and recordings)
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

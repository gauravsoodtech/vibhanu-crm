import { CreateLeadForm } from "@/components/forms";
import { fmtTime, PageTitle, Shell } from "@/components/shell";
import { db, requireRole } from "@/lib/supabase";
import { STAGE_LABEL, type Stage } from "@/lib/workflow";

export default async function Marketing(props: PageProps<"/marketing">) {
  const s = await requireRole("marketing");
  const { denied } = (await props.searchParams) as Record<string, string | undefined>;
  const { data: mine } = await db()
    .from("leads")
    .select("id, name, contact_number, stage, created_at")
    .eq("created_by", s.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <Shell session={s} denied={denied}>
      <PageTitle title="New lead" hint="Step 1. Enter the name and contact number. Create sends the lead to Communication." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="card h-fit p-6">
          <CreateLeadForm />
        </div>
        <div className="card overflow-x-auto">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-forest">Leads I created</p>
          {mine?.length ? (
            <table className="w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Contact</th>
                  <th className="px-4 py-2">Now</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {mine.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2 font-semibold">{l.name}</td>
                    <td className="px-4 py-2 font-mono">{l.contact_number}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-forest">{STAGE_LABEL[l.stage as Stage]}</span>
                    </td>
                    <td className="px-4 py-2 text-muted">{fmtTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-6 text-center text-sm text-muted">No leads yet. Create the first one.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}

import { AllocateForm } from "@/components/forms";
import { Field, fmtClock, fmtDate, LeadList, PageTitle, Shell, Timeline } from "@/components/shell";
import { events, getLead, leadsAt } from "@/lib/queries";
import { requireRole } from "@/lib/supabase";

export default async function Support(props: PageProps<"/support">) {
  const s = await requireRole("support");
  const { id, denied } = (await props.searchParams) as Record<string, string | undefined>;
  const [queue, lead] = await Promise.all([leadsAt("support"), getLead(id, "support")]);

  return (
    <Shell session={s} denied={denied}>
      <PageTitle title="Allocation" hint="Step 4. Verify the date, time and complete address. Allocate sends the verified lead to Sales." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <LeadList leads={queue} selected={id} empty="No verified leads waiting." />
        {lead ? (
          <div className="card space-y-6 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name" value={lead.name} />
              <Field label="Contact" value={<span className="font-mono">{lead.contact_number}</span>} />
              <Field label="Remark" value={lead.remark} />
            </div>
            <AllocateForm key={lead.id} lead={lead} date={fmtDate(lead.visit_date) ?? ""} time={fmtClock(lead.visit_time) ?? ""} />
            <Timeline items={await events(lead.id)} />
          </div>
        ) : (
          <p className="card grid place-items-center p-10 text-sm text-muted">Pick a lead from the list.</p>
        )}
      </div>
    </Shell>
  );
}

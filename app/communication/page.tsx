import { DetailsForm } from "@/components/forms";
import { LeadList, PageTitle, Shell, Timeline } from "@/components/shell";
import { events, getLead, leadsAt } from "@/lib/queries";
import { requireRole } from "@/lib/supabase";

export default async function Communication(props: PageProps<"/communication">) {
  const s = await requireRole("communication");
  const { id, denied, ok } = (await props.searchParams) as Record<string, string | undefined>;
  const [queue, lead] = await Promise.all([leadsAt("communication"), getLead(id, "communication")]);

  return (
    <Shell session={s} denied={denied} ok={ok}>
      <PageTitle title="Meeting details" hint="Step 2. Add the postal address, date, time and remark. Meeting sends the lead to Vigilance." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <LeadList leads={queue} selected={id} empty="No new leads from Marketing." />
        {lead ? (
          <div className="card space-y-6 p-6">
            <DetailsForm key={lead.id + lead.updated_at} lead={lead} actionLabel="Meeting" />
            <Timeline items={await events(lead.id)} />
          </div>
        ) : (
          <p className="card grid place-items-center p-10 text-sm text-muted">Pick a lead from the list.</p>
        )}
      </div>
    </Shell>
  );
}

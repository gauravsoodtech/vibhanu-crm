import { AudioUploader, DetailsForm } from "@/components/forms";
import { AiTag, LeadList, PageTitle, Shell, Timeline } from "@/components/shell";
import { audioUrl, events, getLead, leadsAt } from "@/lib/queries";
import { requireRole } from "@/lib/supabase";

export default async function Vigilance(props: PageProps<"/vigilance">) {
  const s = await requireRole("vigilance");
  const { id, denied, ok } = (await props.searchParams) as Record<string, string | undefined>;
  const [queue, lead] = await Promise.all([leadsAt("vigilance"), getLead(id, "vigilance")]);

  return (
    <Shell session={s} denied={denied} ok={ok}>
      <PageTitle title="Verification" hint="Step 3. Check and correct the details, add the call recording (mandatory). Verified sends the lead to Support." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <LeadList leads={queue} selected={id} empty="Nothing to verify right now." />
        {lead ? (
          <div className="card space-y-6 p-6">
            <AudioUploader leadId={lead.id} currentUrl={await audioUrl(lead.audio_path)} />
            {lead.audio_path && (
              <div className="rounded-xl bg-cream p-4">
                <div className="mb-1 flex items-center gap-2">
                  <p className="label mb-0">AI call summary</p>
                  <AiTag tag={lead.ai_tag} />
                </div>
                <p className="text-sm">{lead.ai_summary || <span className="text-muted">Not available for this recording.</span>}</p>
              </div>
            )}
            <DetailsForm key={lead.id + lead.updated_at} lead={lead} actionLabel="Verified" needsAudio />
            <Timeline items={await events(lead.id)} />
          </div>
        ) : (
          <p className="card grid place-items-center p-10 text-sm text-muted">Pick a lead from the list.</p>
        )}
      </div>
    </Shell>
  );
}

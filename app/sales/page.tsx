import { ListenAndClaim } from "@/components/forms";
import { AiTag, Field, fmtClock, fmtDate, fmtTime, LeadList, PageTitle, Shell, Timeline } from "@/components/shell";
import { audioUrl, events, type Lead } from "@/lib/queries";
import { db, requireRole } from "@/lib/supabase";
import { maskPhone } from "@/lib/workflow";

// Before claiming, Sales only gets these columns, with the number masked server-side.
const LOCKED_COLS = "id, name, contact_number, stage, audio_duration_s, audio_played_at, updated_at";

export default async function Sales(props: PageProps<"/sales">) {
  const s = await requireRole("sales");
  const { id, denied } = (await props.searchParams) as Record<string, string | undefined>;

  const [{ data: open }, { data: mine }] = await Promise.all([
    db().from("leads").select(LOCKED_COLS).eq("stage", "sales").order("updated_at", { ascending: false }),
    db().from("leads").select("*").eq("stage", "claimed").eq("claimed_by", s.userId).order("claimed_at", { ascending: false }),
  ]);
  const toClaim = ((open ?? []) as unknown as Lead[]).map((l) => ({ ...l, contact_number: maskPhone(l.contact_number) }));
  const claimed = (mine ?? []) as Lead[];

  const pending = toClaim.find((l) => l.id === id);
  const full = claimed.find((l) => l.id === id);

  return (
    <Shell session={s} denied={denied}>
      <PageTitle title="Sales desk" hint="Step 5. Play the call recording completely, then claim the lead to unlock the full details." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-5">
          <section>
            <p className="label">Allocated to Sales ({toClaim.length})</p>
            <LeadList leads={toClaim} selected={id} empty="No allocated leads." />
          </section>
          <section>
            <p className="label">My claimed leads ({claimed.length})</p>
            <LeadList leads={claimed} selected={id} empty="You have not claimed any lead yet." />
          </section>
        </div>

        {pending ? (
          <div className="card space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" value={pending.name} />
              <Field label="Contact" value={<span className="font-mono">{pending.contact_number}</span>} />
            </div>
            <p className="rounded-lg bg-gold-soft/50 px-3 py-2 text-sm text-forest">
              Address, meeting time, remarks, transcript and AI summary unlock after you claim.
            </p>
            <ListenAndClaim key={pending.id} lead={pending} />
          </div>
        ) : full ? (
          <div className="card space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-semibold text-forest">{full.name}</h2>
              <AiTag tag={full.ai_tag} />
              <span className="text-xs text-muted">Claimed {fmtTime(full.claimed_at!)}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Contact" value={<a className="font-mono text-forest underline" href={`tel:+91${full.contact_number}`}>{full.contact_number}</a>} />
              <Field label="Meeting date" value={fmtDate(full.visit_date)} />
              <Field label="Meeting time" value={fmtClock(full.visit_time)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Postal address" value={full.postal_address} />
              <Field label="Remark" value={full.remark} />
            </div>
            <div>
              <p className="label">Call recording</p>
              <audio controls src={(await audioUrl(full.audio_path)) ?? undefined} className="w-full" preload="metadata" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-cream p-4">
                <p className="label">AI summary</p>
                <p className="text-sm">{full.ai_summary || <span className="text-muted">Not available.</span>}</p>
              </div>
              <div className="rounded-xl bg-cream p-4">
                <p className="label">Transcript</p>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm">{full.transcript || <span className="text-muted">Not available.</span>}</p>
              </div>
            </div>
            <Timeline items={await events(full.id)} />
          </div>
        ) : (
          <p className="card grid place-items-center p-10 text-sm text-muted">Pick a lead from the list.</p>
        )}
      </div>
    </Shell>
  );
}

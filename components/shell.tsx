import Link from "next/link";
import { signOut } from "@/app/actions";
import { stageCounts, type Lead, type LeadEvent } from "@/lib/queries";
import type { Session } from "@/lib/supabase";
import { FLOW, ROLES, type Role } from "@/lib/workflow";

const STEP_ICON: Record<Role, string> = {
  marketing: "M12 5v14M5 12h14",
  communication: "M4 6h16M4 12h16M4 18h10",
  vigilance: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  support: "M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  sales: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};

export function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

export async function Shell({ session, denied, ok, children }: { session: Session; denied?: string; ok?: string; children: React.ReactNode }) {
  const counts = await stageCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const waiting: Record<Role, number> = {
    marketing: total,
    communication: counts.communication,
    vigilance: counts.vigilance,
    support: counts.support,
    sales: counts.sales,
  };

  return (
    <div className="min-h-screen">
      <header className="bg-forest text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-semibold italic text-gold">Vibh-Anu</span>
            <span className="hidden text-sm text-white/60 sm:inline">Lead CRM</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">{FLOW[session.role].label}</span>
            <span className="hidden text-white/70 md:inline">{session.email}</span>
            <form action={signOut}>
              <button className="rounded-lg border border-white/20 px-3 py-1 text-white/90 hover:border-gold hover:text-gold">Log out</button>
            </form>
          </div>
        </div>
      </header>

      {/* Pipeline strip: mirrors the 5-step workflow, with live counts */}
      <nav className="border-b border-line bg-white">
        <ol className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-3">
          {ROLES.map((r, i) => {
            const me = r === session.role;
            return (
              <li key={r} className="flex shrink-0 items-center gap-1">
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${me ? "bg-forest text-white" : "text-muted"}`}>
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${me ? "bg-gold text-forest" : "bg-cream text-forest"}`}>{i + 1}</span>
                  <Icon d={STEP_ICON[r]} />
                  <span className="text-sm font-semibold">{FLOW[r].label}</span>
                  <span className={`rounded-full px-2 text-xs font-bold ${me ? "bg-white/15" : "bg-cream"}`} title={r === "marketing" ? "Total leads" : "Waiting here"}>
                    {waiting[r]}
                  </span>
                </div>
                {i < ROLES.length - 1 && <span className="text-gold">›</span>}
              </li>
            );
          })}
          <li className="ml-auto flex shrink-0 items-center gap-2 px-3 text-sm text-muted">
            Claimed <span className="rounded-full bg-gold-soft px-2 text-xs font-bold text-forest">{counts.claimed}</span>
          </li>
        </ol>
      </nav>

      {denied && (
        <div className="mx-auto mt-4 max-w-7xl px-4">
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            Access denied: the {FLOW[denied as Role]?.label ?? denied} area is only for that department. You were sent back to your own dashboard.
          </p>
        </div>
      )}

      {ok && (
        <div className="mx-auto mt-4 max-w-7xl px-4">
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">{ok}</p>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

export function PageTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-3xl font-semibold text-forest">{title}</h1>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}

const TAG_STYLE = { hot: "bg-red-100 text-red-700", warm: "bg-amber-100 text-amber-800", cold: "bg-sky-100 text-sky-800" };

export function AiTag({ tag }: { tag: Lead["ai_tag"] }) {
  if (!tag) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TAG_STYLE[tag]}`}>{tag}</span>;
}

/** Queue on the left: each row links to ?id= so the detail panel opens. */
export function LeadList({
  leads,
  selected,
  empty,
  phone = (l) => l.contact_number,
}: {
  leads: Lead[];
  selected?: string;
  empty: string;
  phone?: (l: Lead) => string;
}) {
  if (!leads.length) return <p className="card p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {leads.map((l) => (
        <li key={l.id}>
          <Link
            href={`?id=${l.id}`}
            scroll={false}
            className={`flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-cream ${selected === l.id ? "border-l-4 border-gold bg-gold-soft/40" : ""}`}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{l.name}</p>
              <p className="font-mono text-xs text-muted">{phone(l)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <AiTag tag={l.ai_tag} />
              <span className="text-[11px] text-muted">{fmtTime(l.updated_at)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Timeline({ items }: { items: LeadEvent[] }) {
  return (
    <div>
      <p className="label">Activity log</p>
      <ol className="space-y-2 border-l-2 border-gold-soft pl-4">
        {items.map((e) => (
          <li key={e.id} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
            <span className="font-semibold">{e.action}</span>{" "}
            <span className="text-muted">
              by {FLOW[e.role as Role]?.label ?? e.role} · {fmtTime(e.at)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="text-sm">{value || <span className="text-muted">Not set</span>}</p>
    </div>
  );
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function fmtDate(d: string | null) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;
}

export function fmtClock(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

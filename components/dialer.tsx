"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { cancelCall, requestCall } from "@/app/actions";
import type { DialerState } from "@/lib/calls";

type CallRow = DialerState["calls"][number];

const TAG = { hot: "bg-red-100 text-red-700", warm: "bg-amber-100 text-amber-800", cold: "bg-sky-100 text-sky-800" };
const LIVE: Record<string, string> = {
  requested: "Sending to your phone...",
  dialing: "On call. Recording automatically.",
  saving: "Call ended. Saving the recording in the CRM...",
};
const ENDED: Record<string, string> = { saved: "Recorded", no_answer: "Not answered", failed: "No recording" };

/** Dialer panel: Call button, live call status, and every recorded call of this lead. */
export function Dialer({ leadId, phone }: { leadId: string; phone: string }) {
  const router = useRouter();
  const [state, setState] = useState<DialerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seen = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/calls?lead=${leadId}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const next: DialerState = await res.json();
    // When a call changes, refresh the page once: activity log, lead recording, Verified button.
    const mark = next.calls.map((c) => c.id + c.status + c.ai_status).join();
    if (seen.current !== null && seen.current !== mark) router.refresh();
    seen.current = mark;
    setState((old) => keepUrls(old, next));
  }, [leadId, router]);

  const live = state?.calls.find((c) => c.mine && c.status in LIVE);
  const busy = !!live || !!state?.calls.some((c) => c.ai_status === "pending");

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, busy ? 1500 : 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, busy]);

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError((await fn()).error ?? null);
      await load();
    });

  const phoneText = !state ? "Checking phone..." : state.phone ? `Phone connected: ${state.phone}` : "Phone not connected. Open Vibh-Anu Dialer on this PC, plug in the phone and log in with this same email.";

  return (
    <section className="overflow-hidden rounded-xl border border-line" aria-label="Dialer">
      <div className="flex flex-wrap items-center gap-4 bg-forest px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Dialer</p>
          <p className="font-mono text-lg">
            +91 {phone.slice(0, 5)} {phone.slice(5)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-white/70">
            <span className={`h-2 w-2 shrink-0 rounded-full ${state?.phone ? "bg-emerald-400" : "bg-red-400"}`} />
            {phoneText}
          </p>
        </div>
        {live ? (
          <div className="text-right">
            <p role="status" className="flex items-center justify-end gap-2 text-sm font-semibold">
              {live.status === "dialing" && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />}
              {LIVE[live.status]}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-3 text-xs text-white/70">
              {live.status === "dialing" && <Elapsed since={live.created_at} />}
              <button type="button" className="underline hover:text-gold" disabled={pending} onClick={() => act(() => cancelCall(live.id))}>
                {live.status === "requested" ? "Cancel" : "Reset"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending || !state?.phone}
            onClick={() => act(() => requestCall(leadId))}
            className="rounded-full bg-gold px-6 py-2.5 font-bold text-forest transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            {pending ? "Starting..." : "Call"}
          </button>
        )}
      </div>
      <p className="bg-gold-soft/50 px-4 py-1.5 text-xs text-forest">Every call is recorded. Tell the customer at the start of the call.</p>
      {error && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line">
        {state?.calls.filter((c) => !(c.status in LIVE)).map((c) => <CallItem key={c.id} c={c} />)}
      </ul>
    </section>
  );
}

function CallItem({ c }: { c: CallRow }) {
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${c.status === "saved" ? "bg-emerald-100 text-emerald-800" : "bg-cream text-muted"}`}>
          {ENDED[c.status]}
        </span>
        {c.ai_tag && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TAG[c.ai_tag]}`}>{c.ai_tag}</span>}
        <span className="text-muted">
          {new Date(c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          {` · ${c.agent_email}`}
          {c.duration_s ? ` · ${clock(Number(c.duration_s))}` : ""}
        </span>
      </div>
      {c.note && <p className="text-xs text-muted">{c.note}</p>}
      {c.url && <audio controls src={c.url} className="h-9 w-full" preload="metadata" />}
      {c.ai_status === "pending" && <p className="animate-pulse text-sm text-forest">AI is writing the summary...</p>}
      {c.ai_status === "failed" && <p className="text-sm text-muted">AI summary not available for this call.</p>}
      {c.ai_summary && (
        <p className="text-sm">
          <span className="font-semibold">AI summary:</span> {c.ai_summary}
        </p>
      )}
      {c.transcript && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Transcript</summary>
          <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{c.transcript}</p>
        </details>
      )}
    </li>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono">{clock((now - Date.parse(since)) / 1000)}</span>;
}

/** Each poll signs new links. Keep the old link so a playing recording is not restarted. */
function keepUrls(old: DialerState | null, next: DialerState): DialerState {
  return { ...next, calls: next.calls.map((c) => ({ ...c, url: (c.url && old?.calls.find((o) => o.id === c.id)?.url) || c.url })) };
}

function clock(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

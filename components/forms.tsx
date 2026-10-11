"use client";

import { createClient } from "@supabase/supabase-js";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  allocate,
  attachAudio,
  audioUploadUrls,
  claimLead,
  createLead,
  finishListening,
  saveDetails,
  signIn,
  startListening,
  type Result,
} from "@/app/actions";
import { BUDGETS, PROJECTS } from "@/lib/projects";
import type { Lead } from "@/lib/queries";

function Flash({ state }: { state: Result }) {
  if (!state) return null;
  return state.error ? (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
  ) : (
    <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>
  );
}

// ---------- login ----------

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Department email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input" placeholder="sales@vibhanu.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <Flash state={state} />
      <button className="btn w-full py-3" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}

// ---------- 1. Marketing ----------

export function CreateLeadForm() {
  const [state, action, pending] = useActionState(createLead, null);
  return (
    <form action={action} className="space-y-4" key={state?.ok}>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" required className="input" placeholder="Customer name" />
      </div>
      <div>
        <label className="label" htmlFor="contact_number">Contact number</label>
        <input id="contact_number" name="contact_number" required inputMode="tel" className="input font-mono" placeholder="98765 43210" />
        <p className="mt-1 text-xs text-muted">Locked after creation. No department can change it later.</p>
      </div>
      <Flash state={state} />
      <button className="btn w-full" disabled={pending}>{pending ? "Creating..." : "Create"}</button>
    </form>
  );
}

// ---------- 2. Communication / 3. Vigilance ----------

export function DetailsForm({ lead, actionLabel, needsAudio }: { lead: Lead; actionLabel: string; needsAudio?: boolean }) {
  const [state, action, pending] = useActionState(saveDetails, null);
  const blocked = needsAudio && !lead.audio_path;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={lead.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={lead.name} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="contact">Contact number (locked)</label>
          <input id="contact" value={lead.contact_number} readOnly className="input font-mono" title="Locked after creation" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="postal_address">Postal address</label>
        <textarea id="postal_address" name="postal_address" defaultValue={lead.postal_address ?? ""} rows={2} className="input" placeholder="House no, street, sector, city, PIN" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="visit_date">Date</label>
          <input id="visit_date" name="visit_date" type="date" defaultValue={lead.visit_date ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="visit_time">Time</label>
          <input id="visit_time" name="visit_time" type="time" defaultValue={lead.visit_time?.slice(0, 5) ?? ""} className="input" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="project">Project of interest</label>
          <select id="project" name="project" defaultValue={lead.project ?? ""} className="input">
            <option value="">Select project</option>
            {PROJECTS.map((g) => (
              <optgroup key={g.company} label={g.company}>
                {g.items.map((p) => <option key={p}>{p}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="budget">Budget</label>
          <select id="budget" name="budget" defaultValue={lead.budget ?? ""} className="input">
            <option value="">Select budget</option>
            {BUDGETS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="remark">Remark</label>
        <textarea id="remark" name="remark" defaultValue={lead.remark ?? ""} rows={2} className="input" />
      </div>
      <Flash state={state} />
      <div className="flex flex-wrap gap-3">
        <button name="intent" value="save" className="btn-ghost" disabled={pending}>Save</button>
        <button name="intent" value="advance" className="btn" disabled={pending || blocked} title={blocked ? "Add the call recording first" : undefined}>
          {actionLabel}
        </button>
        {blocked && <span className="self-center text-xs text-red-700">Audio is mandatory before {actionLabel}.</span>}
      </div>
    </form>
  );
}

/** Decode any browser-playable audio to 16 kHz mono WAV (what Whisper wants) and read its exact duration. */
async function toWav16k(file: File): Promise<{ wav: Blob; duration: number }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  await ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);

  const v = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
  return { wav: new Blob([v], { type: "audio/wav" }), duration: decoded.duration };
}

const MIME: Record<string, string> = { aac: "audio/aac", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm" };

export function AudioUploader({ leadId, currentUrl }: { leadId: string; currentUrl: string | null }) {
  const [status, setStatus] = useState<Result>(null);
  const [step, setStep] = useState("");
  const [busy, startBusy] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setStatus(null);
    const ext = file.name.split(".").pop() ?? "";
    setStep("Preparing audio...");
    let decoded: { wav: Blob; duration: number } | null = null;
    try {
      decoded = await toWav16k(file);
    } catch {
      decoded = null; // still store the original, just no AI
    }
    const urls = await audioUploadUrls(leadId, ext);
    if ("error" in urls) return setStatus({ error: urls.error });

    const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!).storage.from("call-recordings");
    setStep("Uploading to secure storage...");
    const up = await storage.uploadToSignedUrl(urls.original.path, urls.original.token, file, { contentType: MIME[ext.toLowerCase()] });
    if (up.error) return setStatus({ error: up.error.message });
    let wavPath: string | null = null;
    if (decoded) {
      const w = await storage.uploadToSignedUrl(urls.wav.path, urls.wav.token, decoded.wav, { contentType: "audio/wav" });
      if (!w.error) wavPath = urls.wav.path;
    }
    const duration = decoded?.duration ?? (await probeDuration(file));
    setStep("AI is transcribing and summarising the call...");
    setStatus(await attachAudio(leadId, urls.original.path, wavPath, duration));
    setStep("");
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-gold/60 bg-gold-soft/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-forest">Call recording <span className="text-red-700">(mandatory)</span></p>
        {currentUrl && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">STORED</span>}
      </div>
      {currentUrl && <audio controls src={currentUrl} className="w-full" preload="metadata" />}
      <input
        ref={input}
        type="file"
        accept=".aac,.mp3,.m4a,.wav,.ogg,.webm,audio/*"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) startBusy(() => upload(f));
        }}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-forest file:px-4 file:py-2 file:font-semibold file:text-white"
      />
      {busy && <p className="animate-pulse text-sm text-forest">{step}</p>}
      <Flash state={status} />
    </div>
  );
}

function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio(URL.createObjectURL(file));
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
  });
}

// ---------- 4. Support ----------

export function AllocateForm({ lead, date, time }: { lead: Lead; date: string; time: string }) {
  const [state, action, pending] = useActionState(allocate, null);
  const [checks, setChecks] = useState({ date_ok: false, time_ok: false, address_ok: false });
  const all = checks.date_ok && checks.time_ok && checks.address_ok;
  const rows: [keyof typeof checks, string, string][] = [
    ["date_ok", "Verify date", date],
    ["time_ok", "Verify time", time],
    ["address_ok", "Verify complete address", lead.postal_address ?? ""],
  ];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={lead.id} />
      {rows.map(([k, label, value]) => (
        <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checks[k] ? "border-emerald-300 bg-emerald-50" : "border-line bg-white hover:border-gold"}`}>
          <input
            type="checkbox"
            name={k}
            checked={checks[k]}
            onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })}
            className="mt-1 h-4 w-4 accent-forest"
          />
          <span>
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-sm text-muted">{value || "Missing"}</span>
          </span>
        </label>
      ))}
      <Flash state={state} />
      <button className="btn w-full" disabled={!all || pending}>{pending ? "Allocating..." : "Allocate to Sales"}</button>
    </form>
  );
}

// ---------- 5. Sales ----------

/**
 * Listen gate. No seek bar and fixed 1x speed in the browser; the server also checks the real
 * elapsed time between start and end, so the Claim button cannot be unlocked by skipping.
 */
export function ListenAndClaim({ lead }: { lead: Lead }) {
  const audio = useRef<HTMLAudioElement>(null);
  const furthest = useRef(0);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [played, setPlayed] = useState(!!lead.audio_played_at);
  const [listenMsg, setListenMsg] = useState<Result>(null);
  const [state, claim, pending] = useActionState(claimLead, null);
  const duration = Number(lead.audio_duration_s) || 0;

  async function toggle() {
    const a = audio.current!;
    if (!src) {
      const r = await startListening(lead.id);
      if ("error" in r) return setListenMsg({ error: r.error });
      furthest.current = 0;
      setSrc(r.url);
      a.src = r.url;
    }
    if (a.paused) {
      a.playbackRate = 1;
      await a.play();
    } else a.pause();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-forest p-4 text-white">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold">Call recording · must be played completely</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-forest transition hover:scale-105"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
            )}
          </button>
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-gold transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/70">
              {fmtSec(progress * duration)} / {fmtSec(duration)} {played && <span className="ml-2 font-bold text-gold">✓ Played fully</span>}
            </p>
          </div>
        </div>
        <audio
          ref={audio}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onRateChange={(e) => (e.currentTarget.playbackRate = 1)}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (a.currentTime > furthest.current + 1.5) a.currentTime = furthest.current; // no skipping ahead
            else furthest.current = Math.max(furthest.current, a.currentTime);
            setProgress(a.duration ? a.currentTime / a.duration : 0);
          }}
          onEnded={async () => {
            setProgress(1);
            const r = await finishListening(lead.id);
            setListenMsg(r);
            if (r?.ok) setPlayed(true);
            setSrc(null);
          }}
        />
      </div>
      <Flash state={listenMsg} />
      <form action={claim}>
        <input type="hidden" name="id" value={lead.id} />
        <Flash state={state} />
        <button className="btn mt-2 w-full py-3 text-base" disabled={!played || pending}>
          {played ? (pending ? "Claiming..." : "Claim lead") : "Claim (play the full recording first)"}
        </button>
      </form>
    </div>
  );
}

function fmtSec(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

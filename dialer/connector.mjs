// Vibh-Anu Dialer: runs on the agent's PC with the phone on USB.
// CRM login -> dial -> record automatically -> save in the CRM. Start: npm run dialer
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { audioSeconds, callState, dial, findPhone, hangUp, mix, resetBridge, startRecorder, stopRecorder } from "./phone.mjs";

const CRM = (process.env.CRM_URL ?? "https://vibhanu-crm.vercel.app").replace(/\/$/, "");
const PORT = Number(process.env.DIALER_PORT ?? 4700);
const HOST = `127.0.0.1:${PORT}`;
const DIR = fileURLToPath(new URL("./recordings/", import.meta.url)); // only until the upload succeeds
mkdirSync(DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let session = null; // { access, refresh, email, role }: memory only, nothing is written to disk
let phone = null;
let leads = [];
let active = null; // the call in progress
let last = null; // { name, text, ok }: result of the last call
let crmOnline = true;

// ---------- CRM ----------

async function post(body, token) {
  const res = await fetch(`${CRM}/api/dialer`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, ...(await res.json().catch(() => ({ error: "CRM sent an unreadable answer." }))) };
}

async function login(email, password) {
  const r = await post({ action: "login", email, password });
  if (r.error) return r.error;
  session = { access: r.access, refresh: r.refresh, email: r.email, role: r.role };
  leads = [];
  return null;
}

/** Calls the CRM with the agent's token. Renews the token once if it expired. */
async function crm(send) {
  const s = session;
  if (!s) return { error: "Please log in again." };
  let r = await send(s.access);
  if (r.status === 401 && session === s) {
    const n = await post({ action: "refresh", refresh: s.refresh });
    if (n.status === 400) session = null; // logged out or revoked
    if (n.error) return n;
    Object.assign(s, { access: n.access, refresh: n.refresh });
    r = await send(s.access);
  }
  return r;
}
const send = (body) => crm((t) => post(body, t));
const poll = (query) =>
  crm(async (t) => {
    const res = await fetch(`${CRM}/api/dialer?${new URLSearchParams(query)}`, { headers: { authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15_000) });
    return { status: res.status, ...(await res.json().catch(() => ({ error: "CRM sent an unreadable answer." }))) };
  });

/** Saves one finished recording. Throws on network trouble; the file then stays in the queue. */
async function upload(id, file, duration) {
  const up = await send({ action: "upload", id, ext: "m4a" });
  if (up.error) throw new Error(up.error);
  const put = await fetch(up.url, { method: "PUT", headers: { "content-type": "audio/mp4", "x-upsert": "true" }, body: readFileSync(file), signal: AbortSignal.timeout(180_000) });
  if (!put.ok) throw new Error(`Storage answered ${put.status}`);
  const saved = await send({ action: "save", id, path: up.path, duration });
  if (saved.error) throw new Error(saved.error);
}

/** No recording is lost: anything that could not be uploaded is tried again for the same login. */
async function uploadPending() {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".json"))) {
    const job = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    if (job.email !== session?.email) continue;
    const file = join(DIR, `${job.id}.m4a`);
    try {
      await upload(job.id, file, job.duration);
      rmSync(file, { force: true });
      rmSync(join(DIR, f), { force: true });
      last = { name: job.name, ok: true, text: "Recording saved in the CRM" };
    } catch (e) {
      last = { name: job.name, ok: false, text: `Recording is safe on this PC, will retry. (${e.message})` };
    }
  }
}

// ---------- one call, start to finish ----------

async function runCall({ id, name, phone: number }) {
  active = { id, name, number, state: "dialing", since: Date.now() };
  const parts = [];
  const fail = async (status, note) => {
    last = { name, ok: false, text: note };
    await send({ action: "end", id, status, note }).catch(() => {});
  };
  try {
    const before = await callState();
    if (before !== "idle") return await fail("failed", before ? "Phone is busy on another call" : "Phone is not connected");
    if (!(await dial(number))) return await fail("failed", "Phone could not dial");

    let started = false;
    let answeredAt = null;
    let lostSince = null;
    for (;;) {
      const st = await callState();
      if (st === null) {
        lostSince ??= Date.now(); // cable dropped: the call itself goes on, so wait for the phone to come back
        if (Date.now() - lostSince > 60_000) break;
      } else {
        lostSince = null;
        if (st === "idle" && (started || Date.now() - active.since > 15_000)) break;
        if (st === "dialing" || st === "active") {
          started = true;
          if (!parts.length || parts.at(-1).exited) {
            const rec = startRecorder(join(DIR, `${id}-${parts.length}.mka`));
            parts.push(rec);
            await Promise.race([rec.done, sleep(1500)]); // do not start twenty recorders a second if one fails
          }
          if (st === "active" && !answeredAt) {
            answeredAt = Date.now();
            Object.assign(active, { state: "talking", since: answeredAt });
          }
        }
      }
      await sleep(500);
    }
    active.state = "saving";
    if (parts.length) await stopRecorder(parts.at(-1));

    if (!started) return await fail("failed", "The phone did not start the call");
    if (!answeredAt) return await fail("no_answer", "Customer did not answer");

    const good = [];
    for (const p of parts) if ((await audioSeconds(p.file)) > 0.3) good.push(p);
    const out = join(DIR, `${id}.m4a`);
    // Drop the ringing: keep from one second before the customer answered.
    const skip = good[0]?.startedAt ? Math.max(0, (answeredAt - good[0].startedAt) / 1000 - 1) : 0;
    const files = good.map((p) => p.file);
    if (!files.length || !(await mix(files, skip, out))) return await fail("failed", "Call was not recorded. Check the USB cable.");
    const duration = await audioSeconds(out);
    if (!duration) return await fail("failed", "Call was too short to record");

    writeFileSync(join(DIR, `${id}.json`), JSON.stringify({ id, name, duration, email: session?.email ?? active.email }));
    await uploadPending();
  } catch (e) {
    console.error(e);
    await fail("failed", "Dialer error");
  } finally {
    for (const p of parts) {
      if (!p.exited) p.kill();
      rmSync(p.file, { force: true });
    }
    active = null;
  }
}

// ---------- loops ----------

async function phoneLoop() {
  for (let bad = 0; ; ) {
    phone = await findPhone();
    bad = phone?.state === "device" || phone?.state === "unauthorized" ? 0 : bad + 1;
    if (bad && bad % 6 === 0) await resetBridge(); // about every 12 s without a phone
    await sleep(2000);
  }
}

async function crmLoop() {
  for (let n = 0; ; n++) {
    await sleep(2000);
    if (!session) continue;
    try {
      const ready = phone?.state === "device";
      if (ready || active) {
        const r = await poll({ device: phone?.name ?? "Phone", ...(active ? { busy: "1" } : {}), ...(n % 4 === 0 ? { leads: "1" } : {}) });
        crmOnline = r.status === 200 || r.status === 401;
        if (r.leads) leads = r.leads;
        if (r.call) {
          if (active) await send({ action: "end", id: r.call.id, status: "failed", note: "Phone is busy on another call" });
          else void runCall(r.call);
        }
      }
      if (!active && n % 15 === 0) await uploadPending();
    } catch {
      crmOnline = false; // no internet: keep trying
    }
  }
}

// ---------- window on this PC ----------

const routes = {
  "/login": async (b) => ({ error: await login(String(b.email ?? ""), String(b.password ?? "")) }),
  "/logout": async () => ((session = null), (leads = []), {}),
  "/hangup": async () => (active && (await hangUp()), {}),
  "/call": async (b) => {
    if (active) return { error: "A call is already running." };
    if (phone?.state !== "device") return { error: "Connect the phone first." };
    active = { name: "", number: "", state: "dialing", since: Date.now() }; // hold the line while we ask the CRM
    const r = await send({ action: "start", leadId: String(b.leadId ?? "") }).catch(() => ({ error: "CRM is not reachable." }));
    if (r.error) {
      active = null;
      return { error: r.error };
    }
    void runCall(r);
    return {};
  },
};

createServer(async (req, res) => {
  const json = (code, o) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(o));
  // Only this PC's own window: blocks other websites (custom header needs CORS, which is never granted) and DNS rebinding.
  if (![HOST, `localhost:${PORT}`].includes(req.headers.host)) return json(403, { error: "Forbidden" });
  if (req.method === "GET" && req.url === "/") {
    return res
      .writeHead(200, { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY" })
      .end(readFileSync(new URL("./index.html", import.meta.url)));
  }
  if (req.headers["x-dialer"] !== "1") return json(403, { error: "Forbidden" });
  if (req.method === "GET" && req.url === "/state") {
    return json(200, {
      user: session && { email: session.email, role: session.role },
      phone, leads, active, last, crmOnline, crm: CRM,
      pending: readdirSync(DIR).filter((n) => n.endsWith(".json")).length,
    });
  }
  const action = req.method === "POST" && Object.hasOwn(routes, req.url) ? routes[req.url] : null;
  if (!action) return json(404, { error: "Not found" });
  let text = "";
  for await (const c of req) if ((text += c).length > 10_000) return json(413, { error: "Too large" });
  try {
    json(200, await action(text ? JSON.parse(text) : {}));
  } catch {
    json(502, { error: "CRM is not reachable. Check the internet." }); // also: unreadable request
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Vibh-Anu Dialer: http://${HOST}  (CRM: ${CRM})`);
  if (process.platform === "win32" && !process.env.DIALER_NO_WINDOW) {
    spawn("cmd", ["/c", "start", "", "msedge", `--app=http://${HOST}/`, "--window-size=440,780"], { windowsHide: true, stdio: "ignore" });
  }
});

void phoneLoop();
void crmLoop();

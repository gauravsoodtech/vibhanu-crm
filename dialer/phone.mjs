// Talks to the Android phone over USB: dial, call state, hang up, record both voices.
// Uses adb + scrcpy from dialer/bin (see README), and ffmpeg from PATH.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("./bin/", import.meta.url));
const tool = (name) => (existsSync(join(BIN, `${name}.exe`)) ? join(BIN, `${name}.exe`) : name);
const ADB = tool("adb");
const SCRCPY = tool("scrcpy");

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 8e6 }, (err, stdout) => resolve(err ? null : stdout.replaceAll("\r", "")));
  });
}
const shell = (...args) => run(ADB, ["shell", ...args]);

/** First phone in `adb devices -l`: { serial, state } or null. state "device" = ready, "unauthorized" = tap Allow. */
export function parseDevices(out) {
  const m = out?.match(/^(\S+)\s+(device|unauthorized|offline)\b/m);
  return m ? { serial: m[1], state: m[2] } : null;
}

/** idle | ringing (incoming) | dialing | active, or null when the phone gave no answer (cable dropped). */
export function parseCallState(out) {
  const nums = (key) => [...(out ?? "").matchAll(new RegExp(`\\b${key}=(-?\\d+)`, "g"))].map((m) => Number(m[1]));
  const call = nums("mCallState");
  if (!call.length) return null;
  if (call.includes(2)) {
    const fg = nums("mForegroundCallState");
    const bg = nums("mBackgroundCallState");
    const precise = [...fg, ...bg].filter((n) => n > 0);
    if (!precise.length) return "active"; // phone does not say more than "in a call": never throw a recording away
    return fg.includes(1) || bg.includes(2) ? "active" : "dialing"; // 1 = active, 2 = on hold
  }
  return call.includes(1) ? "ringing" : "idle";
}

let name = {};
export async function findPhone() {
  const d = parseDevices((await run(ADB, ["devices", "-l"]))?.split("\n").slice(1).join("\n"));
  if (d?.state === "device" && name.serial !== d.serial) {
    const model = ((await shell("getprop", "ro.vendor.oplus.market.name")) || (await shell("getprop", "ro.product.model")) || "").trim();
    name = { serial: d.serial, model: model || "Android phone" };
  }
  return d && { ...d, name: name.model };
}

/** After a loose cable the USB bridge can get stuck while Windows still sees the phone. A restart fixes it. */
export async function resetBridge() {
  await run(ADB, ["kill-server"]);
  await run(ADB, ["start-server"], 20_000);
}

export const callState = async () => parseCallState(await shell("dumpsys", "telephony.registry"));

/** Indian mobile only. The check matters: this string goes to a shell on the phone. */
export async function dial(phone) {
  if (!/^[6-9]\d{9}$/.test(phone)) return false;
  return (await shell("am", "start", "-a", "android.intent.action.CALL", "-d", `tel:+91${phone}`)) !== null;
}

export const hangUp = () => shell("input", "keyevent", "KEYCODE_ENDCALL");

/** Records the call (customer and agent on separate channels) until stopRecorder(). */
export function startRecorder(file) {
  const rec = { file, startedAt: null, exited: false };
  const p = spawn(
    SCRCPY,
    ["--no-video", "--no-window", "--no-control", "--no-audio-playback", "--audio-source=voice-call", "--audio-codec=aac", `--record=${file}`],
    { env: { ...process.env, ADB }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const onText = (t) => {
    if (!rec.startedAt && String(t).includes("Recording started")) rec.startedAt = Date.now();
  };
  p.stdout.on("data", onText);
  p.stderr.on("data", onText);
  rec.done = new Promise((resolve) => {
    const end = () => {
      rec.exited = true;
      resolve();
    };
    p.on("exit", end);
    p.on("error", end);
  });
  rec.kill = () => p.kill();
  return rec;
}

/** Stops the phone side; scrcpy then closes the file properly. Killing scrcpy itself could leave a broken file. */
export async function stopRecorder(rec) {
  if (rec.exited) return;
  await shell("pkill", "-f", "com.genymobile.scrcpy");
  await Promise.race([rec.done, new Promise((r) => setTimeout(r, 5000))]);
  if (!rec.exited) rec.kill();
}

export async function audioSeconds(file) {
  return Number(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])) || 0;
}

/** Joins the parts, evens out both voices, mixes to one small m4a. `skip` = seconds of ringing to drop. */
export function mixArgs(files, skip, out) {
  const join = files.map((_, i) => `[${i}:a]`).join("") + `concat=n=${files.length}:v=0:a=1,aformat=channel_layouts=stereo`;
  const voice = "dynaudnorm=m=8";
  const filter = `${join},channelsplit=channel_layout=stereo[a][b];[a]${voice}[a2];[b]${voice}[b2];[a2][b2]amix=inputs=2:normalize=0,alimiter=limit=0.95[o]`;
  return [
    "-v", "error", "-y",
    ...files.flatMap((f, i) => (i === 0 && skip > 0 ? ["-ss", skip.toFixed(2), "-i", f] : ["-i", f])),
    "-filter_complex", filter, "-map", "[o]", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", out,
  ];
}
export const mix = async (files, skip, out) => (await run("ffmpeg", mixArgs(files, skip, out), 120_000)) !== null;

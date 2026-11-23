import "server-only";
import OpenAI, { toFile } from "openai";

// Groq exposes an OpenAI-compatible API with free Whisper + open-weight LLMs.
const client = () => new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

export type CallInsight = { transcript: string; summary: string; tag: "hot" | "warm" | "cold" };

/** Whisper transcript (each language kept as spoken), then the summary. */
export async function analyseCall(audio: ArrayBuffer, filename: string): Promise<CallInsight> {
  const groq = client();
  const t = await groq.audio.transcriptions.create({
    file: await toFile(Buffer.from(audio), filename),
    // Compared on a real Hinglish call, 3 runs each. "turbo" and auto-detect sometimes turned Hindi into wrong English;
    // "hi" with this English hint kept Hindi as Hindi and English as English every time (pure English calls too).
    model: "whisper-large-v3",
    language: "hi",
    temperature: 0,
    // Spelling hint for names Whisper has never heard (it wrote "Bihabanggala Nukulakara" without this).
    prompt: "Vibh-Anu, Vibhavangal Anukulakara. Real estate call about a property, site visit, budget, Gurugram.",
  });
  const transcript = t.text.trim();
  return { transcript, ...(await summarise(transcript)) };
}

/** English summary + interest tag from a Hindi, Hinglish or English transcript. */
export async function summarise(transcript: string): Promise<Omit<CallInsight, "transcript">> {
  const res = await client().chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You help the sales team of Vibh-Anu (Vibhavangal Anukulakara), a Gurugram real estate group: " +
          "Sampatti sells projects by M3M, Signature Global, Omaxe and Pure Construction; Vibhanu Developer sells " +
          "residential and commercial plots in Dholera Smart City (SIR); Reend arranges home loans. " +
          "You get an automatic transcript of one phone call. Most calls are Hindi or Hinglish, written in Devanagari, Roman or both. " +
          "Speech recognition makes mistakes, so use the whole conversation to understand it, and never invent a detail that was not said. If a number is unclear, quote it exactly as heard instead of guessing. " +
          "Hindi amounts: pauna crore or paun crore = 75 lakh, sava crore = 1.25 crore, dedh crore = 1.5 crore, paune do crore = 1.75 crore, " +
          "sava do crore = 2.25 crore, dhai crore = 2.5 crore, paune teen crore = 2.75 crore, sadhe teen crore = 3.5 crore (same pattern for lakh). " +
          "Hindi time: kal = tomorrow, parson = day after tomorrow, when the talk is about a future visit. " +
          "The Vibh-Anu employee is the caller; the other person is the customer, and the tag is about the customer. " +
          "Name the project if one is mentioned, and " +
          'reply in JSON: {"summary": "2-3 plain English sentences: what the customer wants, budget/location/timeline if said, next step. Always write it in English", ' +
          '"tag": "hot" | "warm" | "cold"} where hot = clear intent to buy or visit soon, warm = interested but unsure, cold = not interested or no info.',
      },
      { role: "user", content: transcript || "(empty transcript)" },
    ],
  });

  const out = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  const tag = ["hot", "warm", "cold"].includes(out.tag) ? out.tag : "warm";
  return { summary: String(out.summary ?? ""), tag };
}

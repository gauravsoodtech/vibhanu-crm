import "server-only";
import OpenAI, { toFile } from "openai";

// Groq exposes an OpenAI-compatible API with free Whisper + open-weight LLMs.
const client = () => new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

export type CallInsight = { transcript: string; summary: string; tag: "hot" | "warm" | "cold" };

/** Whisper transcript, then a short English summary + interest tag for Sales. */
export async function analyseCall(wav: ArrayBuffer): Promise<CallInsight> {
  const groq = client();
  const t = await groq.audio.transcriptions.create({
    file: await toFile(Buffer.from(wav), "call.wav", { type: "audio/wav" }),
    model: "whisper-large-v3-turbo",
    // Spelling hint for names Whisper has never heard (it wrote "Bihabanggala Nukulakara" without this).
    prompt: "Vibh-Anu, Vibhavangal Anukulakara. Real estate call about a property, site visit, budget, Gurugram.",
  });
  const transcript = t.text.trim();

  const res = await groq.chat.completions.create({
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
          "Given a call transcript (it may be Hindi, English or mixed), name the project if the caller mentions one, and " +
          'reply in JSON: {"summary": "2-3 plain English sentences: who called, what they want, budget/location/timeline if said, next step", ' +
          '"tag": "hot" | "warm" | "cold"} where hot = clear intent to buy or visit soon, warm = interested but unsure, cold = not interested or no info.',
      },
      { role: "user", content: transcript || "(empty transcript)" },
    ],
  });

  const out = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  const tag = ["hot", "warm", "cold"].includes(out.tag) ? out.tag : "warm";
  return { transcript, summary: String(out.summary ?? ""), tag };
}

import { describe, expect, it } from "vitest";
import { hasHindi, isFaithful, pickTranscript } from "./hinglish";

describe("hinglish", () => {
  const hi = "हाँ जी, मुझे 3 BHK चाहिए, बजट डेढ़ करोड़ तक है। शनिवार को 11 बजे आ जाऊंगा।";

  it("keeps the fullest transcript", () => {
    const good = "Okay. मुझे 3 BHK चाहिए, बजट डेढ़ करोड़ है।";
    expect(pickTranscript(["Okay. I want a 3 BHK, budget 1.5 crore.", good, "Okay. बजट है।"])).toBe(good);
    const spelled = "ओके। मुझे 3 बीएचके चाहिए, बजट डेढ़ करोड़।"; // more Hindi letters, but a word is missing
    expect(pickTranscript([spelled, good])).toBe(good);
    expect(pickTranscript(["I want a flat.", "I want a flat in Gurugram."])).toBe("I want a flat in Gurugram.");
    expect(pickTranscript([good, Array(60).fill("हाँ जी").join(" ")])).toBe(good); // stuck in a loop
    expect(pickTranscript([""])).toBe("");
  });

  it("accepts a plain rewrite", () => {
    expect(hasHindi(hi)).toBe(true);
    expect(isFaithful(hi, "Haan ji, mujhe 3 BHK chahiye, budget dedh crore tak hai. Shanivaar ko 11 baje aa jaunga.")).toBe(true);
  });

  it("rejects leftovers, dropped or added text, and changed numbers", () => {
    expect(isFaithful(hi, "Haan ji, mujhe 3 BHK चाहिए, budget dedh crore tak hai. Shanivaar ko 11 baje aa jaunga.")).toBe(false);
    expect(isFaithful(hi, "Mujhe 3 BHK chahiye 11 baje.")).toBe(false);
    expect(isFaithful(hi, "Haan ji, mujhe 2 BHK chahiye, budget dedh crore tak hai. Shanivaar ko 11 baje aa jaunga.")).toBe(false);
    expect(isFaithful(hi, "Here is the text: Haan ji, mujhe 3 BHK chahiye, budget dedh crore tak hai. Shanivaar ko 11 baje aa jaunga. Thank you so much.")).toBe(false);
    expect(isFaithful(hi, "")).toBe(false);
  });
});

// Pure checks for the Hinglish step in ai.ts, so they can be unit tested.

export const hasHindi = (s: string) => /[ऀ-ॿ]/.test(s);

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const digits = (s: string) => (s.match(/\d+/g) ?? []).sort().join();

/**
 * Whisper is run a few times on the same call because it sometimes skips a part or turns Hindi into English.
 * Drop versions that lost Hindi (under 70% of the best one), then keep the longest. Simply taking "the most Hindi"
 * preferred versions with English words spelled in Hindi letters. A version stuck repeating itself is only used if all are.
 */
export function pickTranscript(all: string[]): string {
  const list = all.map((t) => t.trim());
  const stuck = (t: string) => words(t) > 30 && new Set(t.split(/\s+/)).size / words(t) < 0.3;
  const usable = list.filter((t) => !stuck(t));
  const hindi = (t: string) => t.split(/\s+/).filter(hasHindi).length;
  const pool = usable.length ? usable : list;
  const most = Math.max(...pool.map(hindi));
  return pool.filter((t) => hindi(t) >= most * 0.7).reduce((best, t) => (words(t) > words(best) ? t : best));
}

/**
 * Is `roman` a faithful rewrite of `original` in English letters? Same script everywhere, about the same
 * number of words (nothing dropped or invented) and the same digits (budgets, times). If not, keep the original.
 */
export function isFaithful(original: string, roman: string): boolean {
  const ratio = words(roman) / Math.max(1, words(original));
  return !hasHindi(roman) && ratio > 0.85 && ratio < 1.15 && digits(roman) === digits(original);
}

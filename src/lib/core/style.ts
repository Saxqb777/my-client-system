/**
 * Saaqib's writing style for everything Orbit generates:
 * no hyphens or em dashes as punctuation, colons are fine, short and action oriented.
 */

export const WRITING_STYLE_RULES = [
  "Write clean, professional, simple English.",
  "Never use hyphens, en dashes or em dashes as punctuation. Use a colon, a comma or a new sentence instead.",
  "Do not hyphenate compound words: write sign off, go live, follow up, kick off, walk through.",
  "Short action oriented lines. No fluff, no filler, no marketing tone.",
  "Use dates like 15 Oct 2026.",
].join(" ");

const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;

/** Applies the style rules to text produced by AI or templates. Keeps ISO dates intact. */
export function cleanStyle(input: string): string {
  if (!input) return input;
  const keep: string[] = [];
  let text = input.replace(ISO_DATE, (m) => {
    keep.push(m);
    return `\u0000${keep.length - 1}\u0000`;
  });

  // Em and en dashes used as punctuation become colons.
  text = text.replace(/\s*[—–]\s*/g, ": ");
  // Spaced hyphen used as punctuation becomes a colon.
  text = text.replace(/\s+-\s+/g, ": ");
  // Bulleted lines that start with "- " keep a neutral bullet.
  text = text.replace(/^(\s*)-\s+/gm, "$1• ");
  // Hyphenated words become two words, except digit-digit like phone numbers or ranges.
  text = text.replace(/([A-Za-z])-([A-Za-z])/g, "$1 $2");
  // Tidy double colons or spaces.
  text = text.replace(/:\s*:/g, ":").replace(/[ \t]{2,}/g, " ");

  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}

export function firstSentence(text: string, max = 90): string {
  const clean = cleanStyle(text).trim();
  const cut = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  if (cut.length <= max) return cut;
  return cut.slice(0, max - 1).trimEnd() + "…";
}

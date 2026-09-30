import JSZip from "jszip";

/** Plain text out of a Word file: one line per paragraph, table cells joined with a tab. Nothing else is read. */
export async function docxToText(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a Word document: word/document.xml is missing");
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, "&");
  const strip = (x: string) => x.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  // A table row becomes one line, its cells joined by a tab, so a requirement table reads as ID, text, source.
  const flat = xml.replace(/<w:tr[\s>][\s\S]*?<\/w:tr>/g, (tr) => {
    const cells = tr.split(/<\/w:tc>/).map(strip).filter(Boolean);
    return `<w:p><w:r><w:t>${cells.join("\t")}</w:t></w:r></w:p>`;
  });
  return flat
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .split(/<\/w:p>/)
    .map((p) => decode(p.replace(/<[^>]+>/g, "")).replace(/\t+$/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Sentences and list lines, trimmed, no duplicates, nothing shorter than three words. Leading bullets and list numbers go. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.replace(/\r/g, "").split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw.replace(/^\s*(?:[•*\-]|\d{1,3}[.)])\s+/, "").replace(/\t+/g, " ").trim();
    if (s.split(/\s+/).length < 3) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Wording that leaves a requirement open to interpretation. Each entry: the pattern and the words to name it by. */
export const VAGUE_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /\betc\b\.?/i, name: "etc" },
  { re: /\band so on\b/i, name: "and so on" },
  { re: /\bas (needed|required|appropriate|applicable|necessary)\b/i, name: "as needed" },
  { re: /\bwhere (applicable|appropriate|possible|needed)\b/i, name: "where applicable" },
  { re: /\bif (possible|required|needed)\b/i, name: "if possible" },
  { re: /\b(tbd|tbc|to be (decided|confirmed|defined|determined))\b/i, name: "to be decided" },
  { re: /\bvarious\b/i, name: "various" },
  { re: /\b(user|customer) friendly\b/i, name: "user friendly" },
  { re: /\b(fast|quick|quickly|timely|in a timely manner|asap|as soon as possible|promptly)\b/i, name: "no time given" },
  { re: /\b(easy|easily|intuitive|seamless|seamlessly|robust|flexible|scalable|efficient|efficiently)\b/i, name: "quality word without a measure" },
  { re: /\b(several|a number of|a few)\b/i, name: "no count given" },
  { re: /\bbest effort\b/i, name: "best effort" },
  { re: /\b(relevant|necessary|required) (data|fields|information|details)\b/i, name: "unnamed data" },
  { re: /\b(may|might|could) (possibly )?be (considered|explored)\b/i, name: "not a commitment" },
];

export function vagueReasons(sentence: string): string[] {
  return VAGUE_PATTERNS.filter((p) => p.re.test(sentence)).map((p) => p.name);
}

const NUMBER_WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30", hundred: "100" };

/** Numbers in a sentence, digits or words, as digit strings. */
export function numbersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []) found.add(m.replace(",", "."));
  for (const w of text.toLowerCase().match(/\b[a-z]+\b/g) ?? []) if (NUMBER_WORDS[w]) found.add(NUMBER_WORDS[w]);
  return Array.from(found);
}

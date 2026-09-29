import JSZip from "jszip";
import type { TranscriptSegment } from "@/lib/db/schema";

/**
 * Turns whatever a transcript arrives as into timed segments: WebVTT and SRT from Teams, Zoom or the
 * Mac helper, a Teams .docx export, or plain text with or without "[hh:mm:ss] Name:" prefixes.
 * Speakers are kept as written; "me" and "other" are what the Mac helper sends.
 */

export type ParsedTranscript = { segments: TranscriptSegment[]; fullText: string; wordCount: number; durationSec: number };

const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

/** "01:02:03.500" or "02:03" to seconds. */
export function parseClock(value: string): number | null {
  const m = value.trim().match(new RegExp(`^${TIME.source}$`));
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return h * 3600 + min * 60 + s + ms / 1000;
}

function clean(text: string): string {
  return text
    .replace(/<\/?v[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function finish(segments: TranscriptSegment[]): ParsedTranscript {
  const merged = mergeRuns(segments.filter((s) => s.text.trim()));
  const fullText = merged.map((s) => s.text).join("\n");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const durationSec = merged.length ? Math.max(...merged.map((s) => s.end)) : 0;
  return { segments: merged, fullText, wordCount, durationSec };
}

/** Consecutive cues from the same speaker become one segment, so the viewer reads as turns, not captions. */
export function mergeRuns(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.speaker === s.speaker && s.start - last.end < 3 && (last.text.length + s.text.length) < 700) {
      last.text = `${last.text} ${s.text}`.trim();
      last.end = Math.max(last.end, s.end);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** WebVTT: cue lines "00:00:01.000 --> 00:00:04.000" then text, optionally "<v Name>text". SRT: numbered blocks with commas. */
export function parseVtt(raw: string): ParsedTranscript {
  const lines = raw.replace(/\r/g, "").split("\n");
  const segments: TranscriptSegment[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const arrow = line.match(new RegExp(`^\\s*(${TIME.source})\\s*-->\\s*(${TIME.source})`));
    if (arrow) {
      const start = parseClock(arrow[1]) ?? 0;
      const end = parseClock(arrow[6]) ?? start;
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      const body = textLines.join(" ");
      const voice = body.match(/<v\s+([^>]+)>/);
      const speakerFromColon = !voice ? body.match(/^\s*([A-Z][\w .'-]{1,40}?):\s+(.+)$/) : null;
      const speaker = voice ? voice[1].trim() : speakerFromColon ? speakerFromColon[1].trim() : "other";
      const text = clean(voice ? body : speakerFromColon ? speakerFromColon[2] : body);
      segments.push({ start, end, speaker, text });
    }
    i++;
  }
  return finish(segments);
}

/**
 * Plain text. Accepts "[00:12:03] Name: text", "00:12 Name: text", "Name: text" and bare lines.
 * Without clocks, time is estimated at 2.5 words per second so the notes still get rough timestamps.
 */
export function parsePlainText(raw: string): ParsedTranscript {
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  let sawClock = false;
  for (const line of lines) {
    const m = line.match(new RegExp(`^\\[?(${TIME.source})\\]?\\s*[-:]?\\s*(?:([A-Z][\\w .'-]{1,40}?):\\s+)?(.+)$`));
    let start: number | null = null;
    let speaker = "other";
    let text = line;
    if (m && parseClock(m[1]) !== null) {
      start = parseClock(m[1]);
      sawClock = true;
      speaker = m[6]?.trim() || "other";
      text = m[7];
    } else {
      const sp = line.match(/^([A-Z][\w .'-]{1,40}?):\s+(.+)$/);
      if (sp) {
        speaker = sp[1].trim();
        text = sp[2];
      }
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    const dur = Math.max(2, words / 2.5);
    const s = start ?? cursor;
    segments.push({ start: s, end: s + dur, speaker, text: clean(text) });
    cursor = s + dur;
  }
  const parsed = finish(segments);
  return sawClock ? parsed : { ...parsed, durationSec: Math.round(parsed.durationSec) };
}

/** Teams .docx export: paragraphs of "Name  0:12" followed by the words. Falls back to plain text rules. */
export async function parseDocx(buffer: ArrayBuffer | Buffer): Promise<ParsedTranscript> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a Word file");
  const paragraphs = Array.from(xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)).map((m) =>
    Array.from(m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g))
      .map((t) => (t[0] === "<w:tab/>" ? " " : t[1]))
      .join("")
      .trim(),
  );
  const lines: string[] = [];
  let pendingHeader: { speaker: string; clock: string } | null = null;
  for (const p of paragraphs) {
    if (!p) continue;
    const header = p.match(new RegExp(`^([A-Z][\\w .'-]{1,60}?)\\s+(${TIME.source})$`));
    if (header) {
      pendingHeader = { speaker: header[1].trim(), clock: header[2] };
      continue;
    }
    if (pendingHeader) {
      lines.push(`[${pendingHeader.clock}] ${pendingHeader.speaker}: ${p}`);
      pendingHeader = null;
    } else {
      lines.push(p);
    }
  }
  return parsePlainText(lines.join("\n"));
}

export async function parseTranscriptFile(name: string, buffer: ArrayBuffer | Buffer): Promise<ParsedTranscript> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return parseDocx(buffer);
  const text = Buffer.from(buffer as ArrayBuffer).toString("utf8");
  return parseTranscriptText(text);
}

export function parseTranscriptText(text: string): ParsedTranscript {
  const head = text.trimStart().slice(0, 200);
  if (/^WEBVTT/.test(head) || /-->/.test(text.slice(0, 2000))) return parseVtt(text);
  return parsePlainText(text);
}

/** "[12:03] Speaker: text" lines for the prompts. Mac helper speakers "me" and "other" become Me and Others. */
export function transcriptForPrompt(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${clock(s.start)}] ${speakerLabel(s.speaker)}: ${s.text}`).join("\n");
}

export function speakerLabel(speaker: string): string {
  if (speaker === "me") return "Me";
  if (speaker === "other") return "Others";
  return speaker;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Splits a long transcript into windows of at most `maxMinutes`, cut at speaker turns. */
export function chunkSegments(segments: TranscriptSegment[], maxMinutes = 45): TranscriptSegment[][] {
  if (segments.length === 0) return [];
  const limit = maxMinutes * 60;
  const chunks: TranscriptSegment[][] = [[]];
  let windowStart = segments[0].start;
  for (const s of segments) {
    if (s.start - windowStart > limit && chunks[chunks.length - 1].length > 0) {
      chunks.push([]);
      windowStart = s.start;
    }
    chunks[chunks.length - 1].push(s);
  }
  return chunks;
}

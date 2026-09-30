/** Which transcript files Orbit reads, and how big. Pure, so the browser and the server share the same rules. */

export const TRANSCRIPT_EXTENSIONS = [".vtt", ".srt", ".txt", ".md", ".docx"] as const;
/** Files the browser can read as plain text (a Word file is read on the server). */
export const TEXT_TRANSCRIPT_EXTENSIONS = [".vtt", ".srt", ".txt", ".md"] as const;
/** Vercel refuses request bodies over 4.5 MB, so 4 MB leaves room for the form around the file. */
export const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024;
export const TRANSCRIPT_ACCEPT = ".vtt,.srt,.txt,.md,.docx,text/plain,text/vtt";

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export function isTextTranscript(name: string): boolean {
  return (TEXT_TRANSCRIPT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Null when the file is fine, else the message to show. */
export function transcriptFileProblem(name: string, size: number): string | null {
  if (!(TRANSCRIPT_EXTENSIONS as readonly string[]).includes(extensionOf(name))) return "Orbit reads .vtt, .srt, .txt, .md and .docx transcripts";
  if (size > MAX_TRANSCRIPT_BYTES) return "That file is over 4 MB";
  if (size === 0) return "That file is empty";
  return null;
}

/**
 * A meeting title from a file name: "ADFH_x_Fero-BRD-Session-3 Transcript.vtt" becomes "ADFH x Fero BRD Session 3".
 * Teams names like "Meeting Transcript" or a bare recording stamp give nothing, so Orbit names the meeting itself.
 */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/[_\-\u2013\u2014]+/g, " ")
    .replace(/\b(recording|transcript|transcription|meeting transcript)\b/gi, " ")
    .replace(/\b\d{8}[ T]?\d{0,6}\b/g, " ")
    .replace(/\(\d+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[a-z]/i.test(cleaned) || /^meeting$/i.test(cleaned)) return "";
  return cleaned.slice(0, 300);
}

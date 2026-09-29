import type { TranscriptSegment } from "@/lib/db/schema";
import { WRITING_STYLE_RULES } from "@/lib/core/style";
import { chunkSegments, transcriptForPrompt } from "@/lib/meetings/transcript";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

/** Above this the transcript is condensed part by part before the minutes and notes calls. */
export const LONG_MEETING_MINUTES = 120;

/**
 * Long meetings: each 45 minute part is condensed to the statements that matter, keeping the [m:ss]
 * stamps, all parts in parallel, then the minutes and notes run on the condensed whole. Keeps every
 * call well inside the function time limit without losing who said what and when.
 */
export async function condenseTranscript(segments: TranscriptSegment[]): Promise<string> {
  const chunks = chunkSegments(segments, 45);
  if (!aiEnabled()) return chunks.map((c) => transcriptForPrompt(c).slice(0, 20000)).join("\n\n");
  const client = anthropic();
  const parts = await Promise.all(
    chunks.map(async (chunk, i) => {
      const res = await client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 6000,
        betas: [...FALLBACK_BETAS],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: `You condense part ${i + 1} of ${chunks.length} of a meeting transcript for the person who will write the minutes. Keep every decision, request, number, date, name, risk and disagreement, each as one line that starts with the [m:ss] stamp and the speaker exactly as given. Drop small talk and repetition. Output plain lines only. ${WRITING_STYLE_RULES}`,
        messages: [{ role: "user", content: transcriptForPrompt(chunk) }],
      });
      return res.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }),
  );
  return parts.join("\n\n");
}

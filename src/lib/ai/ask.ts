import { formatDate } from "@/lib/core/dates";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { latestMinuted, meetingContext, searchMeetings } from "@/lib/data/meetingLibrary";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

export type AskSource = { meetingId: string; title: string; heldAt: Date; clientCode: string | null; label: string };
export type AskAnswer = { answer: string; sources: AskSource[]; engine: "claude" | "rules" };

/**
 * Ask Orbit: a question answered from meeting history only. Keyword search picks the meetings, Claude
 * answers from their minutes and notes and cites them as [M1], [M2]. Nothing outside those meetings is used.
 */
export async function askOrbit(question: string, clientId: string | null): Promise<AskAnswer> {
  const hits = await searchMeetings(question, clientId, 6);
  const ids = hits.length ? hits.map((h) => h.meetingId) : await latestMinuted(clientId, 4);
  const ctx = await meetingContext(ids);
  const sources: AskSource[] = ctx.map((c, i) => ({ meetingId: c.meetingId, title: c.title, heldAt: c.heldAt, clientCode: c.clientCode, label: `M${i + 1}` }));

  if (ctx.length === 0) return { answer: "No meetings on record match that yet.", sources: [], engine: "rules" };
  if (!aiEnabled()) return { answer: "Claude is not configured, so here are the meetings that match. Open one to read it.", sources, engine: "rules" };

  const client = anthropic();
  const res = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 2500,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [
      {
        type: "text",
        text: `You answer Saaqib's questions about his client meetings using only the meeting records given. Cite every claim with the record label in square brackets, like [M1]. If the records do not answer the question, say what is missing in one line. Keep it short: a few lines or a short list. ${WRITING_STYLE_RULES}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `Question: ${question.trim()}`,
          "",
          ...ctx.map((c, i) => `[M${i + 1}] ${c.title}, ${formatDate(c.heldAt)}${c.clientCode ? `, ${c.clientCode}` : ""}\n${c.text}`),
        ].join("\n\n"),
      },
    ],
  });
  if (res.stop_reason === "refusal") return { answer: "Claude declined to answer this one.", sources, engine: "claude" };
  const answer = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { answer: cleanStyle(answer), sources, engine: "claude" };
}

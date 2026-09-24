import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = process.env.ORBIT_AI_MODEL?.trim() || "claude-opus-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) cached = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return cached;
}

/** Beta flags used on every Orbit request so a rare safety decline still returns a usable answer. */
export const FALLBACK_BETAS = ["server-side-fallback-2026-07-01"] as const;

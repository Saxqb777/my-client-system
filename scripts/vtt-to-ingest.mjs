// Turns a WebVTT file into an ingest body. Usage: node scripts/vtt-to-ingest.mjs file.vtt "Calendar title" 2026-09-29T09:00:00+04:00 > body.json
import { readFileSync } from "node:fs";

const [file, calendarTitle = "", startedAt = new Date().toISOString()] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/vtt-to-ingest.mjs file.vtt [calendarTitle] [startedAt]");
  process.exit(1);
}
const raw = readFileSync(file, "utf8").replace(/\r/g, "");
const lines = raw.split("\n");
const clock = (s) => {
  const m = s.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return 0;
  return (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, "0")) / 1000 : 0);
};
const segments = [];
for (let i = 0; i < lines.length; i++) {
  const arrow = lines[i].match(/^\s*(\S+)\s*-->\s*(\S+)/);
  if (!arrow) continue;
  const text = [];
  let j = i + 1;
  while (j < lines.length && lines[j].trim() !== "") text.push(lines[j++]);
  const body = text.join(" ");
  const voice = body.match(/<v\s+([^>]+)>/);
  const speaker = voice ? voice[1].trim() : "other";
  segments.push({ start: clock(arrow[1]), end: clock(arrow[2]), speaker: /saaqib/i.test(speaker) ? "me" : speaker, text: body.replace(/<[^>]+>/g, "").trim() });
  i = j;
}
const attendees = Array.from(new Set(segments.map((s) => s.speaker).filter((s) => s !== "me" && s !== "other")));
process.stdout.write(JSON.stringify({ source: "mac_helper", startedAt, calendarTitle, attendees, language: "en", segments }, null, 0));

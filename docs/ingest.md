# Meeting ingest contract

How a transcript gets into Orbit without Saaqib touching it. The Mac helper (Phase 3) is the main sender. Anything that can POST JSON can use it.

## Auth

- Header: `Authorization: Bearer <ORBIT_INGEST_TOKEN>`.
- The token lives in Vercel, project orbit, Environment Variables, key `ORBIT_INGEST_TOKEN`. Phase 1 sets it on Preview only. It is separate from `ORBIT_API_TOKEN` so the Mac can be rotated on its own.
- Limits: body up to 5 MB (`ORBIT_INGEST_MAX_MB`), 30 meetings per hour (`ORBIT_INGEST_PER_HOUR`). Over the limit returns 413 or 429.

## POST /api/meetings/ingest

```json
{
  "source": "mac_helper",
  "startedAt": "2026-09-29T09:03:00+04:00",
  "endedAt": "2026-09-29T09:58:00+04:00",
  "calendarTitle": "ADFH x Fero BRD Session 2",
  "attendees": ["Saaqib Irfan", "Nadia Haddad"],
  "language": "en",
  "segments": [
    { "start": 4.0, "end": 11.0, "speaker": "me", "text": "Good morning everyone..." },
    { "start": 12.0, "end": 21.0, "speaker": "other", "text": "Thanks Saaqib..." }
  ],
  "fullText": "optional, the segments joined",
  "clientCode": "ADFH"
}
```

- `segments` or `fullText` is required. Speakers: `me` for Saaqib's microphone, `other` for system audio, or a name when known.
- `clientCode` is optional. When present Orbit skips matching. When absent Orbit matches on the calendar title, attendees against the client's people, and the words in the transcript.
- Idempotent: the same start minute plus the same opening words is the same meeting. Sending twice returns 200 with `status: "duplicate"` and the existing id.

Responses

- 202 `{ "meetingId": "...", "status": "received", "processing": "received" }`
- 200 `{ "meetingId": "...", "status": "duplicate" }`
- 400 bad body, 401 bad token, 413 too big, 429 too many this hour.

Processing runs after the response inside the same request, up to 300 seconds. It matches the client, drafts the MOM in the approved layout, the additional details sheet and the understanding notes, and marks the meeting `processed`, or `needs_review` when the client is not clear, or `failed` with the reason.

## GET /api/meetings/{id}/status

Poll every 10 to 15 seconds after ingest until `processing` is `processed`, `needs_review` or `failed`. Body: `{ id, title, clientId, otherWork, processing, errorMessage, processedAt, matchConfidence }`.

## POST /api/meetings/{id}/process

Runs the pipeline again. The helper calls it when a meeting is still `received` or `processing` five minutes after ingest (the function may have been cut off). Orbit's Retry button uses the same route.

## GET /api/v1/vocabulary

`{ terms: [{ term, type, meaning }], prompt: "ADFH, ADSO, ..." }`. Feed `prompt` to the transcriber as its initial prompt so client names, people and acronyms come out spelled right.

## Local testing

Set `ORBIT_INGEST_TOKEN` in `.env.development.local`, run `pnpm dev`, then

```bash
curl -s -X POST http://localhost:3000/api/meetings/ingest \
  -H "Authorization: Bearer $ORBIT_INGEST_TOKEN" -H "Content-Type: application/json" \
  --data @tests/fixtures/sample-ingest.json
```

`tests/fixtures/sample-meeting.vtt` is a made up ADFH style meeting. `scripts/vtt-to-ingest.mjs` turns any .vtt into an ingest body.

export function GET() {
  return Response.json({ ok: true, app: "orbit", time: new Date().toISOString() });
}

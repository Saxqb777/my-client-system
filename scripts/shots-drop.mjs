// Drag and drop checks: a file dropped on /meetings opens Add a transcript with the file and a title, and a Word
// file dropped on a client's minutes builder lands in the transcript box. Usage: node scripts/shots-drop.mjs [base]
import { readFileSync } from "node:fs";
import { Document, Packer, Paragraph } from "docx";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const password = process.env.ORBIT_PASSWORD ?? "orbit-local-dev";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

/** Fires the drag events a real drop would, with a File built in the page. `hold` stops before the drop. */
async function drag(name, bytes, mime, { hold = false } = {}) {
  const dt = await page.evaluateHandle(({ name, b64, mime }) => {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([raw], name, { type: mime }));
    return d;
  }, { name, b64: Buffer.from(bytes).toString("base64"), mime });
  await page.dispatchEvent("body", "dragenter", { dataTransfer: dt });
  await page.dispatchEvent("body", "dragover", { dataTransfer: dt });
  if (!hold) await page.dispatchEvent("body", "drop", { dataTransfer: dt });
  return dt;
}

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
if (page.url().includes("/login")) {
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
}

// 1. /meetings: hold a file over the page, then drop it.
await page.goto(`${base}/meetings`, { waitUntil: "networkidle" });
const vtt = readFileSync("tests/fixtures/sample-meeting.vtt");
const held = await drag("ADFH_x_Fero-BRD-Session-4 Transcript.vtt", vtt, "text/vtt", { hold: true });
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/drop-overlay.png" });
console.log("overlay shown:", await page.getByText("Drop the transcript").isVisible());
await page.dispatchEvent("body", "drop", { dataTransfer: held });
await page.waitForSelector("text=Add a transcript >> nth=1", { timeout: 10000 });
await page.waitForTimeout(400);
console.log("title:", await page.locator("[role=dialog] input").first().inputValue());
console.log("file shown:", await page.getByText("ADFH_x_Fero-BRD-Session-4 Transcript.vtt").isVisible());
await page.screenshot({ path: "shots/drop-dialog.png" });

// A file Orbit cannot read is refused with a message and changes nothing.
await drag("recording.mp4", Buffer.from("not a transcript"), "video/mp4");
await page.waitForTimeout(500);
console.log("bad type refused:", await page.getByText(/Orbit reads \.vtt/).first().isVisible());

// Send it: the meeting page opens.
await Promise.all([page.waitForURL(/\/meetings\/[0-9a-f-]{36}/, { timeout: 60000 }), page.getByRole("button", { name: /Send to Orbit/ }).click()]);
console.log("meeting page:", page.url().replace(base, ""));
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/drop-sent.png" });

// 2. A client's minutes builder: drop a Teams style Word transcript into the box.
await page.goto(`${base}/clients`, { waitUntil: "networkidle" });
await Promise.all([page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60000 }), page.click("table.ledger tbody tr")]);
await page.waitForLoadState("networkidle");
await page.getByRole("tab", { name: /Meetings/ }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Set a meeting/ }).click();
await page.waitForTimeout(400);
await page.fill("input[placeholder^='UAT session']", "Drop test working session");
await page.locator("input[type=datetime-local]").first().fill("2026-09-24T10:30");
await page.getByRole("button", { name: /^Set meeting/ }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Add the transcript/ }).first().click();
await page.waitForTimeout(600);
const doc = new Document({
  sections: [{
    children: [
      new Paragraph("Nadia Haddad   0:03"),
      new Paragraph("Morning all, today we close the open points on the payment flow."),
      new Paragraph("Saaqib Khan   0:12"),
      new Paragraph("We will share the updated services list with the beneficiary IBANs by Thursday."),
    ],
  }],
});
const docxBytes = await Packer.toBuffer(doc);
const before = (await page.locator("[role=dialog] textarea").first().inputValue()).length;
await drag("Drop test working session.docx", docxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
await page.waitForFunction((n) => (document.querySelector("[role=dialog] textarea")?.value.length ?? 0) > n, before, { timeout: 20000 });
const box = await page.locator("[role=dialog] textarea").first().inputValue();
console.log("word file read into the box:", /\[[0-9:]*12\] Saaqib Khan: We will share/.test(box));
await page.screenshot({ path: "shots/drop-minutes.png" });

console.log("errors:", errors.length);
for (const e of errors.slice(0, 5)) console.log("   ", e.slice(0, 300));
await browser.close();

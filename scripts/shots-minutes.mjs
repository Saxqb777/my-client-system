// Review sheet screenshots for the standard MOM. Usage: NODE_PATH=$(npm root -g) node scripts/shots-minutes.mjs
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const password = process.env.ORBIT_PASSWORD ?? "orbit-local-dev";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
if (page.url().includes("/login")) {
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
}
try {
await page.goto(`${base}/clients`, { waitUntil: "networkidle" });
await Promise.all([page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60000 }), page.click("table.ledger tbody tr")]);
await page.waitForLoadState("networkidle");
await page.getByRole("tab", { name: /Meetings/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "shots/mom-meetings.png" });
console.log("shot mom-meetings");

// Set a meeting in the past so it asks for a transcript
await page.getByRole("button", { name: /Set a meeting/ }).click();
await page.waitForTimeout(500);
await page.fill("input[placeholder^='UAT session']", "OMS x Maqta Pay Joint Working Session");
const dt = page.locator("input[type=datetime-local]").first();
await dt.fill("2026-09-24T10:30");
await page.fill("input[placeholder^='Teams']", "Microsoft Teams");
await page.getByRole("button", { name: /^Set meeting/ }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Add the transcript/ }).first().click();
await page.waitForTimeout(600);
await page.fill("textarea", [
  "Speaker 1: Joint working session with Maqta Pay and Oracle Fusion on payment collection.",
  "Speaker 2: First phase covers debit and credit cards only. Apple Pay later.",
  "Speaker 1: Settlement through Magnati via FAB so funds land in the Food Hub account, T plus 2.",
  "Speaker 3: We need the services list grouped by service with beneficiary IBANs before onboarding.",
  "Speaker 2: Under the e invoicing mandate the OMS issues the tax invoice and posts to Fusion for reporting only.",
].join("\n"));
await page.getByRole("button", { name: /Build the minutes/ }).click();
await page.waitForSelector("text=Meeting Objective", { timeout: 60000 });
await page.waitForTimeout(600);
// Fill the frame the way Claude would
await page.fill("textarea >> nth=0", "Joint working session with the Maqta Pay and Oracle Fusion teams to define how payment collection, invoicing and revenue recording will work between the OMS, Maqta Pay and Oracle Fusion.");
await page.fill("input[placeholder=Topic] >> nth=0", "Payment Scope");
await page.fill("textarea >> nth=1", "Debit and credit card payments only for the first phase, with other methods such as Apple Pay deferred. Multiple charge codes can be selected and paid in a single transaction.");
await page.getByRole("button", { name: /Add a point/ }).click();
await page.fill("input[placeholder=Topic] >> nth=1", "Settlement Model");
await page.fill("textarea >> nth=2", "The Magnati model through the FAB system is preferred over CyberSource, so that funds are deposited directly to the Food Hub account on a T+2 basis.");
await page.getByRole("button", { name: /Add an action/ }).click();
await page.fill("input[placeholder=Action] >> nth=0", "Share the services list with charge details, grouped by service and linked to the beneficiary IBANs");
await page.fill("input[placeholder=Owner] >> nth=0", "Muthu Mohammed Sheik");
await page.getByRole("button", { name: /Add an action/ }).click();
await page.fill("input[placeholder=Action] >> nth=1", "Confirm the OMS capability to generate tax invoices, including upload to the FTA portal");
await page.fill("input[placeholder=Owner] >> nth=1", "Fero");
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/mom-review.png" });
console.log("shot mom-review");
await page.getByRole("button", { name: /Preview as text/ }).click();
await page.waitForTimeout(300);
const sheet = page.locator("[role=dialog]").first();
await sheet.screenshot({ path: "shots/mom-review-full.png" }).catch(async () => page.screenshot({ path: "shots/mom-review-full.png", fullPage: true }));
console.log("shot mom-review-full");
await page.getByRole("button", { name: /Save minutes/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: "shots/mom-saved.png" });
console.log("shot mom-saved");
// Download the Word file
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("link", { name: /Download Word/ }).first().click()]);
const path = "shots/mom-download.docx";
await download.saveAs(path);
console.log("downloaded", download.suggestedFilename(), "->", path);
console.log("errors:", errors.length);
for (const e of errors.slice(0, 5)) console.log("   ", e.slice(0, 300));
} catch (e) {
  console.log("FAILED:", String(e).slice(0, 300));
  await page.screenshot({ path: "shots/mom-error.png" });
  const dialog = page.locator("[role=dialog]").first();
  if (await dialog.count()) {
    const names = await dialog.locator("button").evaluateAll((els) => els.map((b) => (b.textContent || "").trim()).filter(Boolean));
    console.log("buttons in dialog:", JSON.stringify(names).slice(0, 600));
    console.log("labels:", JSON.stringify(await dialog.locator("label").evaluateAll((els) => els.map((l) => (l.textContent || "").trim()))).slice(0, 600));
  }
}
await browser.close();

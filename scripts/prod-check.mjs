// Production smoke test: login, load demo data once, screenshot home and a Quick Log parse.
// Usage: ORBIT_PASSWORD=... node scripts/prod-check.mjs https://orbit-eta-brown.vercel.app
import { chromium } from "playwright-core";

const base = process.argv[2];
const password = process.env.ORBIT_PASSWORD;
if (!base || !password) {
  console.error("usage: ORBIT_PASSWORD=... node scripts/prod-check.mjs <baseUrl>");
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill("#password", password);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
console.log("login ok ->", page.url());

await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
const loaded = await page.locator("text=Loaded").count();
if (!loaded) {
  await page.click("button:has-text('Load demo data')");
  await page.waitForSelector("text=Demo data loaded", { timeout: 90000 });
  console.log("demo data loaded");
} else {
  console.log("demo data already loaded");
}

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/prod-home.png" });
console.log("home ok");

await page.fill("input[aria-label='Quick log']", "ADFH UAT signed off, go live moved to 15 Oct. Waiting on Noura for the integration list");
await page.press("input[aria-label='Quick log']", "Enter");
await page.waitForSelector("text=Save to Orbit", { timeout: 90000 });
const engine = await page.locator("text=Understood by Claude").count();
console.log("quick log parsed by:", engine ? "Claude" : "rules");
await page.screenshot({ path: "shots/prod-quicklog.png" });
await page.keyboard.press("Escape");

await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
const claude = await page.locator("li:has-text('Claude') >> text=Connected").count();
console.log("settings shows Claude connected:", Boolean(claude));

console.log("console errors:", errors.length);
for (const e of errors.slice(0, 5)) console.log("  ", e.slice(0, 300));
await browser.close();

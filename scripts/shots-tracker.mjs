import { chromium } from "playwright-core";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function session(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill("#password", "orbit-local-dev");
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  }
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  return { page, errors, ctx };
}

const { page, errors, ctx } = await session("light");
await page.goto(`${base}/dates`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: "shots/tracker.png" });
console.log("shot tracker");

// hover a mark
const marks = page.locator("button[aria-label*=', ']").filter({ hasNot: page.locator("svg") });
const count = await marks.count();
console.log("marks:", count);
if (count) {
  await marks.nth(1).hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/tracker-hover.png" });
  console.log("shot tracker-hover");
  await marks.nth(1).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/tracker-pinned.png" });
  console.log("shot tracker-pinned");
  await page.keyboard.press("Escape");
  // drag the mark 120px to the right
  const box = await marks.nth(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 6 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "shots/tracker-drag.png" });
  console.log("shot tracker-drag");
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/tracker-move-dialog.png" });
  console.log("shot tracker-move-dialog");
  await page.keyboard.press("Escape");
}
// hover empty rail to see the add guide
const rails = page.locator("div.relative.select-none");
const rc = await rails.count();
if (rc) {
  const rb = await rails.nth(rc - 1).boundingBox();
  await page.mouse.move(rb.x + rb.width * 0.7, rb.y + rb.height / 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "shots/tracker-guide.png" });
  console.log("shot tracker-guide");
}
await ctx.close();

const dark = await session("dark");
await dark.page.goto(`${base}/clients`, { waitUntil: "networkidle" });
await Promise.all([dark.page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60000 }), dark.page.click("table.ledger tbody tr")]);
await dark.page.waitForLoadState("networkidle");
await dark.page.waitForTimeout(1200);
await dark.page.screenshot({ path: "shots/client-journey-dark.png" });
console.log("shot client-journey-dark");
await dark.page.setViewportSize({ width: 390, height: 844 });
await dark.page.waitForTimeout(500);
await dark.page.screenshot({ path: "shots/client-journey-mobile.png" });
console.log("shot client-journey-mobile");
await dark.ctx.close();
console.log("errors:", errors.length + dark.errors.length);
for (const e of [...errors, ...dark.errors].slice(0, 5)) console.log("  ", e.slice(0, 300));
await browser.close();

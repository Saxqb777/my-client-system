// Screenshot helper for design review. Usage: NODE_PATH=$(npm root -g) node scripts/shots.mjs [baseUrl]
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:3000";
const password = process.env.ORBIT_PASSWORD ?? "orbit-local-dev";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function shoot(name, path, { width = 1440, height = 900, theme = "dark", full = false, before } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (name === "login") {
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/${name}.png` });
    console.log(`shot ${name}`);
    await ctx.close();
    return;
  }
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill("#password", password);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  }
  if (theme === "light") {
    await page.evaluate(() => { localStorage.setItem("theme", "light"); });
  }
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (before) await before(page);
  await page.screenshot({ path: `shots/${name}.png`, fullPage: full });
  console.log(`shot ${name}${errors.length ? ` (errors: ${errors.length})` : ""}`);
  for (const e of errors.slice(0, 5)) console.log("   ", process.env.FULL_ERRORS ? e : e.slice(0, 200));
  await ctx.close();
}

await shoot("login", "/login");
await shoot("home", "/");
await shoot("home-full", "/", { full: true });
await shoot("home-light", "/", { theme: "light" });
await shoot("clients", "/clients");
await shoot("activity", "/activity");
await shoot("settings", "/settings");
await shoot("home-mobile", "/", { width: 390, height: 844, full: true });
await shoot("clients-mobile", "/clients", { width: 390, height: 844 });

// Client detail: first card
await shoot("client", "/clients", {
  before: async (page) => {
    await Promise.all([page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60000 }), page.click("a[href^='/clients/']")]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  },
});
await shoot("client-dates", "/clients", {
  before: async (page) => {
    await Promise.all([page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60000 }), page.click("a[href^='/clients/']")]);
    await page.waitForLoadState("networkidle");
    await page.click("button[role=tab]:has-text('Dates')");
    await page.waitForTimeout(1000);
  },
});
await shoot("quicklog", "/", {
  before: async (page) => {
    await page.fill("input[aria-label='Quick log']", "ADFH UAT signed off, go live moved to 15 Oct. Waiting on Noura for the integration list");
    await page.press("input[aria-label='Quick log']", "Enter");
    await page.waitForSelector("text=Save to Orbit", { timeout: 30000 });
    await page.waitForTimeout(600);
  },
});
await shoot("palette", "/", {
  before: async (page) => {
    await page.keyboard.press("Control+K");
    await page.waitForTimeout(500);
  },
});

await browser.close();

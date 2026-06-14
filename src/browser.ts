import { chromium, Browser, BrowserContext, Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const SESSION_DIR = join(homedir(), ".config", "dnd-beyond-mcp");
export const SESSION_PATH = join(SESSION_DIR, "session.json");

let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserInstance) return browserInstance;
  browserInstance = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  return browserInstance;
}

export async function getContext(browser: Browser): Promise<BrowserContext> {
  if (contextInstance) return contextInstance;

  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

  const opts = {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 } as const,
  };

  contextInstance = existsSync(SESSION_PATH)
    ? await browser.newContext({ ...opts, storageState: SESSION_PATH })
    : await browser.newContext(opts);

  return contextInstance;
}

export async function saveSession(context: BrowserContext): Promise<void> {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
  await context.storageState({ path: SESSION_PATH });
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto("https://www.dndbeyond.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("dndbeyond.com") || url.includes("/login") || url.includes("/sign-in")) {
      return false;
    }

    return await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("a, button"));
      return !els.find((el) => {
        const t = (el.textContent ?? "").trim().toLowerCase();
        return t === "sign in" || t === "log in";
      });
    });
  } catch {
    return false;
  }
}

export async function getPage(context: BrowserContext): Promise<Page> {
  const pages = context.pages();
  return pages.length > 0 ? pages[0] : context.newPage();
}

export async function closeBrowser(): Promise<void> {
  if (contextInstance) {
    await contextInstance.close();
    contextInstance = null;
  }
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

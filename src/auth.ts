import { BrowserContext, Page } from "playwright";
import { saveSession, isLoggedIn, getPage } from "./browser.js";

export async function login(context: BrowserContext): Promise<string> {
  const page = await getPage(context);

  await page.goto("https://www.dndbeyond.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);

  if (await isLoggedIn(page)) {
    await saveSession(context);
    return "Already logged in. Session is active and saved.";
  }

  process.stderr.write("[dnd-beyond-mcp] Opening login page — complete the Wizards ID login in the browser window.\n");
  await page.goto("https://www.dndbeyond.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);

  try {
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        return (
          url.startsWith("https://www.dndbeyond.com") &&
          !url.includes("/login") &&
          !url.includes("/sign-in")
        );
      },
      { timeout: 180000, polling: 2000 },
    );
  } catch {
    throw new Error("Login timed out after 3 minutes. Complete login in the browser window and try again.");
  }

  await page.waitForTimeout(2000);

  if (!(await checkLoggedIn(page))) {
    throw new Error("Login may not have completed. Please try again.");
  }

  await saveSession(context);
  return "Logged in successfully. Session saved to disk — future calls will reuse it automatically.";
}

async function checkLoggedIn(page: Page): Promise<boolean> {
  try {
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

import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { ensureDir } from "@/lib/computers/workspace";
import type { Computer } from "@/lib/domain/types";

/**
 * Optional browser session. Playwright is intentionally not a dependency of the
 * default install: it needs a Chromium download and a container for real
 * isolation. When it is missing, the tools report a clear "not configured"
 * state instead of pretending to browse.
 */

let playwrightProbe: { available: boolean; reason: string } | null = null;

/**
 * Playwright is optional. Resolve it at runtime through a computed name so the
 * bundler never tries to include a package that is not installed.
 */
function optionalPlaywright(): any | null {
  try {
    // eval keeps the bundler from trying to resolve an optional dependency.
    const dynamicRequire = eval("require") as NodeRequire;
    return dynamicRequire("playwright");
  } catch {
    return null;
  }
}

export function browserAvailability(): { available: boolean; reason: string } {
  if (playwrightProbe) return playwrightProbe;
  if (!getConfig().limits.browserEnabled) {
    playwrightProbe = {
      available: false,
      reason: "OPENCOMPANY_BROWSER_ENABLED is not set. Browser sessions are disabled.",
    };
    return playwrightProbe;
  }
  if (optionalPlaywright()) {
    playwrightProbe = { available: true, reason: "Playwright is installed and browser sessions are enabled." };
  } else {
    playwrightProbe = {
      available: false,
      reason:
        "OPENCOMPANY_BROWSER_ENABLED is set but Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium` on a machine where employee browsers may run.",
    };
  }
  return playwrightProbe;
}

export function browserProfilePath(computer: Computer): string {
  return path.join(computer.workspacePath, ".browser", "profile");
}

export async function openBrowserSession(input: {
  computer: Computer;
  url: string;
  screenshotName?: string;
}): Promise<
  | { ok: true; title: string; text: string; screenshotPath: string | null }
  | { ok: false; reason: string }
> {
  const availability = browserAvailability();
  if (!availability.available) return { ok: false, reason: availability.reason };
  if (!/^https:\/\/|^http:\/\//i.test(input.url)) {
    return { ok: false, reason: "Only http(s) URLs can be opened by an employee browser." };
  }
  const profile = ensureDir(browserProfilePath(input.computer));
  const screenshots = ensureDir(path.join(input.computer.workspacePath, ".browser", "shots"));

  const playwright = optionalPlaywright();
  if (!playwright) return { ok: false, reason: "Playwright is not installed." };
  const chromium = playwright.chromium;
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    acceptDownloads: false,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const title = await page.title();
    const text = (await page.innerText("body")).slice(0, 4000);
    const target = path.join(screenshots, `${input.screenshotName ?? `shot-${Date.now()}`}.png`);
    await page.screenshot({ path: target, fullPage: false });
    return { ok: true, title, text, screenshotPath: target };
  } finally {
    await context.close();
  }
}

export function resetBrowserProbeForTests(): void {
  playwrightProbe = null;
}

export function browserScreenshotExists(computer: Computer, name: string): string | null {
  const target = path.join(computer.workspacePath, ".browser", "shots", `${name}.png`);
  return fs.existsSync(target) ? target : null;
}

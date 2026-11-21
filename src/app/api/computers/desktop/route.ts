import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/api";
import { getSession } from "@/lib/session";
import {
  desktop,
  desktopStatus,
  ensureDesktop,
  execDesktop,
  stopDesktop,
} from "@/lib/integrations/desktop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status of one bot's self-hosted desktop, or of the provider. */
export async function GET(request: Request) {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in required.", 401);
  }
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ ok: true, ...desktopStatus() });
  try {
    return NextResponse.json({ ok: true, desktop: await desktop(key) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

/**
 * Provision, inspect, run a terminal command in, or remove one bot's desktop.
 * The container is isolated from the OPENco. host; the owner's session is not
 * passed into it.
 */
export async function POST(request: Request) {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in required.", 401);
  }
  const body = await readJson<{ action?: string; key?: string; command?: string }>(request);
  const key = body.key?.trim();
  if (!key) return fail("key is required.");
  try {
    switch (body.action) {
      case "provision":
        return NextResponse.json({ ok: true, desktop: await ensureDesktop(key) });
      case "status":
        return NextResponse.json({ ok: true, desktop: await desktop(key) });
      case "exec": {
        if (!body.command?.trim()) return fail("command is required for exec.");
        return NextResponse.json({ ok: true, result: await execDesktop(key, body.command) });
      }
      case "stop":
        await stopDesktop(key);
        return NextResponse.json({ ok: true, stopped: key });
      default:
        return fail("Unknown action. Use provision, status, exec or stop.");
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

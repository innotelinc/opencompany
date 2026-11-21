import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/api";
import { getSession } from "@/lib/session";
import { openMausClient, openMausStatus } from "@/lib/integrations/openmaus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the OpenMausBots this console can reach. */
export async function GET() {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in required.", 401);
  }
  if (!openMausStatus().configured) return NextResponse.json({ ok: true, bots: [], configured: false });
  try {
    const bots = await openMausClient().bots();
    return NextResponse.json({ ok: true, configured: true, bots });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

/** Health, or send one message to a bot (used by the CopilotKit action). */
export async function POST(request: Request) {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in required.", 401);
  }
  const body = await readJson<{ action?: string; botId?: string; text?: string; threadId?: string }>(request);
  const client = openMausClient();
  try {
    if (body.action === "health") return NextResponse.json({ ok: true, health: await client.health() });
    if (body.action !== "send") return fail("Unknown action. Use health or send.");
    const botId = body.botId?.trim();
    const text = body.text?.trim();
    if (!botId) return fail("botId is required.");
    if (!text) return fail("text is required.");
    if (text.length > 8_000) return fail("That message is too long for one turn.", 413);
    const receipt = await client.sendMessage(botId, text, body.threadId?.trim() || undefined);
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fail } from "@/lib/api";
import { openMausStatus } from "@/lib/integrations/openmaus";
import { voiceStatus } from "@/lib/integrations/voice";
import { desktopStatus } from "@/lib/integrations/desktop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness of the optional self-hosted integrations. No secret is returned. */
export async function GET() {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in to read integration status.", 401);
  }
  return NextResponse.json({
    ok: true,
    openmaus: openMausStatus(),
    voice: voiceStatus(),
    desktop: desktopStatus(),
  });
}

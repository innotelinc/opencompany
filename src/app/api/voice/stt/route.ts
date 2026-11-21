import { fail } from "@/lib/api";
import { getSession } from "@/lib/session";
import { transcribe, VoiceNotConfigured } from "@/lib/integrations/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

/** Transcribe one recording with the owner's own whisper server. */
export async function POST(request: Request) {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in required.", 401);
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return fail("That recording is larger than 12 MB.", 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return fail("That recording is larger than 12 MB.", 413);
  if (bytes.byteLength === 0) return fail("The recording is empty.");

  try {
    const result = await transcribe(bytes, {
      mime: (request.headers.get("content-type") ?? "audio/wav").split(";")[0].trim(),
      language: new URL(request.url).searchParams.get("language") ?? undefined,
    });
    return Response.json({ ok: true, text: result.text });
  } catch (error) {
    if (error instanceof VoiceNotConfigured) return fail(error.message, 503);
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

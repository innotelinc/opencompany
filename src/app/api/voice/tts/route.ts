import { fail, readJson } from "@/lib/api";
import { getSession } from "@/lib/session";
import { synthesize, VoiceNotConfigured } from "@/lib/integrations/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read a reply aloud through the owner's own open-source speech server. */
export async function POST(request: Request) {
  try {
    await getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign in required.", 401);
  }
  const body = await readJson<{ text?: string; voice?: string; format?: "wav" | "mp3" }>(request);
  if (!body.text?.trim()) return fail("text is required.");
  try {
    const audio = await synthesize(body.text, { voice: body.voice, format: body.format ?? "wav" });
    return new Response(new Blob([new Uint8Array(audio.bytes)], { type: audio.mime }), {
      headers: {
        "content-type": audio.mime,
        "content-length": String(audio.bytes.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof VoiceNotConfigured) return fail(error.message, 503);
    return fail(error instanceof Error ? error.message : String(error), 502);
  }
}

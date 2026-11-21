import { getConfig } from "@/lib/config";

/**
 * Open-source voice: no hosted vendor account.
 *
 * - `speaches` (MIT) exposes OpenAI-compatible `/v1/audio/speech` (Kokoro and
 *   Piper voices) and `/v1/audio/transcriptions` (faster-whisper).
 * - `chatterbox` exposes the same speech shape for cloned voices.
 * - `whispercpp` is whisper.cpp's own `/inference` endpoint.
 *
 * Every address is a setting, not a secret, because it points at a server the
 * owner runs.
 */

export type SpeechFormat = "wav" | "mp3" | "opus" | "flac";

export class VoiceNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceNotConfigured";
  }
}

export function voiceStatus() {
  const config = getConfig().integrations.voice;
  return {
    tts: {
      provider: config.provider,
      configured: Boolean(config.baseUrl),
      baseUrl: config.baseUrl,
      model: config.model || defaultSpeechModel(config.provider),
      voice: config.voice,
    },
    stt: {
      provider: config.sttProvider,
      configured: Boolean(config.sttBaseUrl),
      baseUrl: config.sttBaseUrl,
      model: config.sttModel,
    },
  };
}

/** A base URL may already end in `/v1`; never double it. */
export function apiRoot(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function defaultSpeechModel(provider: string): string {
  if (provider === "chatterbox") return "chatterbox-turbo";
  return "speaches-ai/Kokoro-82M-v1.0-ONNX";
}

function timeout(): number {
  return getConfig().integrations.voice.timeoutMs;
}

export async function synthesize(
  text: string,
  options: { voice?: string; format?: SpeechFormat; signal?: AbortSignal } = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  const config = getConfig().integrations.voice;
  if (!config.baseUrl) {
    throw new VoiceNotConfigured(
      "Voice is not configured. Set OPENCOMPANY_TTS_URL to a Speaches or Chatterbox server.",
    );
  }
  const input = text.trim();
  if (!input) throw new Error("There is no text to speak.");
  if (input.length > 5_000) throw new Error("That reply is too long to speak in one request.");

  const format = options.format ?? "wav";
  const voice = options.voice?.trim() || config.voice;
  const response = await fetch(`${apiRoot(config.baseUrl)}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: `audio/${format}` },
    body: JSON.stringify({
      model: config.model || defaultSpeechModel(config.provider),
      input,
      voice,
      response_format: format,
    }),
    signal: AbortSignal.any([AbortSignal.timeout(timeout()), ...(options.signal ? [options.signal] : [])]),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Speech synthesis failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const header = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const mime = header.startsWith("audio/") ? header : `audio/${format}`;
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
}

export async function transcribe(
  audio: Uint8Array,
  options: { mime?: string; filename?: string; language?: string; signal?: AbortSignal } = {},
): Promise<{ text: string }> {
  const config = getConfig().integrations.voice;
  if (!config.sttBaseUrl) {
    throw new VoiceNotConfigured(
      "Speech recognition is not configured. Set OPENCOMPANY_STT_URL to a Speaches or whisper.cpp server.",
    );
  }
  if (audio.byteLength === 0) throw new Error("The recording is empty.");

  const form = new FormData();
  const mime = options.mime ?? "audio/wav";
  // Copy into a plain Uint8Array<ArrayBuffer>: the incoming view may be backed
  // by a SharedArrayBuffer, which BlobPart does not accept.
  const copy = new Uint8Array(audio.byteLength);
  copy.set(audio);
  form.append("file", new Blob([copy.buffer], { type: mime }), options.filename ?? "speech.wav");
  if (options.language) form.append("language", options.language);

  const whisper = config.sttProvider === "whispercpp";
  const url = whisper ? `${config.sttBaseUrl}/inference` : `${apiRoot(config.sttBaseUrl)}/audio/transcriptions`;
  form.append("model", config.sttModel);
  if (whisper) form.append("response_format", "json");

  const response = await fetch(url, {
    method: "POST",
    body: form,
    signal: AbortSignal.any([AbortSignal.timeout(timeout()), ...(options.signal ? [options.signal] : [])]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Speech recognition failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const body = (await response.json()) as { text?: unknown };
  return { text: typeof body.text === "string" ? body.text.trim() : "" };
}

import { getConfig } from "@/lib/config";
import { OpenMausBackend } from "./backend";
import { OpenMausClient } from "./client";

export { OpenMausBackend } from "./backend";
export { OpenMausClient, OpenMausError } from "./client";
export type { OpenMausBot, OpenMausMessage } from "./client";

/** Redacted readiness, safe for the owner's status screen. */
export function openMausStatus() {
  const config = getConfig().integrations.openmaus;
  return {
    configured: Boolean(config.baseUrl),
    baseUrl: config.baseUrl,
    authenticated: Boolean(config.token),
    botPrefix: config.botPrefix,
  };
}

export function openMausClient(): OpenMausClient {
  const config = getConfig().integrations.openmaus;
  return new OpenMausClient({
    baseUrl: config.baseUrl,
    token: config.token,
    timeoutMs: config.timeoutMs,
  });
}

export function openMausBackend(): OpenMausBackend {
  return new OpenMausBackend();
}

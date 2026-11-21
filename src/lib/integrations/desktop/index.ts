import { getConfig } from "@/lib/config";
import {
  DockerError,
  dockerEndpoint,
  ensureContainer,
  execInContainer,
  inspectContainer,
  stopContainer,
  type ContainerInfo,
} from "./docker";

/**
 * A remote Linux desktop per bot, run on the owner's own Docker host.
 *
 * This is the open replacement for a hosted "cloud computer" service: the
 * container has its own filesystem, a browser desktop served by noVNC/KasmVNC,
 * and a terminal reachable through `exec`. OPENco. provisions it; it never
 * borrows the owner's session.
 */

export interface Desktop {
  key: string;
  name: string;
  url: string;
  port: number | null;
  running: boolean;
  image: string | null;
}

export function desktopConfigured(): boolean {
  const config = getConfig().integrations.desktop;
  return config.provider === "docker";
}

export function desktopStatus() {
  const config = getConfig().integrations.desktop;
  return {
    provider: config.provider,
    configured: config.provider === "docker",
    image: config.image,
    publicHost: config.publicHost,
    port: config.port,
  };
}

/** A container-safe, stable key: lowercase letters, digits and single dashes. */
export function desktopKey(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!cleaned) throw new Error("A desktop needs a name with at least one letter or digit.");
  return cleaned;
}

function containerName(key: string): string {
  return `${getConfig().integrations.desktop.prefix}-${key}`;
}

function endpoint() {
  return dockerEndpoint(getConfig().integrations.desktop.dockerHost);
}

function requireDocker(): void {
  const config = getConfig().integrations.desktop;
  if (config.provider !== "docker") {
    throw new Error(
      "No desktop provider is configured. Set OPENCOMPANY_DESKTOP_PROVIDER=docker and point OPENCOMPANY_DESKTOP_DOCKER_HOST at the daemon.",
    );
  }
}

function urlFor(port: number | null): string {
  const config = getConfig().integrations.desktop;
  if (!port) return "";
  if (config.publicHost) {
    const host = config.publicHost.replace(/\/+$/, "");
    return /^https?:\/\//.test(host) ? `${host}:${port}` : `http://${host}:${port}`;
  }
  return `http://127.0.0.1:${port}`;
}

function toDesktop(key: string, info: ContainerInfo): Desktop {
  return {
    key,
    name: info.name,
    url: urlFor(info.port),
    port: info.port,
    running: info.running,
    image: info.image,
  };
}

export async function ensureDesktop(keyInput: string): Promise<Desktop> {
  requireDocker();
  const key = desktopKey(keyInput);
  const config = getConfig().integrations.desktop;
  const info = await ensureContainer(endpoint(), {
    image: config.image,
    name: containerName(key),
    containerPort: config.port,
    memoryMb: config.memoryMb,
    cpus: config.cpus,
    env: {
      PUID: "1000",
      PGID: "1000",
      TZ: "UTC",
      TITLE: `OPENco. · ${key}`,
    },
  });
  return toDesktop(key, info);
}

export async function desktop(keyInput: string): Promise<Desktop | null> {
  requireDocker();
  const key = desktopKey(keyInput);
  const info = await inspectContainer(endpoint(), containerName(key), getConfig().integrations.desktop.port);
  return info ? toDesktop(key, info) : null;
}

export async function execDesktop(
  keyInput: string,
  command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  requireDocker();
  if (!command.trim()) throw new Error("A terminal command is required.");
  if (command.length > 4_000) throw new Error("That command is too long for one exec.");
  const key = desktopKey(keyInput);
  return execInContainer(endpoint(), containerName(key), command);
}

export async function stopDesktop(keyInput: string): Promise<void> {
  requireDocker();
  const key = desktopKey(keyInput);
  await stopContainer(endpoint(), containerName(key));
}

export { DockerError };

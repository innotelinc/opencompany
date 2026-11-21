import http from "node:http";

/**
 * Minimal Docker Engine API client over a unix socket or TCP.
 *
 * The desktop feature needs four calls (inspect, create, start, exec), so this
 * speaks the documented REST API directly instead of adding a dependency. It is
 * not a general Docker SDK.
 */

export interface DockerEndpoint {
  socketPath?: string;
  host?: string;
  port?: number;
}

export class DockerError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "DockerError";
    this.status = status;
  }
}

/** `unix:///var/run/docker.sock`, `tcp://host:2375`, a bare path, or empty. */
export function dockerEndpoint(raw: string): DockerEndpoint {
  const value = raw.trim();
  if (!value) {
    return process.platform === "win32"
      ? { socketPath: "//./pipe/docker_engine" }
      : { socketPath: "/var/run/docker.sock" };
  }
  if (value.startsWith("unix://")) return { socketPath: value.slice("unix://".length) };
  if (value.startsWith("tcp://") || value.startsWith("http://")) {
    const url = new URL(value.replace(/^tcp:\/\//, "http://"));
    return { host: url.hostname, port: Number(url.port || 2375) };
  }
  return { socketPath: value };
}

function request(
  endpoint: DockerEndpoint,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        ...endpoint,
        method,
        path,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": String(payload.byteLength) } : {}),
          accept: "application/json",
        },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, buffer: Buffer.concat(chunks) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("The Docker daemon did not answer in 60 seconds.")));
    req.on("error", (error) =>
      reject(new DockerError(`Could not reach the Docker daemon: ${error.message}`)),
    );
    if (payload) req.write(payload);
    req.end();
  });
}

async function jsonCall<T>(
  endpoint: DockerEndpoint,
  method: string,
  path: string,
  body?: unknown,
  allowNotFound = false,
): Promise<T | null> {
  const { status, buffer } = await request(endpoint, method, path, body);
  if (status === 404 && allowNotFound) return null;
  const text = buffer.toString("utf8");
  if (status >= 400) {
    let detail = text;
    try {
      detail = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      // keep the raw body
    }
    throw new DockerError(`Docker answered ${status} for ${method} ${path}: ${detail.slice(0, 300)}`, status);
  }
  if (status === 204 || !text) return {} as T;
  return JSON.parse(text) as T;
}

export interface ContainerInfo {
  name: string;
  running: boolean;
  port: number | null;
  image: string | null;
}

interface InspectBody {
  Name?: string;
  Config?: { Image?: string };
  State?: { Running?: boolean };
  NetworkSettings?: { Ports?: Record<string, Array<{ HostPort?: string }> | null> };
}

function toInfo(name: string, body: InspectBody, containerPort: number): ContainerInfo {
  const mapping = body.NetworkSettings?.Ports?.[`${containerPort}/tcp`]?.[0]?.HostPort;
  return {
    name,
    running: body.State?.Running === true,
    port: mapping ? Number(mapping) : null,
    image: body.Config?.Image ?? null,
  };
}

export async function inspectContainer(
  endpoint: DockerEndpoint,
  name: string,
  containerPort: number,
): Promise<ContainerInfo | null> {
  const body = await jsonCall<InspectBody>(endpoint, "GET", `/containers/${encodeURIComponent(name)}/json`, undefined, true);
  return body ? toInfo(name, body, containerPort) : null;
}

export interface CreateOptions {
  image: string;
  name: string;
  containerPort: number;
  memoryMb: number;
  cpus: number;
  env?: Record<string, string>;
}

export async function ensureContainer(
  endpoint: DockerEndpoint,
  options: CreateOptions,
): Promise<ContainerInfo> {
  let info = await inspectContainer(endpoint, options.name, options.containerPort);
  if (!info) {
    await jsonCall(
      endpoint,
      "POST",
      `/containers/create?name=${encodeURIComponent(options.name)}`,
      {
        Image: options.image,
        Env: Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`),
        ExposedPorts: { [`${options.containerPort}/tcp`]: {} },
        HostConfig: {
          PortBindings: { [`${options.containerPort}/tcp`]: [{ HostPort: "" }] },
          Memory: Math.max(512, options.memoryMb) * 1024 * 1024,
          NanoCpus: Math.max(0.25, options.cpus) * 1_000_000_000,
          RestartPolicy: { Name: "unless-stopped" },
          SecurityOpt: ["no-new-privileges"],
        },
      },
    );
    info = await inspectContainer(endpoint, options.name, options.containerPort);
    if (!info) throw new DockerError("Docker created the container but does not list it.");
  }
  if (!info.running) {
    await jsonCall(endpoint, "POST", `/containers/${encodeURIComponent(options.name)}/start`);
    info = await inspectContainer(endpoint, options.name, options.containerPort);
    if (!info) throw new DockerError("Docker started the container but does not list it.");
  }
  return info;
}

export async function stopContainer(endpoint: DockerEndpoint, name: string): Promise<void> {
  await jsonCall(endpoint, "DELETE", `/containers/${encodeURIComponent(name)}?force=1`, undefined, true);
}

/** Docker multiplexes stdout and stderr into frames: 8-byte header + payload. */
export function demuxDockerStream(buffer: Buffer): { stdout: string; stderr: string } {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) break;
    if (stream === 2) stderr.push(buffer.subarray(start, end));
    else stdout.push(buffer.subarray(start, end));
    offset = end;
  }
  if (offset === 0) return { stdout: buffer.toString("utf8"), stderr: "" };
  return { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
}

export async function execInContainer(
  endpoint: DockerEndpoint,
  name: string,
  command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const created = await jsonCall<{ Id?: string }>(endpoint, "POST", `/containers/${encodeURIComponent(name)}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Cmd: ["/bin/bash", "-lc", command],
  });
  if (!created?.Id) throw new DockerError("Docker did not create the exec instance.");
  const { status, buffer } = await request(endpoint, "POST", `/exec/${created.Id}/start`, {
    Detach: false,
    Tty: false,
  });
  if (status >= 400) throw new DockerError(`Docker refused the exec (${status}).`, status);
  const { stdout, stderr } = demuxDockerStream(buffer);
  const inspected = await jsonCall<{ ExitCode?: number | null }>(
    endpoint,
    "GET",
    `/exec/${created.Id}/json`,
  );
  return { stdout, stderr, exitCode: inspected?.ExitCode ?? null };
}

/**
 * A small client for the OpenMausBot harness (the local agent server that owns
 * bots, threads, turns and their event stream).
 *
 * Only the control-plane endpoints this app needs are modelled. The harness
 * binds to loopback by default; when it sits behind a proxy it takes a pairing
 * bearer (`omb_sess_…`), which is read from the server environment and never
 * sent to the browser.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OpenMausOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface OpenMausBot {
  id: string;
  name: string;
  threadId?: string;
  busy?: boolean;
  model?: string;
}

export interface OpenMausMessage {
  id: string;
  kind: string;
  text?: string;
  createdAt?: string;
  from?: { botId?: string; personId?: string; kind?: string };
}

export class OpenMausError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "OpenMausError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class OpenMausClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenMausOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token?.trim() ?? "";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) {
      throw new OpenMausError("OpenMausBot is not configured. Set OPENMAUSBOT_URL to its harness address.");
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new OpenMausError(`Could not reach the OpenMausBot harness at ${this.baseUrl}: ${detail}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OpenMausError(
        `OpenMausBot answered ${response.status} for ${method} ${path}${text ? `: ${text.slice(0, 300)}` : ""}`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return (await response.json()) as T;
    return (await response.text()) as unknown as T;
  }

  /** Harness identity, used by the status screen. */
  health(): Promise<{ ok?: boolean }> {
    return this.request("GET", "/api/health");
  }

  async bots(): Promise<OpenMausBot[]> {
    const body = await this.request<{ bots?: OpenMausBot[] }>("GET", "/api/bots?messages=0");
    return (body.bots ?? []).filter((bot) => typeof bot?.id === "string");
  }

  async createBot(name: string, instructions?: string): Promise<OpenMausBot> {
    const body = await this.request<{ bot?: OpenMausBot }>("POST", "/api/bots", {
      name,
      ...(instructions ? { instructions } : {}),
    });
    if (!body.bot?.id) throw new OpenMausError("OpenMausBot created no bot for the harness request.");
    return body.bot;
  }

  async createTask(botId: string, title: string): Promise<{ threadId: string }> {
    const body = await this.request<{ task?: { threadId?: string } }>(
      "POST",
      `/api/bots/${encodeURIComponent(botId)}/tasks`,
      { title },
    );
    const threadId = body.task?.threadId;
    if (!threadId) throw new OpenMausError("OpenMausBot opened no conversation for the task.");
    return { threadId };
  }

  async sendMessage(
    botId: string,
    text: string,
    threadId?: string,
  ): Promise<{ messageId?: string; at?: string; queued?: boolean }> {
    return this.request("POST", `/api/bots/${encodeURIComponent(botId)}/messages`, {
      text,
      ...(threadId ? { threadId } : {}),
    });
  }

  async messages(threadId: string, limit = 200): Promise<OpenMausMessage[]> {
    const body = await this.request<{ messages?: OpenMausMessage[] }>(
      "GET",
      `/api/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}`,
    );
    return body.messages ?? [];
  }

  interrupt(botId: string, threadId: string): Promise<unknown> {
    return this.request("POST", `/api/bots/${encodeURIComponent(botId)}/interrupt`, { threadId });
  }

  /**
   * Wait until the bot stops working. A turn can take a moment to register as
   * busy after the send, so one idle poll is not enough: two consecutive idle
   * observations are required. Returns "timed-out" rather than throwing so the
   * caller can keep whatever the bot already said.
   */
  async waitUntilIdle(
    botId: string,
    options: { shouldStop?: () => boolean; timeoutMs?: number; pollMs?: number } = {},
  ): Promise<"idle" | "stopped" | "timed-out"> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const pollMs = options.pollMs ?? 1_500;
    const deadline = Date.now() + timeoutMs;
    let idleSeen = 0;

    await sleep(Math.min(pollMs, 1_000));
    while (Date.now() < deadline) {
      if (options.shouldStop?.()) return "stopped";
      const bots = await this.bots();
      const bot = bots.find((candidate) => candidate.id === botId);
      if (!bot) throw new OpenMausError(`OpenMausBot no longer lists the bot ${botId}.`);
      if (bot.busy) {
        idleSeen = 0;
      } else if (++idleSeen >= 2) {
        return "idle";
      }
      await sleep(pollMs);
    }
    return "timed-out";
  }
}

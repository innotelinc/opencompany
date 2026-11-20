import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";
import { hostname } from "node:os";

/**
 * Outbound mail for approvals, without a client library.
 *
 * The estate already runs a submission server, so this speaks enough SMTP to
 * hand it one message: EHLO, STARTTLS, AUTH PLAIN, MAIL/RCPT/DATA. Keeping it
 * here rather than adding a vendor SDK means the console sends through the same
 * relay as the rest of the estate, and a deployment without SMTP settings simply
 * reports that email escalation is off instead of failing at runtime.
 */
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function smtpSettings(): SmtpSettings | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "1" || port === 465;
  const user = process.env.SMTP_USER?.trim() ?? "";
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!from) return null;
  return { host, port: Number.isFinite(port) && port > 0 ? port : 587, secure, user, pass: process.env.SMTP_PASS ?? "", from };
}

export function smtpConfigured(): boolean {
  return smtpSettings() !== null;
}

const TIMEOUT_MS = 20_000;

/** One SMTP conversation: line-oriented replies, TLS upgrade in place. */
class Session {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private lines: string[] = [];
  private partial = "";
  private waiter: { resolve: (reply: string[]) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;

  private attach(socket: net.Socket | tls.TLSSocket): void {
    this.socket = socket;
    this.partial = "";
    this.lines = [];
    socket.setTimeout(TIMEOUT_MS);
    socket.on("data", (chunk: Buffer) => this.consume(chunk.toString("utf8")));
    socket.on("timeout", () => this.fail(new Error("The mail server stopped answering.")));
    socket.on("error", (error: Error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("The mail server closed the connection.")));
  }

  private consume(chunk: string): void {
    this.partial += chunk;
    const parts = this.partial.split("\r\n");
    this.partial = parts.pop() ?? "";
    for (const line of parts) this.lines.push(line);
    this.flush();
  }

  private take(): string[] | null {
    for (let index = 0; index < this.lines.length; index += 1) {
      if (/^\d{3} /.test(this.lines[index])) return this.lines.splice(0, index + 1);
    }
    return null;
  }

  private flush(): void {
    if (!this.waiter) return;
    const reply = this.take();
    if (!reply) return;
    const waiter = this.waiter;
    this.waiter = null;
    waiter.resolve(reply);
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.reject(error);
    }
  }

  async connect(settings: SmtpSettings): Promise<void> {
    const socket = settings.secure
      ? tls.connect({ host: settings.host, port: settings.port, servername: settings.host })
      : net.connect({ host: settings.host, port: settings.port });
    this.attach(socket);
    await this.expect([220]);
  }

  reply(): Promise<string[]> {
    if (this.failure) return Promise.reject(this.failure);
    const ready = this.take();
    if (ready) return Promise.resolve(ready);
    return new Promise<string[]>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  async command(line: string, expected: number[]): Promise<string[]> {
    if (!this.socket) throw new Error("Not connected.");
    this.socket.write(`${line}\r\n`);
    return this.expect(expected);
  }

  private async expect(expected: number[]): Promise<string[]> {
    const reply = await this.reply();
    const code = Number(reply[reply.length - 1]?.slice(0, 3));
    if (!expected.includes(code)) throw new Error(`The mail server answered ${code}: ${reply.join(" ").slice(0, 200)}`);
    return reply;
  }

  async startTls(host: string): Promise<void> {
    if (!this.socket) throw new Error("Not connected.");
    const upgraded = tls.connect({ socket: this.socket, servername: host });
    this.attach(upgraded);
    await new Promise<void>((resolve, reject) => {
      upgraded.once("secureConnect", () => resolve());
      upgraded.once("error", reject);
    });
  }

  close(): void {
    try {
      this.socket?.write("QUIT\r\n");
      this.socket?.end();
    } catch {
      // A closed socket needs nothing.
    }
    this.socket = null;
  }
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

/** Bodies beginning with a dot would end DATA early; SMTP requires the dot-stuffing. */
function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function buildMime(message: MailMessage, settings: SmtpSettings): string {
  const boundary = `oc-${crypto.randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${settings.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${settings.from.split("@")[1] ?? "opencompany.local"}>`,
    "MIME-Version: 1.0",
    message.html
      ? `Content-Type: multipart/alternative; boundary="${boundary}"`
      : "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (!message.html) return `${headers.join("\r\n")}\r\n\r\n${dotStuff(message.text)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(message.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(message.html),
    `--${boundary}--`,
  ];
  return `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`;
}

export async function sendMail(message: MailMessage): Promise<{ ok: true } | { ok: false; reason: string }> {
  const settings = smtpSettings();
  if (!settings) return { ok: false, reason: "No SMTP settings (SMTP_HOST / SMTP_FROM) are configured." };

  const session = new Session();
  try {
    await session.connect(settings);
    await session.command(`EHLO ${hostname() || "opencompany"}`, [250]);
    if (!settings.secure) {
      await session.command("STARTTLS", [220]);
      await session.startTls(settings.host);
      await session.command(`EHLO ${hostname() || "opencompany"}`, [250]);
    }
    if (settings.user) {
      const token = Buffer.from(`\0${settings.user}\0${settings.pass}`, "utf8").toString("base64");
      await session.command(`AUTH PLAIN ${token}`, [235]);
    }
    await session.command(`MAIL FROM:<${settings.from}>`, [250]);
    await session.command(`RCPT TO:<${message.to}>`, [250, 251]);
    await session.command("DATA", [354]);
    await session.command(`${buildMime(message, settings)}\r\n.`, [250]);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    session.close();
  }
}

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import type { Computer, Employee } from "@/lib/domain/types";

/**
 * Employee computer: a persistent, per-employee directory plus a restricted
 * process runner.
 *
 * Isolation boundary, stated plainly: this is a directory sandbox and an OS
 * process running as the application user, not a virtual machine. Deployments
 * that need strong isolation must run the worker in a container (see
 * docs/ARCHITECTURE.md). Browser sessions are optional and never share the
 * host's own browser profile.
 */

const MAX_FILE_BYTES = 512 * 1024;
const MAX_OUTPUT = 24_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Commands an employee may run. No shell, so no shell metacharacter tricks. */
const ALLOWED_COMMANDS = new Set([
  "node",
  "npm",
  "ls",
  "cat",
  "echo",
  "pwd",
  "mkdir",
  "cp",
  "mv",
  "rm",
  "find",
  "grep",
  "head",
  "tail",
  "wc",
  "dir",
  "type",
  "git",
]);

/** Environment keys passed to child processes. Secrets are never included. */
const ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "COMSPEC",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PROCESSOR_ARCHITECTURE",
];

export class ComputerBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComputerBusyError";
  }
}

export function workspaceRoot(companyId: string, employeeId: string): string {
  return path.join(getConfig().dataDir, "workspaces", companyId, employeeId);
}

export function artifactsRoot(companyId: string): string {
  return path.join(getConfig().dataDir, "deliverables", companyId);
}

export function previewsRoot(companyId: string): string {
  return path.join(getConfig().dataDir, "previews", companyId);
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveInside(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + path.sep)) {
    throw new Error(`Path escapes the employee workspace: ${relative}`);
  }
  return target;
}

export interface FileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export class EmployeeWorkspace {
  readonly root: string;
  private readonly employee: Employee;
  private readonly computer: Computer;
  private readonly assertControl: () => void;

  constructor(employee: Employee, computer: Computer, assertControl: () => void) {
    this.employee = employee;
    this.computer = computer;
    this.assertControl = assertControl;
    this.root = ensureDir(computer.workspacePath);
  }

  private guard(): void {
    this.assertControl();
  }

  writeFile(relative: string, contents: string): FileEntry {
    this.guard();
    if (Buffer.byteLength(contents) > MAX_FILE_BYTES) {
      throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes: ${relative}`);
    }
    const target = resolveInside(this.root, relative);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, contents, "utf8");
    return {
      path: relative.replace(/\\/g, "/"),
      bytes: Buffer.byteLength(contents),
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    };
  }

  readFile(relative: string): string {
    this.guard();
    const target = resolveInside(this.root, relative);
    const stat = fs.statSync(target);
    if (stat.size > MAX_FILE_BYTES) throw new Error(`File too large: ${relative}`);
    return fs.readFileSync(target, "utf8");
  }

  exists(relative: string): boolean {
    try {
      return fs.existsSync(resolveInside(this.root, relative));
    } catch {
      return false;
    }
  }

  removeFile(relative: string): void {
    this.guard();
    const target = resolveInside(this.root, relative);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }

  listFiles(limit = 200): string[] {
    const out: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (out.length >= limit) return;
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
        else out.push(rel);
      }
    };
    if (fs.existsSync(this.root)) walk(this.root, "");
    return out;
  }

  /** Snapshot of every text file in the child path, for deliverables and previews. */
  snapshot(relativeDir = "."): FileEntry[] {
    const base = relativeDir === "." ? this.root : resolveInside(this.root, relativeDir);
    if (!fs.existsSync(base)) return [];
    const entries: FileEntry[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === ".browser" || entry.name === "node_modules") continue;
          walk(full, rel);
        } else {
          const buffer = fs.readFileSync(full);
          entries.push({
            path: rel,
            bytes: buffer.byteLength,
            sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
          });
        }
      }
    };
    walk(base, "");
    return entries;
  }

  readSnapshot(relativeDir = "."): Map<string, string> {
    const base = relativeDir === "." ? this.root : resolveInside(this.root, relativeDir);
    const files = new Map<string, string>();
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === ".browser" || entry.name === "node_modules") continue;
          walk(full, rel);
        } else {
          const stat = fs.statSync(full);
          if (stat.size <= MAX_FILE_BYTES) files.set(rel, fs.readFileSync(full, "utf8"));
        }
      }
    };
    walk(base, "");
    return files;
  }

  clear(relativeDir = "."): void {
    this.guard();
    const base = relativeDir === "." ? this.root : resolveInside(this.root, relativeDir);
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.name === ".browser" || entry.name === ".keep") continue;
      fs.rmSync(path.join(base, entry.name), { recursive: true, force: true });
    }
  }

  async runCommand(
    command: string,
    args: string[] = [],
    options: { timeoutMs?: number } = {},
  ): Promise<{ code: number | null; stdout: string; stderr: string; truncated: boolean; denied?: string }> {
    this.guard();
    const binary = command.trim();
    if (!ALLOWED_COMMANDS.has(path.parse(binary).name.toLowerCase())) {
      return {
        code: null,
        stdout: "",
        stderr: "",
        truncated: false,
        denied: `Command "${binary}" is not in the employee terminal allowlist.`,
      };
    }
    const env = {} as NodeJS.ProcessEnv;
    for (const key of ENV_ALLOWLIST) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return await new Promise((resolve) => {
      const child = spawn(binary, args, {
        cwd: this.root,
        env,
        shell: false,
        windowsHide: true,
      }) as import("node:child_process").ChildProcessWithoutNullStreams;
      let stdout = "";
      let stderr = "";
      let truncated = false;
      const append = (chunk: Buffer, which: "out" | "err") => {
        const text = chunk.toString("utf8");
        if (which === "out") {
          if (stdout.length + text.length > MAX_OUTPUT) truncated = true;
          stdout = (stdout + text).slice(0, MAX_OUTPUT);
        } else {
          if (stderr.length + text.length > MAX_OUTPUT) truncated = true;
          stderr = (stderr + text).slice(0, MAX_OUTPUT);
        }
      };
      child.stdout?.on("data", (chunk: Buffer) => append(chunk, "out"));
      child.stderr?.on("data", (chunk: Buffer) => append(chunk, "err"));
      const timer = setTimeout(() => {
        truncated = true;
        child.kill("SIGKILL");
        resolve({
          code: null,
          stdout,
          stderr: stderr + `\n[terminated after ${timeout}ms]`,
          truncated,
        });
      }, timeout);
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: null, stdout, stderr: stderr + String(error), truncated });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, truncated });
      });
    });
  }

  get employeeId(): string {
    return this.employee.id;
  }

  get computerId(): string {
    return this.computer.id;
  }
}

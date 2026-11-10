#!/usr/bin/env node
/**
 * Starts the Next.js app and the durable worker together for local development.
 * Equivalent to running `npm run dev` and `npm run worker` in two terminals.
 */
import { spawn } from "node:child_process";

const children = [];
function run(name, command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    console.log(`[dev-all] ${name} exited with ${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run("web", "npm", ["run", "dev"]);
run("worker", "npm", ["run", "worker"]);

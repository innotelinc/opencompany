import assert from "node:assert/strict";
import test from "node:test";
import { OpenMausClient, type FetchLike } from "../src/lib/integrations/openmaus/client";
import { apiRoot, voiceStatus } from "../src/lib/integrations/voice";
import { demuxDockerStream, dockerEndpoint } from "../src/lib/integrations/desktop/docker";
import { desktopKey } from "../src/lib/integrations/desktop";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("the OpenMaus client sends the pairing bearer and the documented paths", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fake: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/api/bots?messages=0")) return json({ bots: [{ id: "b1", name: "openco:e1" }] });
    if (url.endsWith("/api/bots")) return json({ bot: { id: "b2", name: "New" } });
    if (url.endsWith("/api/bots/b1/tasks")) return json({ task: { threadId: "t1" } });
    if (url.endsWith("/api/bots/b1/messages")) return json({ messageId: "m1", at: "now" });
    if (url.includes("/api/threads/t1/messages")) return json({ messages: [{ id: "m1", kind: "text", text: "Done" }] });
    return json({});
  };
  const client = new OpenMausClient({ baseUrl: "http://127.0.0.1:8799/", token: "omb_sess_test", fetchImpl: fake });

  assert.deepEqual(await client.bots(), [{ id: "b1", name: "openco:e1" }]);
  assert.equal((await client.createBot("New")).id, "b2");
  assert.equal((await client.createTask("b1", "Ship it")).threadId, "t1");
  await client.sendMessage("b1", "hello", "t1");
  assert.equal((await client.messages("t1"))[0]?.text, "Done");

  const send = calls.find((call) => call.url.endsWith("/api/bots/b1/messages"))!;
  assert.equal((send.init?.headers as Record<string, string>).authorization, "Bearer omb_sess_test");
  assert.equal(JSON.parse(String(send.init?.body)).threadId, "t1");
  assert.equal(calls[0].url, "http://127.0.0.1:8799/api/bots?messages=0", "the trailing slash is not doubled");
});

test("waiting for a turn needs two consecutive idle observations", async () => {
  let polls = 0;
  const fake: FetchLike = async () => {
    polls += 1;
    // Busy, then idle, then idle: a single idle sighting must not end the wait.
    return json({ bots: [{ id: "b1", name: "Bot", busy: polls === 1 }] });
  };
  const client = new OpenMausClient({ baseUrl: "http://harness.test", fetchImpl: fake });
  assert.equal(await client.waitUntilIdle("b1", { pollMs: 1, timeoutMs: 2_000 }), "idle");
  assert.ok(polls >= 3, `expected at least three polls, saw ${polls}`);
});

test("waiting stops calling the harness once the owner stops the run", async () => {
  let polls = 0;
  const fake: FetchLike = async () => {
    polls += 1;
    return json({ bots: [{ id: "b1", name: "Bot", busy: true }] });
  };
  const client = new OpenMausClient({ baseUrl: "http://harness.test", fetchImpl: fake });
  assert.equal(
    await client.waitUntilIdle("b1", { pollMs: 1, timeoutMs: 5_000, shouldStop: () => polls >= 2 }),
    "stopped",
  );
});

test("voice is off until a server address is set", () => {
  const status = voiceStatus();
  assert.equal(status.tts.configured, Boolean(process.env.OPENCOMPANY_TTS_URL));
  assert.equal(status.stt.configured, Boolean(process.env.OPENCOMPANY_STT_URL ?? process.env.OPENCOMPANY_TTS_URL));
  assert.equal(apiRoot("http://127.0.0.1:8000/"), "http://127.0.0.1:8000/v1");
  assert.equal(apiRoot("http://127.0.0.1:8000/v1/"), "http://127.0.0.1:8000/v1");
});

test("desktop keys are safe container names and Docker hosts parse", () => {
  assert.equal(desktopKey("Alice Smith / Desk #1"), "alice-smith-desk-1");
  assert.throws(() => desktopKey("///"));
  assert.deepEqual(dockerEndpoint("tcp://127.0.0.1:2375"), { host: "127.0.0.1", port: 2375 });
  assert.deepEqual(dockerEndpoint("unix:///var/run/docker.sock"), { socketPath: "/var/run/docker.sock" });
});

test("Docker's multiplexed exec stream keeps stdout and stderr apart", () => {
  const header = (stream: number, size: number) => {
    const bytes = Buffer.alloc(8);
    bytes[0] = stream;
    bytes.writeUInt32BE(size, 4);
    return bytes;
  };
  const buffer = Buffer.concat([header(1, 5), Buffer.from("hello"), header(2, 3), Buffer.from("err")]);
  assert.deepEqual(demuxDockerStream(buffer), { stdout: "hello", stderr: "err" });
});

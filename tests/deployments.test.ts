import assert from "node:assert/strict";
import test from "node:test";
import { groupDeployments } from "../src/lib/domain/deployments";
import type { DeployEvent } from "../src/lib/domain/deployments";

const start = (commit: string, at: string): DeployEvent => ({
  at,
  source: "box",
  phase: "start",
  status: "started",
  commit,
});

const finish = (commit: string, at: string, status = "succeeded"): DeployEvent => ({
  at,
  source: "box",
  phase: "finish",
  status,
  commit,
});

test("a start and its finish become one deployment with a duration", () => {
  const rows = groupDeployments([start("abc1234", "2026-11-12T03:20:00Z"), finish("abc1234", "2026-11-12T03:21:30Z")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "succeeded");
  assert.equal(rows[0].durationMs, 90_000);
  assert.equal(rows[0].finishedAt, "2026-11-12T03:21:30Z");
});

test("a failed deployment keeps its status and the reason", () => {
  const events = [start("abc1234", "2026-11-12T03:20:00Z"), { ...finish("abc1234", "2026-11-12T03:20:05Z", "failed"), detail: "build failed" }];
  const [row] = groupDeployments(events);
  assert.equal(row.status, "failed");
  assert.equal(row.detail, "build failed");
});

test("a deployment with no finish is reported as running, not dropped", () => {
  const rows = groupDeployments([start("abc1234", "2026-11-12T03:20:00Z")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "running");
  assert.equal(rows[0].finishedAt, undefined);
});

test("deployments are newest first and both sources share the list", () => {
  const rows = groupDeployments([
    start("aaa1111", "2026-11-12T03:00:00Z"),
    finish("aaa1111", "2026-11-12T03:01:00Z"),
    { ...start("bbb2222", "2026-11-12T04:00:00Z"), source: "coolify" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.commit),
    ["bbb2222", "aaa1111"],
  );
  assert.equal(rows[0].source, "coolify");
});

test("a finish without a start is still shown", () => {
  const rows = groupDeployments([finish("ccc3333", "2026-11-12T05:00:00Z")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "succeeded");
});

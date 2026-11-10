import { NextResponse } from "next/server";

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function unexpected(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[opencompany:api]", error);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export function ok(data: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...data });
}

import OpenAI from "openai";
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { getConfig } from "@/lib/config";
import { getSession } from "@/lib/session";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CopilotKit runtime for the owner's assistant. The assistant can only do what
 * the owner can do: its frontend actions call the same REST endpoints, and
 * authoritative state stays in SQLite. Business rules are not trusted to the
 * model.
 */
const copilot = new CopilotRuntime({});

export async function POST(request: Request) {
  const config = getConfig();
  if (!config.openai.apiKey) {
    return fail(
      "The owner chat needs an OpenAI-compatible model key. Set OPENAI_API_KEY, or use the forms and decision buttons which work without a model.",
      503,
    );
  }
  try {
    getSession();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 503);
  }

  const openai = new OpenAI({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
  });
  const serviceAdapter = new OpenAIAdapter({ openai, model: config.model });
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilot,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(request);
}

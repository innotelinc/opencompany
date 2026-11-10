import path from "node:path";

/**
 * Runtime configuration. Read from the environment on every call so tests and
 * the worker process can override it without module-cache surprises.
 * Secrets are only ever read here, on the server.
 */
export function getConfig() {
  const num = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const bool = (value: string | undefined, fallback = false) => {
    if (value === undefined || value === "") return fallback;
    return value === "1" || value.toLowerCase() === "true";
  };

  const dataDir = path.resolve(process.env.OPENCOMPANY_DATA_DIR ?? ".data");
  return {
    dataDir,
    dbPath: path.resolve(process.env.OPENCOMPANY_DB ?? path.join(dataDir, "opencompany.db")),
    ownerEmail: process.env.OPENCOMPANY_OWNER_EMAIL ?? "owner@northwind-studio.test",
    companySlug: process.env.OPENCOMPANY_COMPANY_SLUG ?? "northwind-studio",
    agentBackend: (process.env.OPENCOMPANY_AGENT_BACKEND ?? "deterministic").toLowerCase(),
    model: process.env.OPENCOMPANY_MODEL ?? "gpt-4.1-mini",
    modelFallbacks: (process.env.OPENCOMPANY_MODEL_FALLBACKS ?? "agy/gemini-3-flash,agy/gemini-3.5-flash-lite")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
    openai: {
      apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
      baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    },
    deployment: {
      provider: (process.env.OPENCOMPANY_DEPLOY_PROVIDER ?? "vercel").toLowerCase(),
      vercel: {
        token: process.env.VERCEL_TOKEN?.trim() ?? "",
        projectId: process.env.VERCEL_PROJECT_ID?.trim() ?? "",
        teamId: process.env.VERCEL_TEAM_ID?.trim() ?? "",
        projectName: process.env.OPENCOMPANY_DEPLOY_NAME?.trim() || "opencompany-site",
      },
    },
    limits: {
      monthlyBudgetCents: num(process.env.OPENCOMPANY_MONTHLY_BUDGET_CENTS, 2500),
      autoApproveCents: num(process.env.OPENCOMPANY_AUTO_APPROVE_CENTS, 300),
      maxDelegationDepth: num(process.env.OPENCOMPANY_MAX_DELEGATION_DEPTH, 3),
      maxReviewRounds: num(process.env.OPENCOMPANY_MAX_REVIEW_ROUNDS, 2),
      maxAttempts: num(process.env.OPENCOMPANY_MAX_ATTEMPTS, 2),
      runTimeoutSeconds: num(process.env.OPENCOMPANY_RUN_TIMEOUT_SECONDS, 600),
      runLeaseSeconds: num(process.env.OPENCOMPANY_RUN_LEASE_SECONDS, 120),
      workerPollMs: num(process.env.OPENCOMPANY_WORKER_POLL_MS, 1500),
      browserEnabled: bool(process.env.OPENCOMPANY_BROWSER_ENABLED, false),
    },
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

/** True when the configured backend can actually call a model. */
export function liveModelConfigured(): boolean {
  const config = getConfig();
  return config.agentBackend === "llm" && config.openai.apiKey.length > 0;
}

/** Demo mode is the default: real files and checks, but no model calls. */
export function isSimulatedMode(): boolean {
  return !liveModelConfigured();
}

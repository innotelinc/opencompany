import { getPolicies, setPolicy } from "@/lib/domain/repo";

/**
 * Model-provider health.
 *
 * When the gateway rate-limits us, returns 5xx or drops the connection, the
 * worker holds dispatch until the provider's own cooldown expires. That is
 * recorded as company policy so it survives restarts and the owner can see why
 * the company looks idle — a degraded provider is not the same as nothing to do.
 */

export const PROVIDER_COOLDOWN_POLICY = "provider.cooldown_until";
export const PROVIDER_LAST_OUTAGE_POLICY = "provider.last_outage";
const PROVIDER_OUTAGE_COUNT_POLICY = "provider.consecutive_outages";

export interface ProviderHealth {
  coolingDown: boolean;
  cooldownUntil: string | null;
  cooldownSeconds: number;
  lastOutageAt: string | null;
  lastOutageReason: string | null;
  consecutiveOutages: number;
}

const HEALTHY: ProviderHealth = {
  coolingDown: false,
  cooldownUntil: null,
  cooldownSeconds: 0,
  lastOutageAt: null,
  lastOutageReason: null,
  consecutiveOutages: 0,
};

export function getProviderHealth(companyId: string): ProviderHealth {
  const policies = getPolicies(companyId);
  const cooldownUntil = typeof policies[PROVIDER_COOLDOWN_POLICY] === "string" ? policies[PROVIDER_COOLDOWN_POLICY] : null;
  const until = cooldownUntil ? Date.parse(cooldownUntil) : Number.NaN;
  const remainingMs = Number.isFinite(until) ? until - Date.now() : 0;

  const raw = policies[PROVIDER_LAST_OUTAGE_POLICY];
  const outage = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  const count = Number(policies[PROVIDER_OUTAGE_COUNT_POLICY] ?? 0);

  if (!cooldownUntil && !outage) return { ...HEALTHY };

  return {
    coolingDown: remainingMs > 0,
    cooldownUntil,
    cooldownSeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
    lastOutageAt: typeof outage?.at === "string" ? outage.at : null,
    lastOutageReason: typeof outage?.reason === "string" ? outage.reason : null,
    consecutiveOutages: Number.isFinite(count) ? count : 0,
  };
}

/** Record an outage and the window dispatch will wait before trying again. */
export function recordProviderOutage(input: {
  companyId: string;
  reason: string;
  cooldownMs: number;
}): ProviderHealth {
  const cooldownUntil = new Date(Date.now() + Math.max(0, input.cooldownMs)).toISOString();
  const previous = getProviderHealth(input.companyId);
  setPolicy(
    input.companyId,
    PROVIDER_COOLDOWN_POLICY,
    cooldownUntil,
    "Dispatch pauses until this time after the model provider reported a cooldown or outage.",
  );
  setPolicy(
    input.companyId,
    PROVIDER_LAST_OUTAGE_POLICY,
    { at: new Date().toISOString(), reason: input.reason.slice(0, 400), cooldownUntil },
    "Most recent model-provider outage and the wait it caused.",
  );
  setPolicy(
    input.companyId,
    PROVIDER_OUTAGE_COUNT_POLICY,
    previous.consecutiveOutages + 1,
    "Consecutive model-provider outages since the last successful run.",
  );
  return getProviderHealth(input.companyId);
}

/** A successful run clears the outage streak; the last reason stays for context. */
export function clearProviderOutage(companyId: string): void {
  setPolicy(companyId, PROVIDER_COOLDOWN_POLICY, "", "No provider cooldown is in force.");
  setPolicy(companyId, PROVIDER_OUTAGE_COUNT_POLICY, 0, "Consecutive model-provider outages since the last successful run.");
}

/** One-line, owner-facing description of the current provider state. */
export function describeProviderHealth(health: ProviderHealth): string {
  if (health.coolingDown) {
    return `Model provider cooling down — dispatch resumes in ${health.cooldownSeconds}s.`;
  }
  if (health.lastOutageReason) {
    return "Model provider recovered; work can dispatch again.";
  }
  return "Model provider healthy.";
}

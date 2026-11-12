import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { ensureDir } from "@/lib/computers/workspace";
import {
  claimExternalAction,
  finishExternalAction,
  getDecision,
  getDeliverable,
  getExternalAction,
  latestDeliverableVersion,
  listExternalActions,
  recordActivity,
  updateDecision,
} from "@/lib/domain/repo";
import { readArtifactFiles } from "@/lib/engine/artifacts";
import { publishToCoolify } from "@/lib/engine/coolify";
import { publishToVercel } from "@/lib/engine/vercel";

/**
 * External side effects. The rule here is simple: an approved action is claimed
 * exactly once, and an action whose outcome we never observed is recorded as
 * "uncertain" — never silently repeated.
 */

export type ExternalOutcome = {
  status: "succeeded" | "failed" | "blocked" | "uncertain";
  result: Record<string, unknown>;
};

const STALE_CLAIM_MS = 5 * 60 * 1000;

type DeploymentTarget = {
  id: string;
  configured: boolean;
  note: string;
  token: string;
  projectId: string;
  teamId: string;
  projectName: string;
  baseUrl: string;
};

/** Provider state for deployment actions. Secrets stay server-side and are never logged. */
function deploymentTarget(): DeploymentTarget {
  const { deployment } = getConfig();
  if (deployment.provider === "coolify") {
    const { baseUrl, token, appUuid, projectName } = deployment.coolify;
    const configured = Boolean(token && appUuid);
    return {
      id: "coolify",
      configured,
      note: configured
        ? `Deploys the approved artifact through Coolify at ${baseUrl} and checks the public URL.`
        : `No public deployment provider is configured. Set COOLIFY_TOKEN and COOLIFY_APP_UUID to publish approved deployments through ${baseUrl}.`,
      token,
      projectId: appUuid,
      teamId: "",
      projectName,
      baseUrl,
    };
  }
  if (deployment.provider === "vercel") {
    const { token, projectId, teamId, projectName } = deployment.vercel;
    const configured = Boolean(token && projectId);
    return {
      id: "vercel",
      configured,
      note: configured
        ? `Publishes the approved artifact to the Vercel project "${projectName}" and checks the public URL.`
        : "No public deployment provider is configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID to publish approved deployments.",
      token,
      projectId,
      teamId,
      projectName,
      baseUrl: "",
    };
  }
  return {
    id: deployment.provider || "none",
    configured: false,
    note: `No adapter is installed for deployment provider "${deployment.provider}". Set OPENCOMPANY_DEPLOY_PROVIDER=coolify (or vercel).`,
    token: "",
    projectId: "",
    teamId: "",
    projectName: "",
    baseUrl: "",
  };
}

export function externalActionAdapter(kind: string): { id: string; configured: boolean; note: string } {
  if (kind === "deployment_package") {
    const target = deploymentTarget();
    return { id: target.id, configured: target.configured, note: target.note };
  }
  if (kind === "external_communication" || kind === "email") {
    return {
      id: "email",
      configured: false,
      note: "No email provider is configured. Nothing was sent.",
    };
  }
  return { id: kind, configured: false, note: `No adapter is installed for "${kind}".` };
}

export function recoverStaleExternalActions(companyId: string): number {
  const now = Date.now();
  let recovered = 0;
  for (const action of listExternalActions(companyId)) {
    if (action.status !== "executing" || !action.claimedAt) continue;
    if (now - Date.parse(action.claimedAt) < STALE_CLAIM_MS) continue;
    finishExternalAction(companyId, action.id, "uncertain", {
      reason:
        "The worker holding this action stopped before recording an outcome. It was not retried automatically because the external effect may already have happened.",
      claimedAt: action.claimedAt,
    });
    recordActivity({
      companyId,
      actorType: "system",
      type: "external.uncertain",
      summary: `Outcome unknown for ${action.kind} → ${action.target}. Owner review required; it will not be retried automatically.`,
      payload: { actionId: action.id },
    });
    recovered += 1;
  }
  return recovered;
}

export async function executeExternalAction(
  companyId: string,
  actionId: string,
  workerId: string,
): Promise<ExternalOutcome | null> {
  const action = getExternalAction(companyId, actionId);
  if (!action) return null;
  if (action.status !== "approved") return null;

  // Approval must still be valid and must describe exactly this action.
  const decision = action.decisionId ? getDecision(companyId, action.decisionId) : null;
  if (!decision || decision.status !== "approved") {
    finishExternalAction(companyId, action.id, "blocked", {
      reason: "The approving decision is missing or no longer approved.",
    });
    return { status: "blocked", result: { reason: "Approval missing or invalid." } };
  }
  if (decision.actionHash !== action.actionHash) {
    updateDecision(companyId, decision.id, {
      status: "invalidated",
      invalidatedReason: "Action details changed before execution.",
    });
    finishExternalAction(companyId, action.id, "blocked", {
      reason: "The action changed after approval; approval was invalidated.",
    });
    recordActivity({
      companyId,
      actorType: "system",
      type: "external.invalidated",
      summary: `Blocked ${action.kind}: approved details no longer match the action.`,
      payload: { actionId: action.id },
    });
    return { status: "blocked", result: { reason: "Action details changed." } };
  }

  if (!claimExternalAction(companyId, action.id, workerId)) return null;

  try {
    const outcome = await runAdapter(companyId, action.id);
    finishExternalAction(companyId, action.id, outcome.status, outcome.result);
    recordActivity({
      companyId,
      actorType: "system",
      type: `external.${outcome.status}`,
      summary: `${action.kind} → ${action.target}: ${outcome.status}.`,
      payload: { actionId: action.id, ...outcome.result },
    });
    return outcome;
  } catch (error) {
    finishExternalAction(companyId, action.id, "failed", { error: String(error) });
    recordActivity({
      companyId,
      actorType: "system",
      type: "external.failed",
      summary: `${action.kind} → ${action.target} failed before completing.`,
      payload: { actionId: action.id, error: String(error) },
    });
    return { status: "failed", result: { error: String(error) } };
  }
}

async function runAdapter(companyId: string, actionId: string): Promise<ExternalOutcome> {
  const action = getExternalAction(companyId, actionId)!;
  const adapter = externalActionAdapter(action.kind);

  if (action.kind === "deployment_package") {
    const deliverableId = String(action.payload.deliverableId ?? "");
    const deliverable = getDeliverable(companyId, deliverableId);
    const version = deliverable ? latestDeliverableVersion(companyId, deliverable.id) : null;
    const artifactPath = version?.artifactPath ?? String(action.payload.artifactPath ?? "");
    if (!version || !fs.existsSync(artifactPath)) {
      return { status: "failed", result: { reason: "Deliverable artifact is missing." } };
    }
    const target = ensureDir(
      path.join(getConfig().dataDir, "deployments", companyId, action.id),
    );
    const files = readArtifactFiles(artifactPath);
    const publishable = new Map(
      [...files.entries()].filter(([relative]) => relative !== "DEPLOYMENT.md"),
    );
    for (const [relative, body] of publishable) {
      const destination = path.join(target, relative);
      ensureDir(path.dirname(destination));
      fs.writeFileSync(destination, body, "utf8");
    }

    const provider = deploymentTarget();
    if (provider.configured) {
      const published =
        provider.id === "coolify"
          ? await publishToCoolify(publishable, {
              baseUrl: provider.baseUrl,
              token: provider.token,
              appUuid: provider.projectId,
              projectName: provider.projectName,
            })
          : await publishToVercel(publishable, provider);
      const summary =
        `# Deployment package\n\nPrepared for: ${action.target}\nDeliverable version: ${version.version}\n` +
        `Files: ${publishable.size}\nProvider: ${provider.id} "${provider.projectName}"\n` +
        (published.ok
          ? `Public URL: ${published.url}\nReachable after deploy: ${published.reachable ? "yes" : "not confirmed"}\n`
          : `Publication failed: ${published.reason}\n`) +
        `\nAssembled locally from an owner-approved deliverable; approval hash matched at execution.\n`;
      fs.writeFileSync(path.join(target, "DEPLOYMENT.md"), summary, "utf8");
      return {
        status: published.ok ? "succeeded" : "failed",
        result: {
          published: published.ok,
          provider: provider.id,
          url: published.ok ? published.url : null,
          reachable: published.ok ? published.reachable : false,
          reason: published.ok ? undefined : published.reason,
          packagePath: path.relative(process.cwd(), target),
          files: publishable.size,
          deliverableVersion: version.version,
        },
      };
    }

    fs.writeFileSync(
      path.join(target, "DEPLOYMENT.md"),
      `# Deployment package\n\nPrepared for: ${action.target}\nDeliverable version: ${version.version}\nFiles: ${files.size}\n\n` +
        `This package was assembled locally from an owner-approved deliverable.\n` +
        `No public deployment provider is configured, so nothing was published.\n` +
        `${adapter.note}\n`,
      "utf8",
    );
    return {
      status: "blocked",
      result: {
        published: false,
        reason: adapter.note,
        packagePath: path.relative(process.cwd(), target),
        files: files.size,
        deliverableVersion: version.version,
      },
    };
  }

  if (action.kind === "external_communication" || action.kind === "email") {
    return {
      status: "blocked",
      result: {
        sent: false,
        reason: adapter.note,
        wouldSendTo: action.target,
        provider: null,
      },
    };
  }

  return { status: "blocked", result: { reason: adapter.note, configured: adapter.configured } };
}

export function approvedExternalActions(companyId: string) {
  return listExternalActions(companyId).filter((action) => action.status === "approved");
}

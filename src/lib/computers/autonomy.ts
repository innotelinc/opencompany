import { getPolicies, recordActivity, setPolicy } from "@/lib/domain/repo";

/**
 * How much freedom one employee's computer has.
 *
 *   guarded       the default: an allowlisted command set, confined to the
 *                 employee's own workspace directory
 *   yolo          every command the OS allows, still confined to that workspace
 *   host_control  every command, run from the host root with the host's
 *                 environment — this is real control of the machine
 *
 * Only the owner can raise a computer's autonomy, the grant is stored as company
 * policy so it survives restarts, and it is written to the activity log with the
 * reason the owner gave. An employee can never widen its own boundary: the runner
 * reads this state on the server, not from anything the agent sends.
 *
 * Even at host_control the application's own provider credentials are withheld
 * from the child process. Controlling the machine does not require handing an
 * agent the keys to the company's model account, and those keys would otherwise
 * end up in command output and prompts.
 */
export const COMPUTER_AUTONOMY_MODES = ["guarded", "yolo", "host_control"] as const;
export type ComputerAutonomyMode = (typeof COMPUTER_AUTONOMY_MODES)[number];

export const COMPUTER_AUTONOMY_COPY: Record<ComputerAutonomyMode, { label: string; hint: string }> = {
  guarded: {
    label: "Guarded",
    hint: "Allowlisted commands inside the employee's own workspace.",
  },
  yolo: {
    label: "YOLO",
    hint: "Any command, still confined to the employee's workspace. Nothing asks before it runs.",
  },
  host_control: {
    label: "Host control",
    hint: "Any command, from the host root. This employee can change the machine itself.",
  },
};

export interface ComputerAutonomy {
  mode: ComputerAutonomyMode;
  grantedBy: string | null;
  grantedAt: string | null;
  reason: string | null;
}

const POLICY_PREFIX = "computer.autonomy.";

export function autonomyPolicyKey(employeeId: string): string {
  return `${POLICY_PREFIX}${employeeId}`;
}

export function isComputerAutonomyMode(value: string): value is ComputerAutonomyMode {
  return COMPUTER_AUTONOMY_MODES.includes(value as ComputerAutonomyMode);
}

const GUARDED: ComputerAutonomy = { mode: "guarded", grantedBy: null, grantedAt: null, reason: null };

export function getComputerAutonomy(companyId: string, employeeId: string): ComputerAutonomy {
  const raw = getPolicies(companyId)[autonomyPolicyKey(employeeId)];
  if (!raw || typeof raw !== "object") return { ...GUARDED };
  const record = raw as Record<string, unknown>;
  const mode = typeof record.mode === "string" && isComputerAutonomyMode(record.mode) ? record.mode : "guarded";
  return {
    mode,
    grantedBy: typeof record.grantedBy === "string" ? record.grantedBy : null,
    grantedAt: typeof record.grantedAt === "string" ? record.grantedAt : null,
    reason: typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : null,
  };
}

export function setComputerAutonomy(input: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  actorId: string;
  mode: string;
  reason?: string;
}): ComputerAutonomy {
  if (!isComputerAutonomyMode(input.mode)) {
    throw new Error("Computer autonomy must be guarded, yolo or host_control.");
  }
  const previous = getComputerAutonomy(input.companyId, input.employeeId);
  const next: ComputerAutonomy =
    input.mode === "guarded"
      ? { ...GUARDED, grantedBy: input.actorId, grantedAt: new Date().toISOString() }
      : {
          mode: input.mode,
          grantedBy: input.actorId,
          grantedAt: new Date().toISOString(),
          reason: input.reason?.trim() ? input.reason.trim() : null,
        };

  setPolicy(
    input.companyId,
    autonomyPolicyKey(input.employeeId),
    next,
    next.mode === "host_control"
      ? `Owner granted ${input.employeeName} complete host system control.`
      : next.mode === "yolo"
        ? `Owner granted ${input.employeeName} YOLO command access inside its workspace.`
        : `Owner returned ${input.employeeName} to the guarded workspace boundary.`,
  );

  recordActivity({
    companyId: input.companyId,
    actorType: "human",
    actorId: input.actorId,
    type: "computer.autonomy",
    summary:
      next.mode === previous.mode
        ? `Owner re-confirmed ${next.mode.replace(/_/g, " ")} for ${input.employeeName}.`
        : `Owner changed ${input.employeeName}'s computer from ${previous.mode.replace(/_/g, " ")} to ${next.mode.replace(/_/g, " ")}.`,
    payload: { employeeId: input.employeeId, previous, next },
  });

  return next;
}

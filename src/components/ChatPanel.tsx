"use client";

import { CopilotKit, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useRouter } from "next/navigation";

/**
 * Owner chat surface. CopilotKit supplies the conversation and streaming; every
 * action it can take calls the same server endpoints as the buttons, so the
 * backend remains authoritative and no business rule lives in the model.
 */
function OwnerActions({ snapshot }: { snapshot: Record<string, unknown> }) {
  const router = useRouter();

  useCopilotReadable({
    description: "Current company state: mission, goals, decisions, budget, employees and tasks.",
    value: snapshot,
  });

  useCopilotAction({
    name: "submit_customer_brief",
    description:
      "Submit a new owner goal to the AI company. Saves the customer requirements as knowledge and asks the CEO to plan. Requires the owner's authority.",
    parameters: [
      { name: "title", type: "string", description: "Goal title", required: true },
      { name: "brief", type: "string", description: "The owner's instruction", required: true },
      { name: "requirements", type: "string", description: "Customer requirements document", required: true },
    ],
    handler: async ({ title, brief, requirements }: { title: string; brief: string; requirements: string }) => {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, brief, requirements }),
      });
      const payload = await response.json();
      router.refresh();
      return response.ok
        ? `Brief saved. Plan task ${payload.taskId}; the plan will wait in Decisions.`
        : `Rejected: ${payload.error}`;
    },
  });

  useCopilotAction({
    name: "decide_pending_request",
    description: "Approve, reject or request a revision on a decision that is waiting for the owner.",
    parameters: [
      { name: "decisionId", type: "string", description: "Decision id", required: true },
      {
        name: "action",
        type: "string",
        description: "approve, reject or revise",
        required: true,
      },
      { name: "note", type: "string", description: "Reason or requested change", required: false },
    ],
    handler: async ({ decisionId, action, note }: { decisionId: string; action: string; note?: string }) => {
      const response = await fetch(`/api/decisions/${decisionId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json();
      router.refresh();
      return response.ok ? `Decision ${action}d.` : `Rejected: ${payload.error}`;
    },
  });

  useCopilotAction({
    name: "stop_the_company",
    description: "Emergency stop: halt all new agent work immediately. Requires owner authority.",
    parameters: [{ name: "reason", type: "string", description: "Why work is stopping", required: true }],
    handler: async ({ reason }: { reason: string }) => {
      const response = await fetch("/api/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "halt", reason }),
      });
      const payload = await response.json();
      router.refresh();
      return response.ok
        ? `Company halted. ${payload.inFlightNote ?? ""}`
        : `Rejected: ${payload.error}`;
    },
  });

  return null;
}

export default function ChatPanel({
  snapshot,
  enabled,
  reason,
}: {
  snapshot: Record<string, unknown>;
  enabled: boolean;
  reason?: string;
}) {
  if (!enabled) {
    return (
      <div className="chat-wrap">
        <div className="chat-fallback">
          <p style={{ marginTop: 0 }}>Owner chat is not configured.</p>
          <p className="small">{reason ?? "Set OPENAI_API_KEY to enable the CopilotKit assistant."}</p>
          <p className="small">
            Everything in the product still works without it: briefs, decisions, approvals, reviews and reports use
            the forms and buttons, and the deterministic backend performs real file work and real checks.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="chat-wrap">
      <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
        <OwnerActions snapshot={snapshot} />
        <CopilotChat
          labels={{
            title: "Owner console",
            initial:
              "I'm your company interface. Ask what the team is doing, submit a brief, approve a pending action, or stop the company.",
          }}
        />
      </CopilotKit>
    </div>
  );
}

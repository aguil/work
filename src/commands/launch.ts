import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import {
  autoLabel,
  findAgentByPane,
  loadWorkspace,
  saveWorkspace,
  upsertAgent,
  type AgentRecord,
} from "../workspace/state.js";
import { requireWorkspace } from "../workspace/helpers.js";

function registerAgent(
  wsName: string,
  paneId: string,
  cli: string,
  label?: string,
): AgentRecord {
  const ws = loadWorkspace(wsName);
  if (!ws) {
    throw new Error(`Workspace not found: ${wsName}`);
  }

  const existing = findAgentByPane(ws, paneId);
  if (existing) return existing;

  const agentLabel = label ?? autoLabel(cli, ws);
  const record: AgentRecord = {
    label: agentLabel,
    cli,
    paneId,
    status: "unknown",
    confidence: "none",
    detachedAt: null,
    lastSeen: new Date().toISOString(),
  };

  upsertAgent(ws, record);
  saveWorkspace(ws);
  tmux.setOption("pane", "@work-agent-label", record.label, paneId);
  tmux.setOption("pane", "@work-agent-cli", record.cli, paneId);
  return record;
}

function launchInPane(
  paneId: string,
  cli: string,
  cwd?: string,
): void {
  if (cwd) {
    tmux.sendKeys(paneId, `cd ${shellQuote(cwd)}`, true);
  }
  tmux.sendKeys(paneId, cli, true);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function registerLaunchCommand(program: Command): void {
  program
    .command("launch")
    .description("Launch an agent CLI in a pane and register it")
    .argument("<cli>", "Agent CLI command (e.g. cursor-agent, claude)")
    .option("-s, --session <name>", "Tracked tmux session")
    .option("--cwd <path>", "Working directory for the agent")
    .option("--pane <id>", "Use an existing pane instead of creating one")
    .option("--label <name>", "Agent label (default: auto-generated)")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        cli: string,
        opts: {
          session?: string;
          cwd?: string;
          pane?: string;
          label?: string;
          quiet?: boolean;
        },
      ) => {
        const ws = requireWorkspace(opts.session);
        let paneId = opts.pane;

        if (paneId) {
          launchInPane(paneId, cli, opts.cwd);
        } else {
          paneId = tmux.splitWindow({
            target: ws.sessionName,
            cwd: opts.cwd,
            command: cli,
          });
        }

        const record = registerAgent(ws.name, paneId, cli, opts.label);
        if (!opts.quiet) {
          console.log(`${ws.name}: launched ${cli} → ${record.label} (${paneId})`);
        }
      },
    );
}

export function registerAgentRelaunch(agent: Command): void {
  agent
    .command("relaunch")
    .description("Re-launch a detached agent in a new pane")
    .argument("<label>", "Agent label")
    .option("-s, --session <name>", "Tracked tmux session")
    .option("--cwd <path>", "Working directory for the relaunched agent")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        label: string,
        opts: {
          session?: string;
          cwd?: string;
          quiet?: boolean;
        },
      ) => {
        const ws = requireWorkspace(opts.session);
        const agentRecord = ws.agents[label];
        if (!agentRecord) {
          throw new Error(`Agent not found: ${label}`);
        }

        const paneId = tmux.splitWindow({
          target: ws.sessionName,
          cwd: opts.cwd,
          command: agentRecord.cli,
        });

        agentRecord.paneId = paneId;
        agentRecord.status = "unknown";
        agentRecord.detachedAt = null;
        agentRecord.lastSeen = new Date().toISOString();
        saveWorkspace(ws);

        tmux.setOption("pane", "@work-agent-label", agentRecord.label, paneId);
        tmux.setOption("pane", "@work-agent-cli", agentRecord.cli, paneId);

        if (!opts.quiet) {
          console.log(
            `${ws.name}: relaunched ${agentRecord.cli} → ${label} (${paneId})`,
          );
        }
      },
    );
}

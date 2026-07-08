import type { Command } from "commander";
import { clearScreenMetadata } from "../adapters/debounce.js";
import { observeAgentPane } from "../adapters/observe.js";
import { updateAgentFromPane } from "../adapters/update-agent.js";
import {
  type AgentRecord,
  findAgentByPane,
  listWorkspaces,
  saveWorkspace,
} from "../workspace/state.js";
import { registerAgentHookCommand } from "./agent-hook.js";
import { registerAgentRelaunch } from "./launch.js";

export function registerAgentsCommands(program: Command): void {
  program
    .command("agents")
    .description("List all agents across tracked workspaces")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const workspaces = listWorkspaces().filter((w) => !w.archived);

      type FlatAgent = AgentRecord & { workspace: string };
      const allAgents: FlatAgent[] = [];

      for (const ws of workspaces) {
        for (const agent of Object.values(ws.agents)) {
          allAgents.push({ ...agent, workspace: ws.name });
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(allAgents, null, 2));
        return;
      }

      if (allAgents.length === 0) {
        console.log("No agents found");
        return;
      }

      for (const a of allAgents) {
        const pane = a.paneId ?? "detached";
        console.log(
          `${a.workspace}/${a.label}  ${a.cli}  ${a.status}  ${pane}`,
        );
      }
    });

  const agent = program.command("agent").description("Manage a specific agent");

  agent
    .command("label")
    .description("Rename an agent label")
    .argument("<pane-id>", "Pane ID (e.g. %42)")
    .argument("<name>", "New label")
    .option("-q, --quiet", "Suppress output")
    .action((paneId: string, name: string, opts: { quiet?: boolean }) => {
      const workspaces = listWorkspaces().filter((w) => !w.archived);

      for (const ws of workspaces) {
        const agent = findAgentByPane(ws, paneId);
        if (!agent) continue;

        const oldLabel = agent.label;
        delete ws.agents[oldLabel];
        agent.label = name;
        ws.agents[name] = agent;
        saveWorkspace(ws);

        if (!opts.quiet)
          console.log(`Renamed ${oldLabel} → ${name} in ${ws.name}`);
        return;
      }

      if (!opts.quiet) console.error(`No agent found for pane ${paneId}`);
      process.exit(1);
    });

  agent
    .command("detach")
    .description("Mark an agent as detached (called by pane-exited hook)")
    .argument("<pane-id>", "Pane ID")
    .option("-q, --quiet", "Suppress output")
    .action((paneId: string, opts: { quiet?: boolean }) => {
      const workspaces = listWorkspaces().filter((w) => !w.archived);

      for (const ws of workspaces) {
        const agent = findAgentByPane(ws, paneId);
        if (!agent) continue;

        agent.status = "detached";
        agent.detachedAt = new Date().toISOString();
        agent.paneId = null;
        agent.pendingIdleCount = 0;
        agent.confidence = "none";
        clearScreenMetadata(agent);
        saveWorkspace(ws);

        if (!opts.quiet) console.log(`Detached ${agent.label} from ${ws.name}`);
        return;
      }

      // Not an error -- pane may not have been an agent
    });

  agent
    .command("title-changed")
    .description("Handle pane title change (called by pane-title-changed hook)")
    .argument("<pane-id>", "Pane ID")
    .option("-q, --quiet", "Suppress output")
    .action((paneId: string, opts: { quiet?: boolean }) => {
      const workspaces = listWorkspaces().filter((w) => !w.archived);

      for (const ws of workspaces) {
        const agent = findAgentByPane(ws, paneId);
        if (!agent) continue;

        const changed = updateAgentFromPane(agent, paneId);
        if (changed) saveWorkspace(ws);

        if (!opts.quiet) {
          console.log(
            `Title changed for ${agent.label} in ${ws.name}: ${agent.status} (${agent.confidence})`,
          );
        }
        return;
      }
    });

  agent
    .command("observe")
    .description("Evaluate status adapter rules for an agent pane")
    .argument("<pane-id>", "Pane ID")
    .option("--apply", "Apply observation to workspace agent state")
    .option("--json", "Output as JSON")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        paneId: string,
        opts: { apply?: boolean; json?: boolean; quiet?: boolean },
      ) => {
        const workspaces = listWorkspaces().filter((w) => !w.archived);

        for (const ws of workspaces) {
          const agent = findAgentByPane(ws, paneId);
          if (!agent) continue;

          const observed = observeAgentPane(paneId, agent.cli);
          if (opts.apply && observed) {
            if (updateAgentFromPane(agent, paneId)) {
              saveWorkspace(ws);
            }
          }

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  workspace: ws.name,
                  label: agent.label,
                  cli: agent.cli,
                  observed,
                  agent: {
                    status: agent.status,
                    confidence: agent.confidence,
                    pendingIdleCount: agent.pendingIdleCount ?? 0,
                  },
                },
                null,
                2,
              ),
            );
            return;
          }

          if (observed) {
            if (!opts.quiet) {
              console.log(
                `${ws.name}/${agent.label}: ${observed.status} (${observed.confidence}, rule ${observed.rulePriority})`,
              );
            }
          } else if (!opts.quiet) {
            console.log(`${ws.name}/${agent.label}: no manifest match`);
          }
          return;
        }

        if (!opts.quiet) console.error(`No agent found for pane ${paneId}`);
        process.exit(1);
      },
    );

  registerAgentRelaunch(agent);
  registerAgentHookCommand(agent);
}

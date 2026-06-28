import type { Command } from "commander";
import {
  listWorkspaces,
  findAgentByPane,
  saveWorkspace,
  type AgentRecord,
} from "../workspace/state.js";
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
        saveWorkspace(ws);

        if (!opts.quiet)
          console.log(`Detached ${agent.label} from ${ws.name}`);
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

        agent.lastSeen = new Date().toISOString();
        saveWorkspace(ws);

        if (!opts.quiet)
          console.log(
            `Title changed for ${agent.label} in ${ws.name}`,
          );
        return;
      }
    });

  registerAgentRelaunch(agent);
}

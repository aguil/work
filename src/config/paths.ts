import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const home = homedir();

function xdgConfig(): string {
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

function xdgState(): string {
  return process.env.XDG_STATE_HOME ?? join(home, ".local", "state");
}

function xdgRuntime(): string {
  if (process.env.XDG_RUNTIME_DIR) return process.env.XDG_RUNTIME_DIR;
  return join("/tmp", `workctl-${process.getuid?.() ?? process.pid}`);
}

export const paths = {
  config: join(xdgConfig(), "workctl"),
  state: join(xdgState(), "workctl"),
  runtime: join(xdgRuntime(), "workctl"),

  get configFile(): string {
    return join(this.config, "config.json");
  },
  get workspacesDir(): string {
    return join(this.state, "workspaces");
  },
  get socketPath(): string {
    return join(this.runtime, "workctl.sock");
  },
  get pidFile(): string {
    return join(this.runtime, "workctld.pid");
  },
  get manifestsDir(): string {
    return join(this.config, "manifests");
  },
  get actionsDir(): string {
    return join(this.config, "actions");
  },
  get trustFile(): string {
    return join(this.state, "trust.json");
  },
} as const;

export function ensureDirs(): void {
  mkdirSync(paths.config, { recursive: true });
  mkdirSync(paths.actionsDir, { recursive: true });
  mkdirSync(paths.workspacesDir, { recursive: true });
  mkdirSync(paths.runtime, { recursive: true, mode: 0o700 });
}

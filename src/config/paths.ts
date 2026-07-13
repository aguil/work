import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();

function xdgConfig(): string {
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

function xdgState(): string {
  return process.env.XDG_STATE_HOME ?? join(home, ".local", "state");
}

function xdgRuntime(): string {
  if (process.env.XDG_RUNTIME_DIR) return process.env.XDG_RUNTIME_DIR;
  return join("/tmp", `work-${process.getuid?.() ?? process.pid}`);
}

export const paths = {
  get config(): string {
    return join(xdgConfig(), "work");
  },
  get state(): string {
    return join(xdgState(), "work");
  },
  get runtime(): string {
    return join(xdgRuntime(), "work");
  },

  get configFile(): string {
    return join(this.config, "config.json");
  },
  get workspacesDir(): string {
    return join(this.state, "workspaces");
  },
  get socketPath(): string {
    return join(this.runtime, "work.sock");
  },
  get pidFile(): string {
    return join(this.runtime, "workd.pid");
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
};

export function ensureDirs(): void {
  mkdirSync(paths.config, { recursive: true });
  mkdirSync(paths.actionsDir, { recursive: true });
  mkdirSync(paths.manifestsDir, { recursive: true });
  // Workspace state stores pane-derived text (e.g. status evidence), so it
  // must not be readable by other users. chmod also fixes existing installs.
  mkdirSync(paths.workspacesDir, { recursive: true, mode: 0o700 });
  chmodSync(paths.workspacesDir, 0o700);
  mkdirSync(paths.runtime, { recursive: true, mode: 0o700 });
}

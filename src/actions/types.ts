export type ActionScope = "global" | "repo";

export interface ActionDefinition {
  /** Unique id: `name` for global, `repoLabel/name` for repo-local */
  id: string;
  name: string;
  description: string;
  command: string;
  cwd: string | null;
  scope: ActionScope;
  repoLabel: string | null;
  treePath: string | null;
  sourceFile: string;
}

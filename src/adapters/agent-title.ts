const ACTIVE_AGENT_TITLE = /working|⏳/i;

/** Pane title shows an in-progress agent turn (spinner / working label). */
export function isActiveAgentTitle(title: string): boolean {
  return ACTIVE_AGENT_TITLE.test(title);
}

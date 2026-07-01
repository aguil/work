import type { VcsType } from "./detect.js";
import * as git from "./git.js";
import * as jj from "./jj.js";

export interface CheckoutRemovalRisk {
  warnings: string[];
  uncommittedChanges: boolean;
  unpushedToDefault: boolean;
  defaultRef: string | null;
}

export function assessCheckoutRemovalRisk(
  path: string,
  vcsType: VcsType,
): CheckoutRemovalRisk {
  if (vcsType === "git") return assessGitRemovalRisk(path);
  if (vcsType === "jj") return assessJjRemovalRisk(path);
  return {
    warnings: [],
    uncommittedChanges: false,
    unpushedToDefault: false,
    defaultRef: null,
  };
}

function assessGitRemovalRisk(path: string): CheckoutRemovalRisk {
  const warnings: string[] = [];
  const defaultRef = git.gitDefaultBranch(path);
  const dirty = git.gitDirty(path);
  let unpushedToDefault = false;

  if (dirty) {
    warnings.push("checkout has uncommitted changes");
  }

  if (defaultRef) {
    const ahead = git.gitCommitsAheadOf(path, defaultRef);
    if (ahead > 0) {
      unpushedToDefault = true;
      warnings.push(
        `${ahead} commit(s) on this checkout are not in ${defaultRef}`,
      );
    }
  } else if (!dirty) {
    warnings.push(
      "could not determine default branch; review history manually",
    );
  }

  return {
    warnings,
    uncommittedChanges: dirty,
    unpushedToDefault,
    defaultRef,
  };
}

function assessJjRemovalRisk(path: string): CheckoutRemovalRisk {
  const warnings: string[] = [];
  const defaultRef = jj.jjDefaultBookmark(path);
  const dirty = jj.jjDirty(path);
  let unpushedToDefault = false;

  if (dirty) {
    warnings.push("workspace has uncommitted changes");
  }

  if (defaultRef) {
    if (jj.jjHasCommitsNotIn(path, defaultRef)) {
      unpushedToDefault = true;
      warnings.push(`workspace has commits not merged into ${defaultRef}`);
    }
  } else if (!dirty) {
    warnings.push(
      "could not determine default bookmark; review history manually",
    );
  }

  return {
    warnings,
    uncommittedChanges: dirty,
    unpushedToDefault,
    defaultRef,
  };
}

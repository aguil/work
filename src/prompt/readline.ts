import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

export async function promptLine(
  question: string,
  defaultValue?: string,
): Promise<string> {
  if (!input.isTTY) {
    return defaultValue ?? "";
  }

  const rl = createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    if (!answer && defaultValue !== undefined) return defaultValue;
    return answer;
  } finally {
    rl.close();
  }
}

export async function promptConfirm(
  question: string,
  defaultYes = false,
): Promise<boolean> {
  if (!input.isTTY) {
    return defaultYes;
  }

  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await promptLine(`${question} (${hint})`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

export async function promptRepoSelection<
  T extends { name: string; vcsType: string; path: string },
>(repos: T[]): Promise<T[]> {
  if (repos.length === 0) {
    throw new Error("No repositories found to select");
  }

  if (!input.isTTY) {
    return repos;
  }

  console.log("\nSelect repos to include:");
  repos.forEach((repo, index) => {
    console.log(`  ${index + 1}. ${repo.name} (${repo.vcsType}, ${repo.path})`);
  });

  const answer = await promptLine("Enter numbers (e.g. 1,2) or 'all'", "all");

  if (!answer || answer.toLowerCase() === "all") {
    return repos;
  }

  const indexes = new Set(
    answer
      .split(",")
      .map((part) => parseInt(part.trim(), 10) - 1)
      .filter((idx) => idx >= 0 && idx < repos.length),
  );

  const selected = repos.filter((_, idx) => indexes.has(idx));
  if (selected.length === 0) {
    throw new Error("No repositories selected");
  }
  return selected;
}

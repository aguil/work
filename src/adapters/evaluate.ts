import type { MatchExpr } from "./types.js";

function normalizeContains(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.toLowerCase());
}

function matchContains(text: string, needles: string[] | undefined): boolean {
  const normalized = text.toLowerCase();
  const targets = normalizeContains(needles);
  return targets.some((needle) => normalized.includes(needle));
}

function matchRegex(text: string, patterns: string[] | undefined): boolean {
  for (const pattern of patterns ?? []) {
    try {
      if (new RegExp(pattern, "im").test(text)) return true;
    } catch {
      // ignore invalid patterns
    }
  }
  return false;
}

function matchLineRegex(text: string, patterns: string[] | undefined): boolean {
  const lines = text.split("\n");
  for (const pattern of patterns ?? []) {
    try {
      const re = new RegExp(pattern);
      if (lines.some((line) => re.test(line))) return true;
    } catch {
      // ignore invalid patterns
    }
  }
  return false;
}

export function evaluateMatch(text: string, expr: MatchExpr): boolean {
  if (expr.all) {
    return expr.all.every((entry) => evaluateMatch(text, entry));
  }
  if (expr.any) {
    return expr.any.some((entry) => evaluateMatch(text, entry));
  }
  if (expr.not) {
    return !evaluateMatch(text, expr.not);
  }

  const checks: boolean[] = [];
  if (expr.contains) checks.push(matchContains(text, expr.contains));
  if (expr.regex) checks.push(matchRegex(text, expr.regex));
  if (expr.line_regex) checks.push(matchLineRegex(text, expr.line_regex));

  if (checks.length === 0) return false;
  return checks.some(Boolean);
}

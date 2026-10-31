// Expected HTTP status spec: comma-separated tokens, each either an exact code
// ("200") or a class ("2xx"). Shared by the monitor form (validation) and the
// worker (matching), so it must stay free of Next/React imports.

export type StatusRule = { kind: "exact"; code: number } | { kind: "class"; digit: number };

const EXACT = /^[1-5]\d\d$/;
const CLASS = /^([1-5])xx$/;

/** Parses a spec into rules, or returns null if any token is invalid. */
export function parseExpectedStatus(spec: string): StatusRule[] | null {
  const tokens = spec
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return null;

  const rules: StatusRule[] = [];
  for (const t of tokens) {
    const cls = CLASS.exec(t);
    if (cls) rules.push({ kind: "class", digit: Number(cls[1]) });
    else if (EXACT.test(t)) rules.push({ kind: "exact", code: Number(t) });
    else return null;
  }
  return rules;
}

/** Canonical form for storage: trimmed, lowercased, de-duplicated, "2xx,200". */
export function normalizeExpectedStatus(spec: string): string | null {
  const rules = parseExpectedStatus(spec);
  if (!rules) return null;
  const tokens = rules.map((r) => (r.kind === "class" ? `${r.digit}xx` : String(r.code)));
  return [...new Set(tokens)].join(",");
}

export function matchesExpectedStatus(spec: string, code: number): boolean {
  const rules = parseExpectedStatus(spec) ?? [{ kind: "class", digit: 2 }];
  return rules.some((r) => (r.kind === "class" ? Math.floor(code / 100) === r.digit : r.code === code));
}

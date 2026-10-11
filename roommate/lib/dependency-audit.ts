type Advisory = { name: string; url: string };
type Vulnerability = { severity: string; nodes: string[]; via: (string | Advisory)[] };
export type AuditReport = { vulnerabilities: Record<string, Vulnerability> };
export type DependencyLock = { packages: Record<string, { dev?: boolean }> };

const deferredPackages = new Set([
  "braces", "micromatch", "fast-glob", "@next/eslint-plugin-next", "eslint-config-next",
]);
const deferredAdvisory = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const exceptionExpires = new Date("2026-11-10T00:00:00Z");

export function reviewDependencyAudit(report: AuditReport, lock: DependencyLock, now = new Date()) {
  // No upstream fix exists for this development-only ESLint dependency. Only
  // trusted repository root patterns reach it; it is absent from the runtime.
  // This exception expires, rejects runtime copies, and never covers new issues.
  function isDeferred(name: string, seen = new Set<string>()): boolean {
    const issue = report.vulnerabilities[name];
    if (now >= exceptionExpires || !deferredPackages.has(name) || seen.has(name) || !issue) return false;
    if (issue.severity !== "high" || !issue.nodes.length || !issue.via.length) return false;
    if (!issue.nodes.every((node) => lock.packages[node]?.dev === true)) return false;
    const nextSeen = new Set([...seen, name]);
    return issue.via.every((via) => typeof via === "string"
      ? isDeferred(via, nextSeen)
      : name === "braces" && via.name === "braces" && via.url === deferredAdvisory);
  }

  const blocking: string[] = [];
  const deferred: string[] = [];
  for (const [name, issue] of Object.entries(report.vulnerabilities)) {
    if (!["high", "critical"].includes(issue.severity)) continue;
    (isDeferred(name) ? deferred : blocking).push(name);
  }
  return { blocking, deferred };
}

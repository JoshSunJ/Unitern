import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { reviewDependencyAudit, type AuditReport, type DependencyLock } from "../lib/dependency-audit";

const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (result.error) throw result.error;
if (result.status !== 0 && result.status !== 1) throw new Error(`npm audit failed: ${result.stderr}`);
const report = JSON.parse(result.stdout) as AuditReport & { error?: unknown };
if (report.error || !report.vulnerabilities) throw new Error("npm audit did not return a valid advisory report.");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as DependencyLock;
const findings = reviewDependencyAudit(report, lock);
if (findings.deferred.length) {
  console.warn("Temporary development-only braces exception (expires 2026-11-10):", findings.deferred.join(", "));
}
if (findings.blocking.length) {
  console.error("Unresolved high/critical dependency advisories:", findings.blocking.join(", "));
  process.exitCode = 1;
} else {
  console.log("Dependency audit passed; every runtime and non-exempt high/critical advisory is checked.");
}

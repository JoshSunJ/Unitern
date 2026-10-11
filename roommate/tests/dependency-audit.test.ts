import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewDependencyAudit, type AuditReport, type DependencyLock } from "../lib/dependency-audit";

function fixture() {
  const report: AuditReport = { vulnerabilities: {
    braces: { severity: "high", nodes: ["node_modules/braces"], via: [{
      name: "braces", url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
    }] },
    micromatch: { severity: "high", nodes: ["node_modules/micromatch"], via: ["braces"] },
  } };
  const lock: DependencyLock = { packages: {
    "node_modules/braces": { dev: true }, "node_modules/micromatch": { dev: true },
  } };
  return { report, lock, now: new Date("2026-10-10T00:00:00Z") };
}

test("the known braces advisory is deferred only in the development dependency chain", () => {
  const { report, lock, now } = fixture();
  assert.deepEqual(reviewDependencyAudit(report, lock, now), { blocking: [], deferred: ["braces", "micromatch"] });
});

test("runtime copies of the same dependency remain blocked", () => {
  const { report, lock, now } = fixture();
  lock.packages["node_modules/braces"].dev = false;
  assert.deepEqual(reviewDependencyAudit(report, lock, now).blocking, ["braces", "micromatch"]);
});

test("a new advisory on braces is never covered by the exception", () => {
  const { report, lock, now } = fixture();
  report.vulnerabilities.braces.via.push({ name: "braces", url: "https://github.com/advisories/GHSA-new-issue" });
  assert.deepEqual(reviewDependencyAudit(report, lock, now).blocking, ["braces", "micromatch"]);
});

test("the development exception expires automatically", () => {
  const { report, lock } = fixture();
  assert.deepEqual(reviewDependencyAudit(report, lock, new Date("2026-11-10T00:00:00Z")).blocking, ["braces", "micromatch"]);
});

test("critical severity is never deferred", () => {
  const { report, lock, now } = fixture();
  report.vulnerabilities.braces.severity = "critical";
  assert.deepEqual(reviewDependencyAudit(report, lock, now).blocking, ["braces", "micromatch"]);
});

test("unrelated tooling advisories and missing dependency metadata remain blocked", () => {
  const { report, lock, now } = fixture();
  report.vulnerabilities.other = { severity: "high", nodes: ["node_modules/other"], via: ["braces"] };
  delete lock.packages["node_modules/braces"];
  assert.deepEqual(reviewDependencyAudit(report, lock, now).blocking, ["braces", "micromatch", "other"]);
});

# Dependency security review

`npm run audit:dependencies` checks production and development dependencies and
fails for high or critical advisories. Network or audit-report failures also fail
the check.

One temporary exception covers only
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
the unpatched recursive-pattern denial of service in `braces` 3.0.3. It reaches
this repository through Next's ESLint root-directory glob tooling
(`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`).
The glob input comes from trusted repository configuration, not application
requests. These packages are development-only and absent from the standalone
deployment. The runtime dependency audit has no exceptions.

The exception expires on **2026-11-10 UTC**. The check rejects runtime copies,
missing lockfile metadata, any new advisory, and critical severity. Replace the
dependency with its upstream patch when available and remove the exception.
Until then, do not use this tooling to process untrusted glob patterns.

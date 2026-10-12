- Dependency and action-pin sweep in place of Dependabot's #110 and #112 to #116, none of which
  could go green alone: each inherited `main`'s red audit, and #116 also needed the gate artifact
  recompiled. Vitest and `@vitest/coverage-v8` 5.0.0 → 5.0.3, `zod` 4.6.2 → 4.6.5, `@types/node`
  26.5.1 → 26.6.5, `codeql-action` 4.38.0 → 4.38.3, and Portulan 0.1.2 → 0.2.0, whose compiler
  writes its restart advisory into `.claude/settings.json` from the same policy: two hooks and a
  status line beside the six `ask` permissions and two gate hooks already there.

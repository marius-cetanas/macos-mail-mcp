- `main` is audited every day by a scheduled workflow, `scheduled-audit.yml`, which runs the steps
  of the merge gate's `audit` job. An advisory is published against a version, so the lockfile on
  `main` can become vulnerable without a commit, and CI audits only on a push or a pull request:
  twice, on 2026-09-14 and 2026-10-12, the first sign was a batch of Dependabot pull requests red
  on an audit none of them could fix. `tests/workflows/scheduled-audit.test.ts` holds the copy to
  the original, so the two cannot come to measure different thresholds.

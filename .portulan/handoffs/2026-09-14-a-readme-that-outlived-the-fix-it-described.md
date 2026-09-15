# Handoff — a README that outlived the fix it described

**State, dated 2026-09-15 at session close.** Branch `docs/rulesets-readme-no-longer-a-pair` is open
as #83, rebased onto `main` at `c02b598` after #79, #80 and #81 merged under this session. It is
**not merged**: merging is Gated. Copilot's thread on the test was addressed in the last push and
left unresolved, because replying to it and resolving it post as the maintainer; see *Open
questions*.

The verify recipe at the pushed head:

- exit 0, **685 passed across 33 files**, none skipped;
- 100% statements (263/263), branches (100/100), functions (64/64) and lines (262/262) on `src/`;
- 0 vulnerabilities;
- `npx portulan compile --check` GREEN.

Every local run was on macOS under Node 26.8.1, so the `osascript` tests ran, and neither of CI's
Node versions, 22 and 24, was exercised here. `src/` is untouched and every commit is typed `docs`,
so nothing here is releasable.

## The defect, and how long it stood

`.github/rulesets/README.md` said the `copilot-reviewed` check depended on the `copilot auto-review
on pull requests` ruleset:

- "if this ruleset is deleted, no round is ever requested";
- the check fails "with nothing explaining why";
- "The two are a pair."

#37 wrote that on 2026-08-20, and it was true then. #49 made it false on 2026-08-26, when the check
began requesting the round itself and naming a failed request in its log. #49 rewrote the gate map's
paragraph to "no longer depends on that pairing", but it did not open the README, which kept saying
the opposite until this change.

It is the shape the last two handoffs kept recording: a commit changes what is true, and a sentence
describing the old truth survives in a file the commit did not open. Here it survived twice. The gate
map #49 did edit kept one word of the old truth, calling the payload "the dependency", and two
reviewers found it.

## Measured before a word was written

The task summarised the new truth. Each point was re-read at its source rather than taken from that
summary:

- **#49's timeline** has `review_requested` by `github-actions[bot]` at 10:38:23Z. That is the
  check's own request, recorded on a person's pull request.
- **Dependabot's #67, #68, #72, #75 and #76** have no `review_requested` event from anyone. The
  `copilot-reviewed` logs on #67, #68, #72 and #76 each carry "the request did not take (#58)". #67
  and #76 then landed on a person's review; #68 and #72 expired. So the #64 path runs live, not only
  in the suite.
- **#77** was opened at 15:11:46Z and requested by the ruleset in the same second. The reviewer later
  measured 0–1 s on #49, #73, #74, #77 and #78.
- **The live ruleset** matches `copilot-auto-review.json` on every field.
- **The fork case was never measured.** The repository is public, so a fork's token is read-only by
  GitHub's documentation. But the only cross-repository pull request here, #33 (2026-08-18),
  predates the check, which #37 added. The README says "expected, not measured", where the task's
  summary had stated it as fact.

## What changed

- **The README** now says:
  - what the ruleset still buys, quoting the gate map;
  - that the ruleset reaches every non-draft pull request against the default branch except one
    Dependabot opens (#47);
  - that the job decides once, and only about a Copilot round;
  - what the check does without the ruleset, for a person's pull request, a Dependabot one and a
    fork's.
- **`tests/workflows/copilot-ruleset.test.ts`**, 19 tests:
  - Each thing the README says the check does is driven through `awaitRound`:
    - it asks once, and decides once;
    - where a person's review is owed, it asks Copilot for nothing;
    - a failed request keeps it waiting;
    - a round has to land in time;
    - an unrecorded request lets a person's review land.
  - The quoted log line is derived from the log.
  - The ruleset description, and its Dependabot exception, are held to the payload.
  - Every gate map quotation is held to the gate map.
  - The stale claim, in the five shapes it was written, is refused in every tracked document, and six
    true neighbouring sentences are pinned as not matching.
- **`.portulan/gate-map.md`**: one phrase, "so the dependency is reviewable" → "so the ruleset is
  reviewable". Apart from the changelog entry and this handoff, it is the only change outside the
  README and its test.
- **An `[Unreleased]` → Internal changelog entry.**

## Decisions + why

- **Coupled to behaviour, not only a banned phrase.** A test that the README "no longer says" the
  claim would have passed on 2026-08-20 and gone on passing through #49. The failure was never the
  phrase; it was that nothing tied the README to the script. The banned phrases are still there, read
  across `documents()` per #73. They are narrowed to the shapes they were written in, since review
  showed a wider one reads true sentences, and extended to every claim the old paragraph made, since
  a later review showed two of the four were missing.
- **What no test reaches is written down, not implied.** How soon the ruleset asks, and whether a
  request records, are GitHub's behaviour, and injected I/O cannot see them. The test's docblock and
  the changelog both say so. The changelog said otherwise in the first pass, and that was the first
  review's one required change.
- **A new file, not a block in `copilot-round.test.ts`.** #81 and #82 both rewrite that file. Its
  subject is the script, and this test's subject is the README's claims about it.
- **Quote the gate map rather than restate it.** A quotation can be checked; a paraphrase can only be
  re-read.
- **One phrase of the gate map, not its paragraph.** The task scoped the change to the README. The
  gate map's "the dependency" was fixed anyway, because the README now links that section as its
  authority, which put the contradiction one click away, and because two reviewers asked. Its larger
  gap is left for a decision; see below.
- **Worded to survive #82.** The README does not quote the `recorded === false` log line, which #82
  rewrites, and says "a person's review" rather than "any human review", because #82 narrows what
  counts.
- **A changelog entry, on #77's precedent over #59's.** Both are documentation corrections. #77
  shipped a test and cited `CONTRIBUTING.md`'s ask for an entry in every pull request, and this ships
  a test too.
- **Shown to fail, not only to pass.** On the final test, each mutation was restored and the tree
  checked back to its staged state.
  - Against `main`'s README, 8 of 19 fail.
  - Removing the once-per-run latch fails the two tests that pin it.
  - Each of these fails exactly the one test pinning it:
    - the log line reworded;
    - `recorded === false` no longer opening the person's-review path;
    - a failed request ending the wait;
    - the gate map's reason reworded, and its heading renamed;
    - `review_on_push` set to false;
    - three of the old paragraph's phrasings restated in `CLAUDE.md`, one at a time;
    - the README's "requested in time" and "whenever" wordings restored;
    - its "Copilot round owed" narrowed back to "round owed", and its person's-review sentence
      removed;
    - the job re-deciding after a pending first look;
    - the job asking Copilot where a person's review is owed;
    - the Dependabot exception removed;
    - a round landing after the budget counted;
    - the gate map's "the dependency" restored.
  - Three true sentences added to documents leave it green: one about drafts, one about
    `pull-requests: write`, and the old failure told in the past tense.

## What the reviews changed

Three reviews: two of `6dbe003`, one of `d4a172e`. Every finding was reproduced before it was acted
on.

**An independent reviewer in its own worktree returned APPROVE-WITH-ADJUSTMENTS on `6dbe003`.** Its
first run stopped on a session rate limit after one message. It was resumed, against the rebased
head, once the limit reset.

- **Required: the changelog overclaimed.** It said changing any README claim fails the test. With four
  GitHub-side claims made false at once, the test stayed 10/10 green.
- **The stale-claim scan read a true sentence as the claim.** With `ever` optional, "On a draft pull
  request no round is requested" turned it red, and on a draft that is exactly what happens.
- **"whenever a round is owed and none is on order, its job requests it" was wrong.** The job decides
  once: with a round on order at its first look and gone after, it made 0 requests over 4 polls and
  expired.
- **"a round requested by hand before the budget runs out still counts" was wrong.** A round landing at
  690 s expired at 600 s; one landing at 570 s landed.
- **The request records on a person's pull request because the round is billed to a licensed
  author.** #49's author is one.
- **It confirmed what the first pull request description had left as intent.** A scratch merge of #82's
  `0b94e85` onto `6dbe003` conflicts only in `CHANGELOG.md`, and this test and
  `copilot-round.test.ts` pass 144/144 in the merged tree.

**Copilot's round on `6dbe003`** said "Needs a closer look", in two suppressed comments with no
thread:

- **The gate map's "the dependency".** The reviewer had flagged it too. It is now fixed, and pinned as
  a stale shape.
- **Nothing held the Dependabot exception.** Removing it left the suite green. The sentence stating the
  ruleset's reach must now name it.

**Copilot's round on `d4a172e`** said "Changes recommended", in one thread and two suppressed
comments:

- **The scan held two of the old paragraph's four claims** (the thread, on the test). "fails with
  nothing explaining why" and "The two are a pair", restated in `CLAUDE.md`, left the test 14/14
  green. Both are now shapes, and two sentences are pinned as not matching them: the gate map's
  past-tense "were a pair", and a past-tense account of the old failure. No tracked document used
  either phrase, so the new shapes read no true sentence red today.
- **"the first time its job finds a round owed" was still too broad.** A diff Copilot declined to read
  drew 0 requests over 3 polls: where a person's review is owed, the job asks Copilot for nothing.
  The README now says "a Copilot round" and names that case, and a test holds both.
- **This handoff's own inventory** called the gate map phrase "the only change outside the README and
  its test", one bullet above the changelog entry. It now names the exceptions.

**A slip of my own, caught by the guard.** The first pass at the first round of fixes rewrote the
README's paragraph and first bullet but not the fork bullet. The updated test failed on the missing
"lands before the budget runs out" wording, and the command stopped before committing, as it was
written to.

## Found in passing *(not fixed here)*

- **The gate map's "The platform floor" never names #58 or #64.** After describing the bot-author hole
  it says "So the check now requests the round itself", and that the check asking "is the floor
  beneath" the ruleset. On a Dependabot pull request, asking records nothing, and the floor is a
  person's review. Both of the first reviewers read it as implying that asking closes both holes. The
  README quotes only the sentence about the common path, which holds there.
- **`origin/main` moved under this session twice.**
  - #80 first, which also added an `[Unreleased]` → Internal entry. That rebase came before the first
    push, so it cost no review round.
  - Then #79 and #81, after #83 was open. That rebase needed a force-push with a lease and cost
    Copilot's round on `6dbe003`.
  - Each rebase conflicted only in `CHANGELOG.md`, and every entry was kept in merge order.
- **#81 rewrote `makeGithubIo`'s `api` to follow pages.** This test injects its own `api` into
  `awaitRound` rather than going through `makeGithubIo`, so paging cannot reach its stubs. That was
  read from #81's diff before rebasing, not assumed.
- **#82 adds another entry in the same place**, so whichever merges second conflicts there again.
- **`node_modules/` was absent from this worktree at session start again**, so the Portulan hooks could
  not start before `npm ci`. That is the previous handoff's first finding, recurring.

## Open questions *(human-owned)*

- **Whether to reply to and resolve Copilot's thread on the test.** `main` requires conversation
  resolution, so #83 cannot merge while it stands. A reply posted from an agent session goes out under
  the maintainer's account, which is the concern #79 and #82 record, so it was not posted unasked.
- Whether "The platform floor" should name #58 and #64, so it stops reading as if asking closes the
  bot-author hole.
- Whether to measure the fork case, which would turn the README's "expected" into a measurement. For
  example, a pull request from a second account's fork.

**Next action.** #83 awaits Copilot's round on its new head, the thread's resolution, and review;
merging is Gated.

**Recoverability.** Nothing partial: every change is on the pushed branch, and no tag, release or
publish was touched.

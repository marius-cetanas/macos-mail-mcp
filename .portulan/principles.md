# Principles — macos-mail-mcp

**type:** rule
**scope:** repository — `marius-cetanas/macos-mail-mcp`
**provenance:** `form=incident` — each principle names the change that produced it

Few, and each earned. A principle nobody violated is a preference.

## A silent wrong answer is worse than a loud failure

`send_message` sent from whichever account Mail felt like and returned `{"success": true}`. The
sender was only discoverable afterwards by finding the message in a Sent mailbox. Every guard here
follows from that: `fromAccount` errors on an unrecognised value rather than falling back, and every
compose tool returns the account it actually used, whether or not one was requested.
_(Incident: the 2026-08-04 message that went out from iCloud instead of Gmail.)_

## An error message that misleads costs more than one that is missing

An anonymous npm publish surfaces as `E404`, which reads as "package not found" — so a correct
refusal sent the reader to inspect the registry instead of the workflow. Guards here state only what
they know: the version guard says the tag exists and the registry did not report the version, and
names both causes rather than asserting one.
_(Incident: the v1.3.0 publish failure, misdiagnosed confidently before the logs were read.)_

## Prefer the reversible thing last

npm will not reissue a version; a tag can be deleted. So the release publishes first and tags only
after the registry confirms. The inverse ordering left `v1.3.0` pointing at a version that did not
exist.

## A claim needs an assertion, not a sentence

Documentation drifted from the workflows repeatedly, and only the one piece of prose under test —
the check that nothing claims merging publishes — held. Where a claim can be asserted, assert it.

## Test what a release does, not what development does

Two correct things contradicted each other: the workflow rewrites the version in the working tree
before the checks, and a test asserted that tree still held the placeholder. Every check was green
on `main` because nothing except a release rewrites the tree.
_(Incident: the first real release, which failed on `expected '1.3.1' to be '0.0.0-development'`.)_

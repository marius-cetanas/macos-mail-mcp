# Changelog fragments

One file per entry for the next release, so two open changes never edit the same lines. Name each
`<slug>.<section>.md`, the section one of added, changed, deprecated, removed, fixed or security, and write one top-level
bullet, with any link relative to this directory. `portulan index --changes changes` prints them grouped,
with their links moved up one directory, as the release cut pastes them under the new version in
`../CHANGELOG.md`. The cut then deletes them and keeps this file, so the directory stays tracked.

The entries `portulan upgrade` moved here from the changelog's Unreleased are named
`<n>-<slug>.<section>.md`, numbered in the changelog's order and padded to one width, since the cut reads
fragments by name: they print as the changelog held them, but for an entry that did not open `- `, whose
fragment does, and ahead of any fragment named by its slug.

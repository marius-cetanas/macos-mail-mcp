- The Portulan workspace is in the form Portulan 0.2.0 keeps its own in, taken with
  `portulan upgrade`. A changelog entry is a file of its own under `changes/`, pasted under the
  version's heading when a release is recorded, so two open pull requests no longer edit the same
  lines of this file. `Internal` is not one of the six sections a fragment can name, so a change to
  CI or the tooling is filed under Changed from here on, and says what it is. A session boots from
  a card compiled into `.claude/rules/portulan/boot.md`. A `comments` recipe holds the comment
  lines that record a change's history at 296, the count on the day it was drafted; that history
  goes in the commit message. The merge gate runs the recipe and checks every fragment, and the
  `changelog` check sends a misfiled entry to `changes/` rather than to `[Unreleased]`.

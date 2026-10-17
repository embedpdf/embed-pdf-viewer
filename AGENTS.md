# Repository agent guidance

The repository's conventions are in
[`docs/conventions/README.md`](docs/conventions/README.md): the architecture,
state and sync, events, plugins, testing, naming and comments, and the
boundary-specific laws. Use
[embedpdf-conventions](.agents/skills/embedpdf-conventions/SKILL.md) to find
the documents that own a change; it routes each change to the smallest
relevant set instead of loading every convention.

Use [embedpdf-changesets](.agents/skills/embedpdf-changesets/SKILL.md) when
creating or auditing pull-request changesets. This repository requires one
changeset file per directly affected package; never combine packages in one
file.

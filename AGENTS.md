# Repository agent guidance

Use [embedpdf-conventions](.agents/skills/embedpdf-conventions/SKILL.md) for
architecture and implementation conventions. It routes each change to the
smallest relevant reference instead of loading every convention.

Use [embedpdf-changesets](.agents/skills/embedpdf-changesets/SKILL.md) when
creating or auditing pull-request changesets. This repository requires one
changeset file per directly affected package; never combine packages in one
file.

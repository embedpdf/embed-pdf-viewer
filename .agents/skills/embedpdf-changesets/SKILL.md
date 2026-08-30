---
name: embedpdf-changesets
description: Create and audit Changesets release notes for EmbedPDF pull requests and working-tree changes. Use when a PR needs changesets, when package coverage must be verified, or when combined or duplicate package changesets need cleanup.
---

# EmbedPDF changesets

Create release metadata from the actual package changes in the pull request,
including relevant uncommitted work. The repository convention is strict: one
changeset file describes exactly one package.

## Audit the change

1. Resolve the PR base branch and merge base. Inspect committed changes from the
   merge base through `HEAD`, then inspect staged, unstaged, and untracked files.
2. Group changed files by their nearest package manifest. Read each affected
   `package.json` and the repository Changesets configuration.
3. Review changesets added by this PR separately from changesets that already
   exist on the base branch.
4. Decide which directly changed packages have a user-visible release impact.

Add a changeset for a publishable package when its runtime behavior, public API,
types, exports, generated client surface, packaged assets, or dependency
requirements change. Usually skip private packages, tests alone, examples,
internal tooling, and comment- or documentation-only edits. Do not add release
notes merely because a downstream package belongs to a Changesets fixed group;
let Changesets compute fixed-group propagation.

## File convention

Every new or retained file must have one package entry in its frontmatter:

```md
---
'@embedpdf/example': minor
---

Add a user-facing description of the released behavior.
```

- Never put multiple packages in one changeset file.
- Keep one PR changeset per directly affected package. If the PR already has a
  changeset for that package, update it instead of adding a duplicate.
- Split an existing combined changeset into one file per package, preserving and
  tailoring the release note for each package.
- Use `minor` for backward-compatible public features or API additions, `patch`
  for fixes and internal adaptations, and `major` only for deliberate breaking
  releases under the repository's prerelease policy.
- Describe shipped behavior for package users. Do not mention internal plans,
  workstreams, phases, or tracking codes.

## Verify coverage

Before finishing:

1. Map every directly changed publishable package to exactly one PR changeset,
   or record the concrete reason it does not require one.
2. Parse every PR changeset and confirm its frontmatter has exactly one package
   key, that the package exists, and that no package appears in two PR files.
3. Confirm each bump level matches the package-level diff and each note is
   package-specific, user-facing, and free of internal plan references.
4. Format the changed changeset files with the repository formatter.
5. Run `pnpm changeset status --since=origin/<base-branch>` once the files are
   visible to Git. When they are intentionally untracked, use an isolated
   temporary index rather than altering the user's staging area.
6. Run `git diff --check` and report the final package-to-file mapping plus any
   packages intentionally skipped.

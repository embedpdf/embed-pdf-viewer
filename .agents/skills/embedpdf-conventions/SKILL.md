---
name: embedpdf-conventions
description: Apply EmbedPDF repository architecture and implementation conventions. Use when adding or changing plugins, permissions, package names, viewer entry points, engine services, CloudPDF server adapters or migrations, PDFium runtime concurrency or isolation, or documentation architecture.
---

# EmbedPDF conventions

The conventions live in [`docs/conventions/`](../../../docs/conventions/README.md),
the same text human contributors read. This skill routes each change to the
documents that own it. Read each relevant document completely before editing;
do not load unrelated ones.

## Routing

| When the change…                                                                                                | Read                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| touches anything in the client stack (start here)                                                               | [README.md](../../../docs/conventions/README.md), [architecture.md](../../../docs/conventions/architecture.md) |
| adds or reshapes a plugin: files, manifest, controller, `connect`, contracts, dependencies, lifetime, errors    | [plugins.md](../../../docs/conventions/plugins.md)                                                             |
| adds or changes plugin state, a mirror or page mirror, an overlay, a reaction, or how engine data stays in sync | [state-and-sync.md](../../../docs/conventions/state-and-sync.md)                                               |
| adds, renames or re-routes a capability event, or uses `ChangeOrigin`                                           | [events.md](../../../docs/conventions/events.md)                                                               |
| adds or changes tests, fakes or engine conformance suites                                                       | [testing.md](../../../docs/conventions/testing.md)                                                             |
| names anything: identifiers, types, capability members, files                                                   | [naming.md](../../../docs/conventions/naming.md)                                                               |
| writes or edits comments or TSDoc                                                                               | [comments.md](../../../docs/conventions/comments.md)                                                           |
| makes an API authorization-aware: `can*` twins, gates, truthful UI                                              | [permissions.md](../../../docs/conventions/permissions.md)                                                     |
| adds, moves or renames a package                                                                                | [packages.md](../../../docs/conventions/packages.md)                                                           |
| touches the built-in, CloudPDF, CDN or framework viewer entry points                                            | [viewer-doors.md](../../../docs/conventions/viewer-doors.md)                                                   |
| changes `@embedpdf/engine-services`                                                                             | [engine-services.md](../../../docs/conventions/engine-services.md)                                             |
| changes PDFium thread ownership, TLS globals, pool sizing or concurrency gates                                  | [runtime-confinement.md](../../../docs/conventions/runtime-confinement.md)                                     |
| changes supervised engine processes, credential exposure, crash recovery or threat boundaries                   | [engine-host-isolation.md](../../../docs/conventions/engine-host-isolation.md)                                 |
| adds or changes a CloudPDF server adapter family                                                                | [server-adapters.md](../../../docs/conventions/server-adapters.md)                                             |
| adds a database migration or touches rollback                                                                   | [server-migrations.md](../../../docs/conventions/server-migrations.md)                                         |
| changes documentation structure or per-framework rendering                                                      | [docs-architecture.md](../../../docs/conventions/docs-architecture.md)                                         |

Package build and export rules remain in
[`tooling/build/README.md`](../../../tooling/build/README.md). Licensing,
security reporting and contribution policy remain in the repository root.

## Workflow

1. Classify the change by boundary and read the owning documents above.
2. Inspect adjacent implementations and tests; the document is the law, while
   nearby code shows the current concrete pattern.
3. Preserve one owner for every policy or state transition. Do not duplicate
   business rules across framework adapters, viewer doors or server adapters.
4. Add or update invariant tests at the narrowest owning layer.
5. Update the owning document when the convention itself changes. Update this
   routing table only when a document is added, removed, split or renamed.

When two documents apply, satisfy both. A permission-aware plugin follows
both `plugins.md` and `permissions.md`; engine-host mode still obeys the
PDFium ownership rules in `runtime-confinement.md`.

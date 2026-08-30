---
name: embedpdf-conventions
description: Apply EmbedPDF repository architecture and implementation conventions. Use when adding or changing plugins, permissions, package names, viewer entry points, engine services, CloudPDF server adapters or migrations, PDFium runtime concurrency or isolation, or documentation architecture.
---

# EmbedPDF conventions

Use the convention that owns the changed boundary. Load each relevant reference
completely before editing; do not load unrelated references.

## Reference routing

- Authorization-aware plugin APIs, capability twins, enforcement, and truthful
  UI: [permissions.md](references/permissions.md)
- Plugin directory shape and responsibility boundaries:
  [plugins.md](references/plugins.md)
- Package location and npm naming: [naming.md](references/naming.md)
- Built-in, CloudPDF, CDN, and framework viewer entry points:
  [viewer-doors.md](references/viewer-doors.md)
- Runtime-agnostic engine-service organization:
  [engine-services.md](references/engine-services.md)
- CloudPDF server adapter families: [server-adapters.md](references/server-adapters.md)
- Forward and rollback database migrations:
  [server-migrations.md](references/server-migrations.md)
- PDFium thread ownership, TLS globals, pool sizing, and concurrency gates:
  [runtime-confinement.md](references/runtime-confinement.md)
- Supervised engine processes, credential exposure, crash recovery, and threat
  boundaries: [engine-host-isolation.md](references/engine-host-isolation.md)
- Shared documentation structure and per-framework rendering:
  [docs-architecture.md](references/docs-architecture.md)

Package build and export rules remain in
[`tooling/build/README.md`](../../../tooling/build/README.md). Licensing,
security reporting, and contribution policy remain in the repository root.

## Workflow

1. Classify the change by boundary and read the owning references above.
2. Inspect adjacent implementations and tests; the reference is the law, while
   nearby code shows the current concrete pattern.
3. Preserve one owner for every policy or state transition. Do not duplicate
   business rules across framework adapters, viewer doors, or server adapters.
4. Add or update invariant tests at the narrowest owning layer.
5. Update the owning reference when the convention itself changes. Update this
   routing table only when a convention is added, removed, split, or renamed.

When two references apply, satisfy both. For example, a permission-aware plugin
must follow both `plugins.md` and `permissions.md`; engine-host mode still obeys
the PDFium ownership rules in `runtime-confinement.md`.

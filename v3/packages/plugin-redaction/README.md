# @embedpdf-x/plugin-redaction

Redaction for EmbedPDF v3 — mark content for removal, review the pending
marks, then destroy the content permanently.

Redaction is a **two-stage** workflow (ISO 32000-2):

1. **Marking** is non-destructive and lives on the annotation plane. A
   redaction mark is a real `redact` annotation: it renders, selects,
   syncs, and deletes like any other annotation, and nothing is removed
   yet. You don't need this plugin to mark — the `redact` tool ships with
   `@embedpdf-x/plugin-annotation`.
2. **Applying** is destructive and is what this plugin wraps: the content
   under every marked region is permanently removed, the configured
   overlay (fill + label) is painted in its place, and the consumed marks
   — plus any annotation intersecting the region — are deleted. **There
   is no undo.**

> **Trust boundary.** On a layered/cloud document, applying rewrites the
> current layer's bytes. The immutable base document keeps the original
> content — redacted content is truly unrecoverable only in what leaves
> the system (a layer download/export, or a local document saved after
> apply). Word any "permanently removed" UI accordingly.

## Setup

```tsx
import { annotationPlugin } from '@embedpdf-x/react/annotation';
import { redactionPlugin } from '@embedpdf-x/react/redaction';

const plugins = [
  // ...stage, interaction, selection...
  annotationPlugin(), // required: owns the marks
  redactionPlugin(), // the destructive apply + pending queue view
];
```

Requires `plugin-annotation`. With `plugin-selection` and
`plugin-interaction` present (the usual viewer setup), the marking tool
and `queueCurrentSelection()` light up too.

## Marking

The `redact` tool is a **composed** tool: with it active, dragging over
text marks the selected text (per-line quads, like a highlight), and
dragging anywhere else marks a rectangular area. One tool, both modes.

```ts
const redaction = useCapability(RedactionToken);

redaction.toggleRedact(); // toggle the redact tool
redaction.isRedactActive();

// Mark the current text selection without switching tools
// (context-menu "Mark for Redaction"):
await redaction.queueCurrentSelection();
```

Marks carry their appearance: `color` (marking outline), `interiorColor`
(the fill painted on apply), and an optional label (`/OverlayText`)
styled by `fontFamily`/`fontSize`/`fontColor`/`textAlign` with
`repeat` tiling it across the region. Style props flow through the
normal annotation style panel; the label text itself:

```ts
redaction.setLabel(id, { overlayText: 'REDACTED', repeat: true });
```

## The pending queue

Pending marks are **not plugin state** — they are a live view over the
annotation plane (`subtype === 'redact'`). Deleting a mark is just
deleting an annotation.

```ts
redaction.getPending(); // RedactionPendingItem[] — id, ref, page, kind: 'area' | 'text', label
redaction.pendingCount();
redaction.estimateCollateral(); // client-side count of OTHER annotations
// the pending marks would destroy — show
// this in your confirm dialog BEFORE applying
```

## Applying

```ts
// Everything pending:
const result = await redaction.applyAll();

// Or specific marks:
const result = await redaction.apply([id1, id2]);

result.removedAnnotationCount; // authoritative collateral count
result.results; // per-page applied/unchanged/failed/skipped

redaction.onApplied((result) => {
  /* toast, audit, ... */
});
```

`apply` resolves after the engine confirms. Affected pages re-rasterize
(content-scope invalidation) and their annotation lists reload
automatically — including when a **collaborator** applies on a shared
document. On a document whose token lacks the `doc.redact` capability,
`canApply()` is false and `apply` rejects.

```ts
redaction.canApply(); // engine service present AND doc.redact granted
redaction.isApplying(); // in-flight state for spinners
```

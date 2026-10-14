# @embedpdf/plugin-redaction

Redaction for EmbedPDF — mark content for removal, review the pending
marks, then destroy the content permanently.

Redaction is a **two-stage** workflow (ISO 32000-2):

1. **Marking** is non-destructive and lives on the annotation plane. A
   redaction mark is a real `redact` annotation: it renders, selects,
   syncs, and deletes like any other annotation, and nothing is removed
   yet. You don't need this plugin to mark — the `redact` tool ships with
   `@embedpdf/plugin-annotation` — but it adds marking verbs for code.
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
import { annotationPlugin } from '@embedpdf/react/annotation';
import { redactionPlugin } from '@embedpdf/react/redaction';

const plugins = [
  // ...stage, interaction, selection...
  annotationPlugin(), // required: owns the marks
  redactionPlugin(), // the destructive apply + pending queue view
];
```

Requires `plugin-annotation`. With `plugin-selection` and
`plugin-interaction` present (the usual viewer setup), the marking tool
and `markSelection()` light up too; `markMatches()` needs `plugin-search`.

`redactionPlugin({ overlay })` sets what applying paints over every mark,
whichever way it was made (the `redact` tool, the selected text, or code):
`overlay.fill` is the colour painted on apply (default black) and
`overlay.text` styles the label (`color`, default white; `fontFamily`,
default Helvetica; `fontSize`, where the default 0 fits the area). The
settings become the redact tool's defaults, and `redaction.updateSettings()`
changes them for the marks made from then on.

## Marking

The `redact` tool is a **composed** tool: with it active, dragging over
text marks the selected text (per-line quads, like a highlight), and
dragging anywhere else marks a rectangular area. One tool, both modes.

```ts
import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';
import { useRedaction } from '@embedpdf/react/redaction';

const redaction = useRedaction();
const interaction = useInteraction();
const { activeToolId } = useInteractionState();

interaction.activateTool('redact'); // arm the redact tool
activeToolId === 'redact';

// Mark the current text selection without switching tools
// (context-menu "Mark for Redaction"):
const { marks } = await redaction.markSelection();

// Or mark from code (page space; a page is a ref or an index):
const { mark } = await redaction.markArea(page, { x: 72, y: 72, width: 200, height: 40 });
await redaction.markPage(0);
await redaction.markMatches({ text: 'Confidential' }); // every search hit: { marks }
```

`canMark()` is annotation create authority: a mark is an ordinary
annotation, so anyone who can annotate can propose redactions.

Marks carry their appearance: `color` (marking outline), `interiorColor`
(the fill painted on apply), and an optional label (`/OverlayText`)
styled by `fontFamily`/`fontSize`/`fontColor`/`textAlign` with
`repeat` tiling it across the region. Style props flow through the
normal annotation style panel; the label text itself:

```ts
const { mark } = await redaction.updateLabel(ref, { overlayText: 'REDACTED', repeat: true });
```

`canUnmark(ref)` and `canUpdateLabel(ref)` answer per mark, as the
annotation's own delete and update checks do.

## The pending queue

Pending marks are **not plugin state** — they are a live view over the
annotation plane (`subtype === 'redact'`). Deleting a mark is just
deleting an annotation.

```ts
redaction.listPending(); // RedactionMark[] — ref, page, pageIndex, kind: 'area' | 'text', bounds, overlayText, repeat
redaction.listPending({ page }); // one page's marks
redaction.getPending(ref); // one mark, or null
redaction.getPendingCount();
redaction.estimateCollateral(); // { count, refs }: a client-side estimate of the
// other annotations the pending marks would destroy — show
// this in your confirm dialog before applying

await redaction.unmark([ref]); // remove marks; refs that are not marks are skipped, refused ones fail
await redaction.clearPending(); // remove every mark

redaction.onPendingChanged(({ pages }) => {
  /* marks were created, changed or removed on these pages */
});
```

## Applying

```ts
// Everything in the document, including marks on pages this client never loaded:
const result = await redaction.applyAll();
// Or specific marks:        await redaction.apply([ref1, ref2]);
// Or the marks on pages:    await redaction.applyPages([page]);

result.removedAnnotationCount; // authoritative collateral count
result.results; // per-page applied/unchanged/failed/skipped

redaction.onApplied(({ result, origin }) => {
  /* toast, audit, ... */
});
```

`apply` resolves after the engine confirms. Applies run one at a time,
in call order. Affected pages re-rasterize (content-scope invalidation)
and their annotation lists reload automatically — including when a
**collaborator** applies on a shared document. On a document whose token
lacks `doc.redact` (or `doc.pages.modify` and `doc.annotate.modify`, which
apply also asserts), `canApply()` is false and `apply` rejects with
`permission-denied`; without an engine redaction service it rejects with
`unsupported`.

```ts
redaction.canApply(); // engine service present and every apply capability granted
redaction.isApplying(); // in-flight state for spinners
redaction.getLastResult(); // the last confirmed apply, from this session or another
```

In React, `useRedaction()` is the capability, `useRedactionState()` reads
`{ pendingCount, applying, lastResult }`, `usePendingRedactions(filter?)` is
the reactive pending list, `useRedactionSettings()` the settings, and
`useRedactionEvent((redaction) => redaction.onApplied, handler)` subscribes
for the mounted lifetime — all from `@embedpdf/react/redaction`.

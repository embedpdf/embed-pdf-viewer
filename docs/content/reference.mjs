/**
 * Which headless pages document which capability, for the reference check
 * (`scripts/reference.mjs`). Every public member is on exactly one page: a `## Methods`,
 * `## State` or `## Events` row.
 *
 * - `capability`: `<file under packages/>#<interface>`.
 * - `pages`: the pages that list its members. `{ page, base }` when a page's rows name a noun's
 *   members without the noun (`reply()` for `comments.reply`).
 * - `pending`: names where the docs describe the API the code is moving to, with why. A name the
 *   docs use first, or a name the code has that the docs dropped. Remove an entry when the code
 *   lands; the check says when one is no longer needed.
 */
export const REFERENCE = [
  // ── Text ──────────────────────────────────────────────────────────────────────────────
  {
    capability: 'plugin/search/src/contract.ts#SearchCapability',
    pages: ['headless/text/search.mdx'],
  },
  {
    capability: 'plugin/selection/src/contract.ts#SelectionCapability',
    pages: ['headless/text/selection.mdx'],
  },
  // ── Viewing ───────────────────────────────────────────────────────────────────────────
  {
    capability: 'plugin/stage/src/contract.ts#StageCapability',
    pages: ['headless/viewing/stage.mdx'],
  },
  {
    capability: 'plugin/render/src/contract.ts#RenderCapability',
    pages: ['headless/viewing/render.mdx'],
  },
  {
    capability: 'plugin/link/src/contract.ts#LinkCapability',
    pages: ['headless/viewing/links.mdx'],
  },
  // ── Documents ─────────────────────────────────────────────────────────────────────────
  {
    capability: 'core/main/src/types.ts#DocumentsCapability',
    pages: [
      'headless/documents/opening.mdx',
      'headless/documents/tabs.mdx',
      'headless/documents/saving.mdx',
    ],
    pending: {
      print: 'no print pipeline yet: printing is decided after phase 3 (K9)',
    },
  },
  {
    capability: 'plugin/view-manager/src/contract.ts#ViewManagerCapability',
    pages: ['headless/documents/tabs.mdx'],
  },
  // ── Documents: pages, metadata, actions ───────────────────────────────────────────────
  {
    capability: 'plugin/page-edit/src/contract.ts#PageEditCapability',
    pages: ['headless/documents/pages.mdx'],
  },
  {
    capability: 'plugin/metadata/src/contract.ts#MetadataCapability',
    pages: ['headless/documents/metadata.mdx'],
  },
  {
    capability: 'plugin/actions/src/contract.ts#ActionsCapability',
    pages: ['headless/documents/actions.mdx'],
  },
  // ── Annotations ───────────────────────────────────────────────────────────────────────
  {
    capability: 'plugin/annotation/src/contract.ts#AnnotationCapability',
    pages: [
      // The Settings table: tools, afterCreate, chrome and snap.
      'headless/annotations/index.mdx',
      'headless/annotations/with-code.mdx',
      'headless/annotations/selecting.mdx',
      'headless/annotations/tools.mdx',
      'headless/annotations/saving.mdx',
      { page: 'headless/annotations/comments.mdx', base: 'comments' },
    ],
  },
  // ── Stamps, measurements, redaction ───────────────────────────────────────────────────
  {
    capability: 'plugin/stamp/src/contract.ts#StampCapability',
    pages: ['headless/annotations/stamps.mdx'],
  },
  {
    capability: 'plugin/measurement/src/contract.ts#MeasurementCapability',
    pages: ['headless/annotations/measurements.mdx'],
  },
  {
    capability: 'plugin/redaction/src/contract.ts#RedactionCapability',
    pages: ['headless/annotations/redaction.mdx'],
  },
  // ── Forms and signatures ──────────────────────────────────────────────────────────────
  {
    capability: 'plugin/form/src/contract.ts#FormCapability',
    pages: ['headless/forms/index.mdx', 'headless/forms/building.mdx'],
  },
  {
    capability: 'plugin/signature/src/contract.ts#SignatureCapability',
    pages: ['headless/forms/signatures.mdx'],
  },
  // ── Your app's UI ─────────────────────────────────────────────────────────────────────
  {
    capability: 'plugin/interaction/src/contract.ts#InteractionCapability',
    pages: ['headless/ui/tools.mdx'],
  },
  {
    capability: 'plugin/commands/src/contract.ts#CommandsCapability',
    pages: ['headless/ui/commands.mdx'],
  },
  {
    capability: 'plugin/shell/src/contract.ts#ShellCapability',
    pages: ['headless/ui/panels.mdx'],
  },
  {
    capability: 'plugin/i18n/src/contract.ts#I18nCapability',
    pages: ['headless/ui/translations.mdx'],
  },
];

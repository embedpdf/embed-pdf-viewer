import { caps, checkCapability, checkCollab, type PdfBits } from '@embedpdf/engine-core';

import type { ShareIdentity } from '../api/types';

/**
 * Human labels for the scope vocabulary, and the capability preview.
 *
 * The rule this file exists to keep: THIS DEMO OWNS LABELS, THE ENGINE OWNS
 * SEMANTICS. Every ✓/✗ below comes from `checkCapability` / `checkCollab` —
 * the same predicates the engine gates with — so the dialog cannot promise
 * something the token won't do. A hand-maintained "role → what you can do"
 * table would drift from the engine the first time the scope rules move, and
 * in a demo whose whole job is teaching the permission model, that drift is
 * the worst possible bug.
 */

/**
 * PDF bits assumed for the LOCAL preview.
 *
 * `pdf.permissions` means "inherit whatever this PDF's own bits allow", which
 * can only be resolved against the document — server-side, at `/v1/access`.
 * The preview assumes a permissive document and says so next to that scope;
 * the Access rail shows the server's canonical `effectiveScope` once the share
 * exists, which is the authoritative answer.
 */
const ASSUMED_BITS: PdfBits = {
  bit3: true,
  bit4: true,
  bit5: true,
  bit6: true,
  bit9: true,
  bit10: true,
  bit11: true,
  bit12: true,
};

export interface ScopeOption {
  scope: string;
  label: string;
  hint?: string;
}

export interface ScopeGroup {
  title: string;
  options: ScopeOption[];
}

/**
 * The individually-toggleable scopes, grouped by what they're about. Collab
 * grants are deliberately absent — they're parametric (`:self`, `:group=X`),
 * so they come from a role or the free-form field, never a checkbox.
 */
export const SCOPE_GROUPS: ScopeGroup[] = [
  {
    title: 'Read',
    options: [
      { scope: caps.doc.open(), label: 'Open document', hint: 'Session, manifest, access' },
      { scope: caps.doc.render(), label: 'Render pages' },
    ],
  },
  {
    title: 'Text',
    options: [
      { scope: caps.doc.text.select(), label: 'Select text', hint: 'Page geometry' },
      { scope: caps.doc.text.copy(), label: 'Copy text' },
      { scope: caps.doc.text.search(), label: 'Search text' },
    ],
  },
  {
    title: 'Annotations',
    options: [
      { scope: caps.doc.annotate.read(), label: 'Read comments' },
      {
        scope: caps.doc.annotate.modify(),
        label: 'Edit any comment',
        hint: 'Broad write; collab grants narrow it per row',
      },
    ],
  },
  {
    title: 'Forms',
    options: [
      { scope: caps.doc.forms.read(), label: 'Read fields' },
      { scope: caps.doc.forms.fill(), label: 'Fill fields' },
      { scope: caps.doc.forms.modify(), label: 'Create / delete fields' },
    ],
  },
  {
    title: 'Document',
    options: [
      { scope: caps.doc.pages.assemble(), label: 'Reorder / rotate pages' },
      { scope: caps.doc.pages.modify(), label: 'Modify page content' },
      { scope: caps.doc.redact(), label: 'Apply redaction', hint: 'Destructive' },
      { scope: caps.doc.metadata.modify(), label: 'Edit metadata' },
      { scope: caps.doc.attachments.modify(), label: 'Manage attachments' },
    ],
  },
  {
    title: 'Output',
    options: [
      { scope: caps.doc.download(), label: 'Download original' },
      { scope: caps.doc.download.flattened(), label: 'Download flattened' },
      { scope: caps.doc.print(), label: 'Print' },
      { scope: caps.doc.print.high(), label: 'Print (high quality)' },
    ],
  },
  {
    title: 'Special',
    options: [
      {
        scope: 'pdf.permissions',
        label: "Inherit the PDF's own permissions",
        hint: 'Resolved against the document server-side',
      },
      { scope: '*', label: 'Everything (admin wildcard)', hint: 'Bypasses every check below' },
    ],
  },
];

export interface PreviewRow {
  label: string;
  granted: boolean;
  /** Qualification for collab-narrowed authority: "own comments only". */
  note?: string;
}

/**
 * Probe targets. Collab authority is per-ROW, so the only way to describe it
 * is to ask the engine about specific rows: one owned by this person, one by a
 * teammate (same group, different person), one by a stranger. Without the
 * teammate probe a "group editor" is indistinguishable from a "reviewer" —
 * both can only edit rows that aren't the stranger's.
 */
const STRANGER = { userId: '__someone-else__', groupId: '__another-group__' };

/**
 * What this scope set actually permits, computed with the engine's resolver.
 *
 * Annotation rows go through `checkCollab` rather than capability membership:
 * a Reviewer holds no `doc.annotate.modify` at all — their authority is the
 * collab grants — so asking "is the capability present" would report a
 * commenting role as unable to comment. Asking the collab predicate twice
 * (own row vs a stranger's row) is what produces "own comments only" without
 * this file re-deriving a single rule.
 */
export function previewCapabilities(
  scopes: readonly string[],
  identity: ShareIdentity,
): PreviewRow[] {
  const claims = identity as Parameters<typeof checkCollab>[3];
  const can = (capability: Parameters<typeof checkCapability>[0]) =>
    checkCapability(capability, scopes, ASSUMED_BITS);
  const collabCan = (
    action: Parameters<typeof checkCollab>[0],
    target: { userId?: string; groupId?: string },
  ) => checkCollab(action, target, scopes, claims, ASSUMED_BITS);

  const ownTarget = {
    ...(identity.user_id ? { userId: identity.user_id } : {}),
    ...(identity.group_id ? { groupId: identity.group_id } : {}),
  };
  const teammate = {
    userId: '__teammate__',
    ...(identity.group_id ? { groupId: identity.group_id } : {}),
  };
  const createsOwn = collabCan('create', ownTarget);
  const editsOwn = collabCan('update', ownTarget);
  const editsTeammate = collabCan('update', teammate);
  const editsAnyone = collabCan('update', STRANGER);

  return [
    { label: 'Open and read', granted: can('doc.open') && can('doc.render') },
    { label: 'Select and copy text', granted: can('doc.text.copy') },
    { label: 'See comments', granted: can('doc.annotate.read') },
    { label: 'Add comments', granted: createsOwn },
    { label: 'Edit their own comments', granted: editsOwn },
    {
      label: "Edit other people's comments",
      granted: editsTeammate || editsAnyone,
      ...(editsTeammate && !editsAnyone && identity.group_id
        ? { note: `group “${identity.group_id}” only` }
        : {}),
    },
    { label: 'See form fields', granted: can('doc.forms.read') },
    { label: 'Fill form fields', granted: can('doc.forms.fill') },
    { label: 'Reorder pages', granted: can('doc.pages.assemble') },
    { label: 'Apply redaction', granted: can('doc.redact') },
    { label: 'Edit metadata', granted: can('doc.metadata.modify') },
    { label: 'Download', granted: can('doc.download') },
  ];
}

/** Split a free-form textarea into scope strings (one per line or comma). */
export function parseScopeList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The collab (parametric) subset of a scope array — what the textarea owns. */
export function collabScopesOf(scopes: readonly string[]): string[] {
  return scopes.filter((s) => s.includes(':'));
}

/** The plain capability subset — what the checkbox grid owns. */
export function capabilityScopesOf(scopes: readonly string[]): string[] {
  return scopes.filter((s) => !s.includes(':'));
}

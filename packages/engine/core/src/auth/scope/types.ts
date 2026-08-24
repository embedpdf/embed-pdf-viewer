/**
 * Closed enum of capability scopes. Any scope string not in this set (and
 * not a wildcard, virtual, or collab scope) is rejected at parse time.
 *
 * Bit references in comments are documentation of how `pdf.permissions`
 * expands these capabilities. PDF bits are NEVER consulted unless
 * `pdf.permissions` is in scope.
 */
export type DocCapability =
  // Session establishment (cloud-only — no PDF bit)
  | 'doc.open' // /head, /manifest, /access
  | 'doc.render' // /pages/*/render

  // Text/content extraction (PDF bit 5)
  | 'doc.text.select' // /pages/*/geometry
  | 'doc.text.copy' // /pages/*/text
  | 'doc.text.search' // reserved for future /pages/*/search@*
  | 'doc.content.copy' // graphics/image extraction (reserved)

  // Output (cloud-only download capabilities)
  | 'doc.download'
  | 'doc.download.flattened'

  // Print (PDF bit 3 / bit 12)
  | 'doc.print'
  | 'doc.print.high'

  // Page-level mutation (PDF bit 4 / bit 11)
  | 'doc.pages.modify'
  | 'doc.pages.assemble'

  // Forms
  | 'doc.forms.read' // structured read of form field definitions/values (cloud-only; no PDF-bit gate — reading is unconditional)
  | 'doc.forms.fill' // set form field values (PDF bit 9, also implied by bit 6)
  | 'doc.forms.modify' // create/restructure/delete fields (PDF bit 6 + bit 4)

  // Annotations
  | 'doc.annotate.read' // structured read of annotation lists (cloud-only; no PDF-bit gate — reading is unconditional)
  | 'doc.annotate.modify' // broad write default for create/update/delete (PDF bit 6); narrowed per-action by collab scopes when present

  // Metadata (Info-dict writes, PDF bit 4)
  | 'doc.metadata.modify' // rewrite document metadata / Info dict (PDF bit 4)

  // Attachments (document-level embedded files, PDF bit 4)
  | 'doc.attachments.modify' // add/remove /EmbeddedFiles entries (PDF bit 4)

  // Redaction apply (destructive content modification, PDF bit 4)
  | 'doc.redact';

/**
 * Single-entity collaboration vocabulary. Only annotations are
 * collab-scoped today; future entities slot into the same grammar.
 */
export type CollabEntity = 'annotations';

/**
 * Collab actions for annotations. Each can be qualified by a filter that
 * narrows authority per-row.
 *
 * On `create`, the target evaluated against the filter is built from the
 * caller's JWT identity (no impersonation surface). So `:self` and `:all`
 * trivially pass; `:group=X` is the meaningful one — it constrains
 * creation to callers whose default group is X.
 *
 * On `update` / `delete`, the target is the existing row's owner.
 *
 * On `set-group`, the filter is an assignment-authority check against
 * the destination group, not the row.
 */
export type CollabAction = 'create' | 'update' | 'delete' | 'set-group';

export type CollabFilter =
  | { kind: 'all' }
  | { kind: 'self' }
  | { kind: 'createdBy'; userId: string }
  | { kind: 'group'; groupId: string };

export interface ParsedCapability {
  kind: 'capability';
  name: DocCapability;
}

export interface ParsedCollab {
  kind: 'collab';
  entity: CollabEntity;
  action: CollabAction | '*';
  filter: CollabFilter;
}

export interface ParsedVirtual {
  kind: 'virtual';
  name: 'pdf.permissions';
}

export interface ParsedWildcard {
  kind: 'wildcard';
}

export type ParsedScope = ParsedCapability | ParsedCollab | ParsedVirtual | ParsedWildcard;

/**
 * Typed boolean view of the PDF user-access permission word.
 *
 * Names mirror ISO 32000 bit positions (bit3 = print, bit4 = modify, etc.).
 * Use {@link DecodePdfBits} (in pdf-bits.ts) to build this from the integer
 * stored in the documents row.
 */
export interface PdfBits {
  bit3: boolean; // print
  bit4: boolean; // modify
  bit5: boolean; // copy/extract
  bit6: boolean; // annotate + fill forms
  bit9: boolean; // fill existing forms
  bit10: boolean; // accessibility (deprecated in PDF 2.0)
  bit11: boolean; // assemble
  bit12: boolean; // high-quality print
}

/**
 * Identity claims associated with a JWT (cloud) or supplied at engine
 * open time (local). Used by collab filter resolution and by annotation
 * authoring (populating /T and /EMBD_Metadata fields).
 */
export interface IdentityClaims {
  user_id?: string;
  group_id?: string;
  groups?: ReadonlyArray<string>;
  display_name?: string;
}

/**
 * Subset of identity claims that flows into worker requests so the
 * annotation pipeline can stamp /T, /M, and /EMBD_Metadata on writes.
 *
 * Field names follow PDF/EMBD conventions (UserID, GroupID) rather than
 * the JWT-style snake_case used by IdentityClaims.
 */
export interface AnnotationActor {
  userId?: string;
  groupId?: string;
  displayName?: string;
}

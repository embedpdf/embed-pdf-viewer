import type { PdfDestination } from './PdfDestination';

/** Normalized values of an action dictionary's `/S` name. */
export type PdfActionType = PdfActionNode['type'];

/**
 * One Hide `/T` or ResetForm `/Fields` entry. Deliberately UNSCOPED: a
 * dictionary reference carries no page, so resolution (a name to widgets, an
 * object number to an annotation or field) is the interpreter's job — never
 * the extractor's.
 */
export type PdfActionTargetRef =
  | { kind: 'name'; name: string }
  | { kind: 'objectNumber'; objectNumber: number };

/**
 * Decoded SubmitForm `/Flags` word (ISO 32000-2:2020 Table 240) plus the raw
 * value. `exclude` is DERIVED from bit 1 — never stored separately, so the
 * two cannot disagree. Note the two easily-missed positions verified against
 * the spec: bit 12 is `ExclFKey` (not "ExclFDFTemplate") and bit 13 is
 * reserved/undefined, so `EmbedForm` is bit 14.
 */
export interface SubmitFormFlags {
  raw: number;
  /** Bit 1: set → `fields` lists EXCLUDED fields. */
  exclude: boolean;
  /** Bit 2: submit designated valueless fields too, as name-only entries. */
  includeNoValueFields: boolean;
  /** Bits 3/6/9 folded into one verdict: bit 9 SubmitPDF dominates ("all
   *  other flags shall be ignored except GetMethod"), else bit 6 XFDF, else
   *  bit 3 HTML Form format, else FDF (the Table 240 default). */
  format: 'fdf' | 'html' | 'xfdf' | 'pdf';
  /** Bit 4. ISO makes GetMethod meaningful only with ExportFormat set, and
   *  the bit-9 rule keeps it alive for SubmitPDF — so `'get'` only for
   *  `'html'` and `'pdf'`; everything else posts. */
  method: 'post' | 'get';
  /** Bit 5 (meaningful only with ExportFormat; passed through — this stack
   *  does not capture click coordinates). */
  submitCoordinates: boolean;
  /** Bit 7 (FDF only): include incremental updates via FDF `Differences`. */
  includeAppendSaves: boolean;
  /** Bit 8 (FDF only): include markup annotations. */
  includeAnnotations: boolean;
  /** Bit 10: convert date-like values to the standard date format. */
  canonicalFormat: boolean;
  /** Bit 11 (FDF, with IncludeAnnotations): only the current user's
   *  annotations. */
  exclNonUserAnnots: boolean;
  /** Bit 12: the submitted FDF excludes its `F` entry. */
  exclFKey: boolean;
  /** Bit 14 (bit 13 is reserved): the FDF `F` entry embeds the source PDF. */
  embedForm: boolean;
}

/**
 * The one Table-240 decode, shared by the reader, the schema's producers,
 * and tests — so bit semantics cannot fork.
 */
export const decodeSubmitFormFlags = (raw: number): SubmitFormFlags => {
  const bit = (n: number): boolean => (raw & (1 << (n - 1))) !== 0;
  const format = bit(9) ? 'pdf' : bit(6) ? 'xfdf' : bit(3) ? 'html' : 'fdf';
  return {
    raw,
    exclude: bit(1),
    includeNoValueFields: bit(2),
    format,
    method: bit(4) && (format === 'html' || format === 'pdf') ? 'get' : 'post',
    submitCoordinates: bit(5),
    includeAppendSaves: bit(7),
    includeAnnotations: bit(8),
    canonicalFormat: bit(10),
    exclNonUserAnnots: bit(11),
    exclFKey: bit(12),
    embedForm: bit(14),
  };
};

/**
 * SubmitForm's extracted intent. ATOMIC on purpose: either every required
 * component resolved (a complete, executable payload) or the node carries no
 * payload at all — partial states are unrepresentable. An unreadable
 * REQUIRED component (`/F`) degrades the whole node to `unknown` +
 * `payload-dropped` at read time instead.
 */
export interface SubmitFormPayload {
  /** Resolved `/F` URL — a `<< /FS /URL >>` file specification (7.11.5,
   *  `/UF` preferred over `/F` per 7.11.2); a bare string `/F` is accepted
   *  as a producer-compat extension. */
  url: string;
  /**
   * `null` = `/Fields` ABSENT → Include/Exclude is ignored and every field
   * except NoExport-flagged ones is submitted (Table 239). `[]` =
   * present-but-empty: include mode submits NOTHING, exclude mode submits
   * everything eligible — presence and emptiness are different states.
   */
  fields: PdfActionTargetRef[] | null;
  flags: SubmitFormFlags;
  /** `/CharSet` (PDF 2.0), extracted but not encoded by this stack. */
  charSet?: string;
}

interface PdfActionNodeCommon {
  /** Raw `/S` name, retained for unknown and future action types. */
  subtype: string;
  /** Normalized `/Next` children in PDF order. */
  next: PdfActionNode[];
}

/**
 * One detached node in a normalized PDF action tree, discriminated on the
 * interpreter that would execute it. Every executable arm carries its full
 * payload — a `goto` without a destination or a `uri` without a URI is
 * unrepresentable. A payload the reader cannot materialize degrades the node
 * to `unknown` (original `/S` kept on `subtype`) and appends the tree-level
 * `'payload-dropped'` warning.
 */
export type PdfActionNode = PdfActionNodeCommon &
  (
    | { type: 'javascript'; script: string }
    | { type: 'goto'; destination: PdfDestination }
    | { type: 'uri'; uri: string; isMap: boolean }
    | { type: 'named'; name: string }
    | { type: 'hide'; targets: PdfActionTargetRef[]; hide: boolean }
    | {
        type: 'reset-form';
        /**
         * `null` = `/Fields` ABSENT → reset every field (`exclude` is
         * meaningless). `[]` = present-but-empty: with `exclude` false reset
         * NOTHING, with `exclude` true reset EVERYTHING — PDFium's executor
         * branches on presence first.
         */
        fields: PdfActionTargetRef[] | null;
        exclude: boolean;
      }
    /** Reported, never executed. */
    | { type: 'goto-remote'; filePath: string }
    | { type: 'goto-embedded'; filePath: string }
    | { type: 'launch'; filePath: string }
    /** ISO allows `/Rendition` to carry `/JS`; preserved, not collected. */
    | { type: 'rendition'; script?: string }
    /** Recognized; executable only when `payload` is present. Absent payload
     *  = extracted by an older runtime (skew) — the node stays
     *  recognized-inert exactly as before this payload existed. */
    | { type: 'submit-form'; payload?: SubmitFormPayload }
    | { type: 'thread' }
    | { type: 'sound' }
    | { type: 'movie' }
    | { type: 'import-data' }
    | { type: 'set-ocg-state' }
    | { type: 'transition' }
    | { type: 'goto-3d-view' }
    | { type: 'unknown' }
  );

export type PdfActionWarning =
  | 'cycle-dropped'
  | 'malformed-next'
  | 'incomplete'
  /** A node's payload could not be read; that node degraded to `unknown`. */
  | 'payload-dropped';

/**
 * One extracted action root plus the native reader's safety verdict.
 * Consumers must never execute a tree whose `incomplete` flag is true.
 */
export interface PdfActionTree {
  /** Null when the model was valid but its root exceeded a safety bound. */
  root: PdfActionNode | null;
  incomplete: boolean;
  /** Raw native bits, retained so newer warnings survive older SDKs.
   *  TS-detected warnings (`payload-dropped`) appear only in `warnings`. */
  warningFlags: number;
  warnings: PdfActionWarning[];
}

export interface PdfFieldActions {
  keystroke?: PdfActionTree;
  format?: PdfActionTree;
  validate?: PdfActionTree;
  calculate?: PdfActionTree;
}

export interface PdfPageActions {
  open?: PdfActionTree;
  close?: PdfActionTree;
}

export interface PdfAnnotationActions {
  activate?: PdfActionTree;
  cursorEnter?: PdfActionTree;
  cursorExit?: PdfActionTree;
  mouseDown?: PdfActionTree;
  mouseUp?: PdfActionTree;
  focus?: PdfActionTree;
  blur?: PdfActionTree;
  pageOpen?: PdfActionTree;
  pageClose?: PdfActionTree;
  pageVisible?: PdfActionTree;
  pageInvisible?: PdfActionTree;
}

export interface NamedJavaScriptAction {
  /** Name-tree key. Array order is the PDF boot order. */
  name: string;
  action: PdfActionTree;
}

/** Catalog-owned actions. Page actions stay on their owning PageLayout. */
export interface DocumentActionsSnapshot {
  nameTreeScripts: NamedJavaScriptAction[];
  /** Action-form `/OpenAction`. Mutually exclusive with `openDestination` —
   *  `/OpenAction` is one entry, a dictionary or an array. */
  openAction: PdfActionTree | null;
  /** Destination-form `/OpenAction` — the initial view, not an action.
   *  Optional on the wire for skew tolerance (absent ≡ null); the schema
   *  defaults it, so parsed snapshots always carry the key. */
  openDestination?: PdfDestination | null;
  willClose?: PdfActionTree;
  willSave?: PdfActionTree;
  didSave?: PdfActionTree;
  willPrint?: PdfActionTree;
  didPrint?: PdfActionTree;
}

/**
 * Aggregate guard applied across every action model read by one job. Native
 * limits are per model; this prevents a document containing many models from
 * creating an unbounded detached snapshot.
 */
export interface ActionReadBudget {
  maxModels: number;
  maxNodes: number;
  maxScriptCodeUnits: number;
  /** Hide `/T` + ResetForm/SubmitForm `/Fields` entries, aggregate across
   *  the job. */
  maxTargetEntries: number;
  /** Payload string code units (URIs, submit URLs/CharSets, names, file
   *  paths, name-tree script names), aggregate across the job. Reserved
   *  BEFORE allocation. */
  maxPayloadCodeUnits: number;
}

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
    /** Recognized-inert: no payload in this phase. */
    | { type: 'submit-form' }
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
  /** Hide `/T` + ResetForm `/Fields` entries, aggregate across the job. */
  maxTargetEntries: number;
  /** Payload string code units (URIs, names, file paths, name-tree script
   *  names), aggregate across the job. Reserved BEFORE allocation. */
  maxPayloadCodeUnits: number;
}

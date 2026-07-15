/** Normalized values of an action dictionary's `/S` name. */
export type PdfActionType =
  | 'unknown'
  | 'goto'
  | 'goto-remote'
  | 'goto-embedded'
  | 'launch'
  | 'thread'
  | 'uri'
  | 'sound'
  | 'movie'
  | 'hide'
  | 'named'
  | 'submit-form'
  | 'reset-form'
  | 'import-data'
  | 'javascript'
  | 'set-ocg-state'
  | 'rendition'
  | 'transition'
  | 'goto-3d-view';

/** One detached node in a normalized PDF action tree. */
export interface PdfActionNode {
  type: PdfActionType;
  /** Raw `/S` name, retained for unknown and future action types. */
  subtype: string;
  /** Decoded `/JS` source for JavaScript and Rendition actions. */
  script?: string;
  /** Normalized `/Next` children in PDF order. */
  next: PdfActionNode[];
}

export type PdfActionWarning = 'cycle-dropped' | 'malformed-next' | 'incomplete';

/**
 * One extracted action root plus the native reader's safety verdict.
 * Consumers must never execute a tree whose `incomplete` flag is true.
 */
export interface PdfActionTree {
  /** Null when the model was valid but its root exceeded a safety bound. */
  root: PdfActionNode | null;
  incomplete: boolean;
  /** Raw native bits, retained so newer warnings survive older SDKs. */
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
  /** Action-form `/OpenAction`; a destination-form value reads as null. */
  openAction: PdfActionTree | null;
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
}

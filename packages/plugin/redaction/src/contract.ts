/**
 * @embedpdf/plugin-redaction/contract: the public redaction vocabulary.
 * Marking is annotation authoring (a mark is a `redact` annotation); applying
 * is the destructive document mutation. The plugin owns no mark state: the
 * pending view is a live projection of the annotation plane.
 */
import type {
  BatchResult,
  DeepPartial,
  EventHook,
  EventOrigin,
  OperationOptions,
  SettingsApi,
} from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type {
  AnnotationRef,
  FreeTextFont,
  PageRef,
  RedactionApplyResult,
  SearchQuery,
} from '@embedpdf/engine-core';

export { RedactionToken } from './token';
export type { RedactionApplyResult } from '@embedpdf/engine-core';

/**
 * The redaction plugin's settings. `redactionPlugin(config)` registers them
 * over {@link REDACTION_DEFAULTS}, and `updateSettings()` changes them for
 * every document while the app runs. They are PDF colors and fonts, written
 * into each mark, so CSS doesn't reach them.
 */
export interface RedactionSettings {
  /**
   * What applying paints over every mark, whichever way it was made: the
   * `redact` tool, the selected text, or code. They are the redact tool's
   * defaults from then on; a style panel can still change one mark.
   */
  readonly overlay: {
    /** The color of a redacted area. */
    readonly fill: string;
    readonly text: {
      /** The color of a label. */
      readonly color: string;
      /** The label's font: a standard font or a registered one. */
      readonly fontFamily: FreeTextFont;
      /** The label's size in points; `0` fits it to the area. */
      readonly fontSize: number;
    };
  };
}

/** What the redaction settings are when the app registers none. */
export const REDACTION_DEFAULTS: RedactionSettings = {
  overlay: {
    fill: '#000000',
    text: { color: '#ffffff', fontFamily: 'helvetica', fontSize: 0 },
  },
};

/** What `redactionPlugin(config)` takes: any of the settings, merged over the defaults. */
export type RedactionConfig = DeepPartial<RedactionSettings>;

/**
 * One pending redaction mark — a live projection of a `redact` annotation on
 * the annotation plane (delete the annotation and the mark is gone).
 */
export interface RedactionMark {
  readonly ref: AnnotationRef;
  readonly page: PageRef;
  /** Display index (0-based) from the page registry — for "page N" labels. */
  readonly pageIndex: number;
  /** `area` = rect-only mark (marquee); `text` = per-line quads (selection). */
  readonly kind: 'area' | 'text';
  /** Page-space bounds of the region. */
  readonly bounds: Rect;
  /** `/OverlayText` label, when set. */
  readonly overlayText: string | null;
  /** Whether the label fills the area over and over, or shows once. */
  readonly repeat: boolean;
}

export interface RedactionMarkFilter {
  /** One page's marks: its ref or its index. */
  readonly page?: PageRef | number;
}

/** A label edit: `overlayText: null` clears it; `repeat` tiles it. */
export interface RedactionLabelPatch {
  overlayText?: string | null;
  repeat?: boolean;
}

/** Which other annotations an apply would destroy (a client-side estimate; the result is authoritative). */
export interface RedactionCollateral {
  readonly count: number;
  readonly refs: readonly AnnotationRef[];
}

// ── events ──
/** A confirmed apply, from this session or another. */
export interface RedactionAppliedEvent {
  readonly result: RedactionApplyResult;
  readonly origin: EventOrigin;
}
/** Marks were created, changed or removed on these pages. */
export interface RedactionPendingChangedEvent {
  readonly pages: readonly PageRef[];
}

/**
 * Redaction for one document: marking (a mark is a `redact` annotation), the
 * pending marks, and applying them, which can't be undone. A page argument
 * is a ref or an index: a read given a page that isn't there answers empty,
 * a verb refuses it with `not-found`. Every async verb takes a `signal`. The
 * settings belong to the plugin, not to a document.
 */
export interface RedactionCapability extends SettingsApi<RedactionSettings> {
  /**
   * Whether marking is allowed. Marking and applying are different powers: a
   * mark is an ordinary `redact` annotation, so this is annotation create
   * authority (matches Acrobat: any reviewer who can annotate can propose
   * redactions).
   */
  canMark(): boolean;
  /** Whether this mark may be removed before it's applied: it is a mark, and may be deleted (`annotations:delete`). */
  canUnmark(ref: AnnotationRef): boolean;
  /** Whether this mark's label may change: it is a mark, and may be changed (`annotations:update`). */
  canUpdateLabel(ref: AnnotationRef): boolean;
  /**
   * Whether applying is allowed: the engine has a redaction service and every
   * capability its apply asserts is granted (`doc.redact`, `doc.pages.modify`,
   * `doc.annotate.modify`).
   */
  canApply(): boolean;
  /** An apply of this session is running at the engine. */
  isApplying(): boolean;
  /** The last confirmed apply result, from this session or another. */
  getLastResult(): RedactionApplyResult | null;

  // ── the pending view ──
  /** Pending marks in page order, or one page's. Reference-stable while unchanged. */
  listPending(filter?: RedactionMarkFilter): readonly RedactionMark[];
  getPending(ref: AnnotationRef): RedactionMark | null;
  /** How many marks wait to be applied, in the document or on one page. */
  getPendingCount(page?: PageRef | number): number;
  /** Which other annotations applying these marks (default: all) would destroy. */
  estimateCollateral(refs?: readonly AnnotationRef[]): RedactionCollateral;

  // ── marking ──
  // Every marking verb rejects `permission-denied` without annotation create
  // authority (see `canMark`). Marks take the `overlay` settings.
  /**
   * Mark the current text selection (one mark per page) and clear it.
   * Resolves `{ marks }`, empty without a selection; rejects `unsupported`
   * without the selection plugin.
   */
  markSelection(options?: OperationOptions): Promise<{ marks: readonly RedactionMark[] }>;
  /** Mark a page-space rectangle. Resolves `{ mark }`; rejects `not-found` for a page that isn't there. */
  markArea(
    page: PageRef | number,
    bounds: Rect,
    options?: OperationOptions,
  ): Promise<{ mark: RedactionMark }>;
  /** Mark a whole page. Resolves `{ mark }`; rejects `not-found` for a page that isn't there. */
  markPage(page: PageRef | number, options?: OperationOptions): Promise<{ mark: RedactionMark }>;
  /**
   * Mark every match of a search, or the ones on some pages. Runs the query
   * through the search plugin, so it replaces the user's current search.
   * Resolves `{ marks }`, one per match; rejects `unsupported` without the
   * search plugin.
   */
  markMatches(
    query: SearchQuery,
    options?: { pages?: readonly (PageRef | number)[] } & OperationOptions,
  ): Promise<{ marks: readonly RedactionMark[] }>;
  /**
   * Remove marks without applying them. Refs that are not pending marks are
   * skipped; a mark this session may not delete fails with
   * `permission-denied` (see `canUnmark`).
   */
  unmark(
    refs: readonly AnnotationRef[],
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /** Remove every mark, as `unmark` does. */
  clearPending(options?: OperationOptions): Promise<BatchResult<AnnotationRef, AnnotationRef>>;
  /**
   * Set the label a mark shows once it's applied; `overlayText: null` clears
   * it. Keeps the mark's font and colors. Resolves `{ mark }`. Rejects
   * `not-found` for a ref that isn't a mark, `permission-denied` when
   * `canUpdateLabel(ref)` is false.
   */
  updateLabel(
    ref: AnnotationRef,
    patch: RedactionLabelPatch,
    options?: OperationOptions,
  ): Promise<{ mark: RedactionMark }>;

  // ── applying (irreversible) ──
  /**
   * Apply specific pending marks. Per-page outcomes ride the result. Applies
   * run one at a time in call order; when one resolves, `getLastResult()`
   * holds its result and `onApplied` has fired. Rejects with `not-found` when
   * none of the refs is a pending mark, `unsupported` without an engine
   * redaction service, or the engine's `permission-denied`.
   */
  apply(refs: readonly AnnotationRef[], options?: OperationOptions): Promise<RedactionApplyResult>;
  /**
   * Apply every redaction in the document, in pages scope, including marks
   * on pages this client never loaded. Rejects like `apply`, and with
   * `not-ready` when the document has no pages.
   */
  applyAll(options?: OperationOptions): Promise<RedactionApplyResult>;
  /**
   * Apply the marks on some pages. Rejects like `apply`, with
   * `invalid-input` for no pages, and `not-found` for a page that isn't there.
   */
  applyPages(
    pages: readonly (PageRef | number)[],
    options?: OperationOptions,
  ): Promise<RedactionApplyResult>;

  // ── events ──
  /** A confirmed apply, from this session or another; fires after `getLastResult()` changed. */
  readonly onApplied: EventHook<RedactionAppliedEvent>;
  /** Marks were created, changed or removed on some pages. */
  readonly onPendingChanged: EventHook<RedactionPendingChangedEvent>;
}

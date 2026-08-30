import { createCapabilityToken } from '@embedpdf/core';
import type { AnnotationRef, RedactionApplyResult } from '@embedpdf/engine-core';

/**
 * One pending redaction mark — a live projection of a `redact` annotation on
 * the annotation plane (the plugin owns NO mark state of its own; delete the
 * annotation and the pending item is gone).
 */
export interface RedactionPendingItem {
  /** Stable list key derived from the ref. */
  id: string;
  ref: AnnotationRef;
  pageObjectNumber: number;
  /** Display index (0-based) from the page registry — for "page N" labels. */
  pageIndex: number;
  /** `area` = rect-only mark (marquee); `text` = per-line quads (selection). */
  kind: 'area' | 'text';
  /** `/OverlayText` label, when set. */
  overlayText: string | null;
}

export interface RedactionState {
  /** A destructive apply is in flight. */
  applying: boolean;
  /** The last apply result seen (own or remote), for status UI. */
  lastResult: RedactionApplyResult | null;
}

export type RedactionAction =
  | { type: 'APPLY_STARTED' }
  | { type: 'APPLY_FINISHED'; result: RedactionApplyResult | null };

/** A label edit: `overlayText: null` clears it; `repeat` tiles it. */
export interface RedactionLabelPatch {
  overlayText?: string | null;
  repeat?: boolean;
}

export interface RedactionCapability {
  /**
   * The twins (permissions.md). Marking and applying are DIFFERENT powers:
   * a mark is an ordinary `redact` annotation, so `canMark()` is annotation
   * create authority (any reviewer who can annotate can propose redactions —
   * Acrobat parity); `canApply()` is the destructive rewrite — engine support
   * present AND every capability the engine's apply asserts (`doc.redact`,
   * `doc.pages.modify`, `doc.annotate.modify`). The engine enforces both
   * independently — these are the UI mirrors.
   */
  canMark(): boolean;
  canApply(): boolean;
  isApplying(): boolean;
  lastResult(): RedactionApplyResult | null;

  /** The composed marking tool (text-selection over text + area drag elsewhere). */
  enableRedact(): void;
  toggleRedact(): void;
  isRedactActive(): boolean;

  /** Mark the current text selection (per page) and clear it. False when
   *  there is no selection plugin or no selection. */
  queueCurrentSelection(): Promise<boolean>;

  /** Load every page's annotations so the pending view is complete (the
   *  annotation plane loads lazily per page). Call when opening a panel. */
  preparePending(): Promise<void>;
  /** Pending marks over the LOADED annotation state (see preparePending). */
  getPending(): RedactionPendingItem[];
  pendingCount(): number;
  /**
   * Client-side estimate of how many OTHER annotations the given pending
   * marks (default: all) would destroy — for confirm dialogs BEFORE the
   * apply. The authoritative count comes back on the result.
   */
  estimateCollateral(ids?: string[]): number;

  /** Edit a mark's label. Reads the mark's current `/DA` styling and writes
   *  the full label set, so a text-only edit never resets the styling. */
  setLabel(ref: AnnotationRef, patch: RedactionLabelPatch): Promise<void>;

  /** Apply specific pending marks (refs scope). Irreversible. */
  apply(ids: string[]): Promise<RedactionApplyResult>;
  /** Apply every redaction in the document (pages scope — including marks on
   *  pages this client never loaded). Irreversible. */
  applyAll(): Promise<RedactionApplyResult>;

  /** Fires after ANY confirmed apply — own or a remote collaborator's. */
  onApplied(cb: (result: RedactionApplyResult) => void): () => void;
}

export const RedactionToken = createCapabilityToken<RedactionCapability>('redaction');

/**
 * Facade inject functions — thin sugar over the capability + generic binding,
 * name-for-name with the React hooks (`useZoom` → `injectZoom`), values
 * replaced by signals.
 *
 * STRICT like their React counterparts: they resolve a document-scoped
 * capability, so call them in document UI (behind `*epdfDocumentGate` /
 * `@if (documentId())`). For always-mounted chrome, read through
 * `injectOptionalSelector` with a fallback instead.
 *
 * Methods LATE-BIND the current capability (`() => cap().zoomIn()`), so a
 * facade captured before a document switch drives the document that is active
 * at CALL time, never a stale one.
 */
import type { Signal } from '@angular/core';
import { settingsEqual } from '@embedpdf/plugin-stage';
import type { StageCapability } from '@embedpdf/plugin-stage';
import type { EventHook } from '@embedpdf/core';
import {
  injectCapabilityEvent,
  injectCapabilityFor,
  injectDocumentId,
  injectKernelValue,
  injectSelectorFor,
  shallowArray,
} from '@embedpdf/angular/runtime';
import { injectStageToken, type StageTokenProp } from './scope';

// Every facade takes an OPTIONAL token; without one it binds to the nearest
// `<epdf-stage>` / `[epdfStageScope]`, else the main lens.
const injectCapability = (token: Signal<StageTokenProp>) => injectCapabilityFor(() => token());
const injectSelector = <R>(
  token: Signal<StageTokenProp>,
  select: (cap: StageCapability) => R,
  equal?: (a: R, b: R) => boolean,
) => injectSelectorFor(() => token(), select, equal);

type AnyFn = (...args: never[]) => unknown;
/** Late-binding method passthrough: exact capability signature, current doc. */
const lazy = <K extends keyof StageCapability>(
  cap: Signal<StageCapability>,
  key: K,
): StageCapability[K] =>
  ((...args: unknown[]) =>
    (cap()[key] as unknown as (...a: unknown[]) => unknown)(...args)) as StageCapability[K] &
    AnyFn as StageCapability[K];

export function injectStage(explicit?: StageTokenProp): Signal<StageCapability> {
  return injectCapability(injectStageToken(explicit));
}

/** Subscribe to one stage event for the injector's lifetime:
 *  `injectStageEvent((c) => c.onZoomChanged, handler)` — React's `useStageEvent`. */
export function injectStageEvent<T>(
  select: (cap: StageCapability) => EventHook<T>,
  handler: (event: T) => void,
  explicit?: StageTokenProp,
): void {
  // The token is read once at injection: a facade is bound to its lens for life.
  injectCapabilityEvent(injectStageToken(explicit)(), select, handler);
}

export function injectZoom(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const s = injectCapability(token);
  return {
    zoom: injectSelector(token, (c) => c.getZoomLevel()),
    /** Active zoom intent: 'automatic' | 'fit-page' | 'fit-width' | 'fit-all' | 'custom'. */
    mode: injectSelector(token, (c) => c.getZoomMode()),
    zoomIn: lazy(s, 'zoomIn'),
    zoomOut: lazy(s, 'zoomOut'),
    fitWidth: lazy(s, 'fitWidth'),
    fitPage: lazy(s, 'fitPage'),
    fitAll: lazy(s, 'fitAll'),
    automatic: lazy(s, 'fitAutomatic'),
    zoomTo: lazy(s, 'zoomTo'),
  };
}

export function injectPages(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const s = injectCapability(token);
  const documentId = injectDocumentId();
  return {
    currentPage: injectSelector(token, (c) => c.getCurrentPageIndex()),
    pageCount: injectKernelValue((k) => k.documents.listPages(documentId() ?? undefined).length),
    goToPage: lazy(s, 'goToPageIndex'),
    next: lazy(s, 'nextPage'),
    prev: lazy(s, 'previousPage'),
    reveal: lazy(s, 'revealIndex'),
  };
}

export function injectLayout(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const s = injectCapability(token);
  return {
    flow: injectSelector(token, (c) => c.getSettings().flow),
    layout: injectSelector(token, (c) => c.getSettings().layout),
    spread: injectSelector(token, (c) => c.getSettings().spread),
    sizing: injectSelector(token, (c) => c.getSettings().sizing),
    bounded: injectSelector(token, (c) => c.getSettings().bounded),
    setFlow: lazy(s, 'setFlow'),
    setLayout: lazy(s, 'setLayout'),
    setSpread: lazy(s, 'setSpread'),
    setSizing: lazy(s, 'setSizing'),
    setBounded: (bounded: boolean) => s().updateSettings({ bounded }),
  };
}

/** The document's page list (with PDF labels) + the current item's pages — the
 *  data for page thumbnails / worksheet-style page tabs. */
export function injectPageList(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const documentId = injectDocumentId();
  return {
    // The page list is document truth (order, labels, sizes) from the kernel's
    // page registry; Stage only knows which of those pages it is showing.
    pages: injectKernelValue(
      (k) => k.documents.listPages(documentId() ?? undefined),
      (a, b) =>
        a.length === b.length &&
        a.every(
          (p, i) => p.ref.pageObjectNumber === b[i].ref.pageObjectNumber && p.label === b[i].label,
        ),
    ),
    currentItemPages: injectSelector(
      token,
      (c) => c.listCurrentItemPages().map((p) => p.index),
      shallowArray,
    ),
  };
}

/**
 * All Stage settings + the batch `update`. The seam for "presets are a customer
 * concern": keep your own `Partial<StageSettings>` objects and apply them with
 * `update(preset)` (one anchor-preserving change).
 */
export function injectStageSettings(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const s = injectCapability(token);
  return {
    // settingsEqual derives from the plugin's settings registry — a new setting
    // is covered automatically, without this package spelling out the shape.
    settings: injectSelector(token, (c) => c.getSettings(), settingsEqual),
    update: lazy(s, 'updateSettings'),
    reset: lazy(s, 'resetSettings'),
  };
}

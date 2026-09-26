/**
 * Facade inject functions — thin sugar over the capability + generic binding,
 * name-for-name with the React hooks (`useZoom` → `injectZoom`), values
 * replaced by signals.
 *
 * Strict like their React counterparts: they resolve a document-scoped
 * capability, so call them in document UI (behind `*epdfDocumentGate` /
 * `@if (documentId())`). For always-mounted chrome, read through
 * `injectOptionalSelector` with a fallback instead.
 *
 * Methods late-bind the current capability (`() => cap().zoomIn()`), so a
 * facade captured before a document switch drives the document that is active
 * at call time, never a stale one.
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

// Every facade takes an optional token; without one it binds to the nearest
// `<epdf-stage>` / `[epdfStageScope]`, else the main lens.
const injectCapability = (token: Signal<StageTokenProp>) => injectCapabilityFor(() => token());
const injectSelector = <R>(
  token: Signal<StageTokenProp>,
  select: (stage: StageCapability) => R,
  equal?: (left: R, right: R) => boolean,
) => injectSelectorFor(() => token(), select, equal);

type AnyFn = (...args: never[]) => unknown;
/** Late-binding method passthrough: exact capability signature, current doc. */
const lazy = <K extends keyof StageCapability>(
  cap: Signal<StageCapability>,
  key: K,
): StageCapability[K] =>
  ((...args: unknown[]) =>
    (cap()[key] as unknown as (...args: unknown[]) => unknown)(...args)) as StageCapability[K] &
    AnyFn as StageCapability[K];

export function injectStage(explicit?: StageTokenProp): Signal<StageCapability> {
  return injectCapability(injectStageToken(explicit));
}

/** Subscribe to one stage event for the injector's lifetime:
 *  `injectStageEvent((stage) => stage.onZoomChanged, handler)` — React's `useStageEvent`. */
export function injectStageEvent<T>(
  select: (stage: StageCapability) => EventHook<T>,
  handler: (event: T) => void,
  explicit?: StageTokenProp,
): void {
  // The token is read once at injection: a facade is bound to its lens for life.
  injectCapabilityEvent(injectStageToken(explicit)(), select, handler);
}

export function injectZoom(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const signal = injectCapability(token);
  return {
    zoom: injectSelector(token, (stage) => stage.getZoomLevel()),
    /** Active zoom intent: 'automatic' | 'fit-page' | 'fit-width' | 'fit-all' | 'custom'. */
    mode: injectSelector(token, (stage) => stage.getZoomMode()),
    zoomIn: lazy(signal, 'zoomIn'),
    zoomOut: lazy(signal, 'zoomOut'),
    fitWidth: lazy(signal, 'fitWidth'),
    fitPage: lazy(signal, 'fitPage'),
    fitAll: lazy(signal, 'fitAll'),
    automatic: lazy(signal, 'fitAutomatic'),
    zoomTo: lazy(signal, 'zoomTo'),
  };
}

export function injectPages(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const signal = injectCapability(token);
  const documentId = injectDocumentId();
  return {
    currentPage: injectSelector(token, (stage) => stage.getCurrentPageIndex()),
    pageCount: injectKernelValue(
      (kernel) => kernel.documents.listPages(documentId() ?? undefined).length,
    ),
    goToPage: lazy(signal, 'goToPageIndex'),
    next: lazy(signal, 'nextPage'),
    previous: lazy(signal, 'previousPage'),
    reveal: lazy(signal, 'revealIndex'),
  };
}

export function injectLayout(explicit?: StageTokenProp) {
  const token = injectStageToken(explicit);
  const signal = injectCapability(token);
  return {
    flow: injectSelector(token, (stage) => stage.getSettings().flow),
    layout: injectSelector(token, (stage) => stage.getSettings().layout),
    spread: injectSelector(token, (stage) => stage.getSettings().spread),
    sizing: injectSelector(token, (stage) => stage.getSettings().sizing),
    bounded: injectSelector(token, (stage) => stage.getSettings().bounded),
    setFlow: lazy(signal, 'setFlow'),
    setLayout: lazy(signal, 'setLayout'),
    setSpread: lazy(signal, 'setSpread'),
    setSizing: lazy(signal, 'setSizing'),
    setBounded: (bounded: boolean) => signal().updateSettings({ bounded }),
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
      (kernel) => kernel.documents.listPages(documentId() ?? undefined),
      (left, right) =>
        left.length === right.length &&
        left.every(
          (pageInfo, i) =>
            pageInfo.ref.pageObjectNumber === right[i].ref.pageObjectNumber &&
            pageInfo.label === right[i].label,
        ),
    ),
    currentItemPages: injectSelector(
      token,
      (stage) => stage.listCurrentItemPages().map((pageInfo) => pageInfo.index),
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
  const signal = injectCapability(token);
  return {
    // settingsEqual derives from the plugin's settings registry — a new setting
    // is covered automatically, without this package spelling out the shape.
    settings: injectSelector(token, (stage) => stage.getSettings(), settingsEqual),
    update: lazy(signal, 'updateSettings'),
    reset: lazy(signal, 'resetSettings'),
  };
}

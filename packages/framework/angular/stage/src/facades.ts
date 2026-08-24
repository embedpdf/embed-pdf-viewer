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
import { StageToken, settingsEqual } from '@embedpdf/plugin-stage';
import type { StageCapability } from '@embedpdf/plugin-stage';
import { injectCapability, injectSelector, shallowArray } from '@embedpdf/angular/runtime';
import type { StageTokenProp } from './stage';

type AnyFn = (...args: never[]) => unknown;
/** Late-binding method passthrough: exact capability signature, current doc. */
const lazy = <K extends keyof StageCapability>(
  cap: Signal<StageCapability>,
  key: K,
): StageCapability[K] =>
  ((...args: unknown[]) =>
    (cap()[key] as unknown as (...a: unknown[]) => unknown)(...args)) as StageCapability[K] &
    AnyFn as StageCapability[K];

export function injectStage(token: StageTokenProp = StageToken): Signal<StageCapability> {
  return injectCapability(token);
}

export function injectZoom(token: StageTokenProp = StageToken) {
  const s = injectCapability(token);
  return {
    zoom: injectSelector(token, (c) => c.zoomLevel()),
    /** Active zoom intent: 'automatic' | 'fit-page' | 'fit-width' | 'fit-all' | 'custom'. */
    mode: injectSelector(token, (c) => c.zoomMode()),
    zoomIn: lazy(s, 'zoomIn'),
    zoomOut: lazy(s, 'zoomOut'),
    fitWidth: lazy(s, 'fitWidth'),
    fitPage: lazy(s, 'fitPage'),
    fitAll: lazy(s, 'fitAll'),
    automatic: lazy(s, 'automatic'),
    zoomTo: lazy(s, 'zoomTo'),
  };
}

export function injectPages(token: StageTokenProp = StageToken) {
  const s = injectCapability(token);
  return {
    currentPage: injectSelector(token, (c) => c.currentPage()),
    pageCount: injectSelector(token, (c) => c.pageCount()),
    goToPage: lazy(s, 'goToPage'),
    next: lazy(s, 'next'),
    prev: lazy(s, 'prev'),
    reveal: lazy(s, 'reveal'),
  };
}

export function injectLayout(token: StageTokenProp = StageToken) {
  const s = injectCapability(token);
  return {
    flow: injectSelector(token, (c) => c.flow()),
    layout: injectSelector(token, (c) => c.layout()),
    spread: injectSelector(token, (c) => c.spread()),
    sizing: injectSelector(token, (c) => c.sizing()),
    bounded: injectSelector(token, (c) => c.bounded()),
    setFlow: lazy(s, 'setFlow'),
    setLayout: lazy(s, 'setLayout'),
    setSpread: lazy(s, 'setSpread'),
    setSizing: lazy(s, 'setSizing'),
    setBounded: lazy(s, 'setBounded'),
  };
}

/** The document's page list (with PDF labels) + the current item's pages — the
 *  data for page thumbnails / worksheet-style page tabs. */
export function injectPageList(token: StageTokenProp = StageToken) {
  return {
    pages: injectSelector(
      token,
      (c) => c.pages(),
      (a, b) =>
        a.length === b.length && a.every((p, i) => p.pon === b[i].pon && p.label === b[i].label),
    ),
    currentItemPages: injectSelector(token, (c) => c.currentItemPages(), shallowArray),
  };
}

/**
 * All Stage settings + the batch `update`. The seam for "presets are a customer
 * concern": keep your own `Partial<StageSettings>` objects and apply them with
 * `update(preset)` (one anchor-preserving change).
 */
export function injectStageSettings(token: StageTokenProp = StageToken) {
  const s = injectCapability(token);
  return {
    // settingsEqual derives from the plugin's settings registry — a new setting
    // is covered automatically, without this package spelling out the shape.
    settings: injectSelector(token, (c) => c.settings(), settingsEqual),
    update: lazy(s, 'update'),
    reset: lazy(s, 'resetView'),
  };
}

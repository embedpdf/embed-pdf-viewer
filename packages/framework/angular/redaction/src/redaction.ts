/**
 * The redaction plugin's service and feature. Marking rides the annotation plugin (the `redact`
 * tool makes ordinary annotations); the service is the workflow around it:
 *
 *   withRedaction(options)     the plugin, for provideEmbedPdf()
 *   inject(EpdfRedaction)      marking, the marks waiting (`pending()`, `pendingOn(page)`),
 *                              applying them, the State table as signals (`pendingCount()`,
 *                              `applying()`, `lastResult()`), the events as streams, the settings
 *
 *   await redaction.applyAll(); // can't be undone: ask first
 */
import { Injectable, type Signal } from '@angular/core';
import type { PageRef } from '@embedpdf/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
// `RedactionApplyResult` (what `lastResult()` holds) is imported so the built declarations take
// it from the plugin, a dependency of this package, not from the engine package that declares it.
import {
  redactionPlugin,
  redactionState,
  RedactionToken,
  type RedactionApplyResult,
  type RedactionConfig,
  type RedactionMark,
} from '@embedpdf/plugin-redaction';

const NO_MARKS: readonly RedactionMark[] = Object.freeze([]);

/**
 * Redaction in the document in scope (`[epdfDocumentScope]`), else the active one: the
 * Redaction page's methods, its State table as signals, the marks waiting to be applied as
 * signals, the events as streams (`applied$`, `pendingChanged$`), and the settings. Without a
 * document the signals read empty and the methods refuse with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfRedaction extends pluginService({
  name: 'EpdfRedaction',
  feature: 'withRedaction()',
  token: RedactionToken,
  state: redactionState,
  methods: [
    'markSelection',
    'markArea',
    'markPage',
    'markMatches',
    'unmark',
    'clearPending',
    'updateLabel',
    'listPending',
    'getPending',
    'getPendingCount',
    'estimateCollateral',
    'applyAll',
    'apply',
    'applyPages',
    'canMark',
    'canUnmark',
    'canUpdateLabel',
    'canApply',
    'isApplying',
    'getLastResult',
  ],
  events: ['onApplied', 'onPendingChanged'],
}) {
  /**
   * The marks waiting to be applied, in page order, for a review panel. The plugin hands out
   * the same list until a mark changes, so a list redraws only then. Empty without a document.
   */
  readonly pending: Signal<readonly RedactionMark[]> = this.binding.select(
    (redaction) => redaction.listPending(),
    NO_MARKS,
  );

  /**
   * One page's marks (its ref or its index). Pass a function (`() => this.page().ref`) and it
   * follows the page you show. Empty for a page without marks, and without a document.
   */
  pendingOn(page: PageRef | number | (() => PageRef | number)): Signal<readonly RedactionMark[]> {
    const pageOf = typeof page === 'function' ? page : () => page;
    return this.binding.select((redaction) => redaction.listPending({ page: pageOf() }), NO_MARKS);
  }
}

/** Redaction, with its settings: `withRedaction({ overlay: { fill: '#1d2b53' } })`. */
export function withRedaction(options?: RedactionConfig): EmbedPdfFeature {
  return { plugins: [redactionPlugin(options)], services: [EpdfRedaction] };
}

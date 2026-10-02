/**
 * The DI tokens the runtime's pieces share, in a file of their own so the pieces that provide
 * them and the ones that read them never import each other.
 */
import { InjectionToken, type Signal } from '@angular/core';
import type { EmbedPdfConfig, EmbedPdfFeature } from './config';

/**
 * The document a part of the template talks to: `[epdfDocumentScope]`, or a Stage that opened
 * its own `[document]`. A null id follows the active document.
 */
export interface EpdfDocumentScopeRef {
  readonly id: Signal<string | null>;
}

export const EPDF_DOCUMENT_SCOPE = new InjectionToken<EpdfDocumentScopeRef>('EPDF_DOCUMENT_SCOPE');

/** What `provideEmbedPdf()` was given, for the viewer it creates. */
export interface EmbedPdfSetup {
  readonly config: EmbedPdfConfig;
  readonly features: readonly EmbedPdfFeature[];
}

export const EPDF_SETUP = new InjectionToken<EmbedPdfSetup>('EPDF_SETUP');

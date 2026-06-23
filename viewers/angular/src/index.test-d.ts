/**
 * Type-level tests for the public package surface. Pinned with `expectTypeOf`
 * so accidental contract changes (output renames, signal/Provider return-type
 * shifts) surface as compile errors in CI rather than slipping through into a
 * published release.
 *
 * Runs through `tsc --noEmit` during the Angular AOT build — there is no
 * runtime test code here.
 */
import type {
  EnvironmentProviders,
  InputSignal,
  OutputEmitterRef,
  Provider,
  Signal,
} from '@angular/core';
import type { EmbedPdfContainer, PDFViewerConfig, PluginRegistry } from '@embedpdf/snippet';
import { expectTypeOf } from 'vitest';

import {
  EMBEDPDF_VIEWER_DEFAULT_CONFIG,
  PDFViewer,
  createDocumentScopeSignal,
  createPluginCapabilitySignal,
  provideEmbedPdfViewerConfig,
  provideEmbedPdfViewerDefaults,
  type EmbedPdfThemeChangeEvent,
} from './index';

// PDFViewer surface
declare const viewer: PDFViewer;
expectTypeOf(viewer.config).toEqualTypeOf<InputSignal<PDFViewerConfig>>();
expectTypeOf(viewer.init).toEqualTypeOf<OutputEmitterRef<EmbedPdfContainer>>();
expectTypeOf(viewer.ready).toEqualTypeOf<OutputEmitterRef<PluginRegistry>>();
expectTypeOf(viewer.themeChange).toEqualTypeOf<OutputEmitterRef<EmbedPdfThemeChangeEvent>>();
expectTypeOf(viewer.container).toEqualTypeOf<Signal<EmbedPdfContainer | null>>();
expectTypeOf(viewer.registry).toEqualTypeOf<Signal<PluginRegistry | null>>();

// Provider helpers — split return types are intentional.
expectTypeOf(provideEmbedPdfViewerConfig).returns.toEqualTypeOf<Provider>();
expectTypeOf(provideEmbedPdfViewerDefaults).returns.toEqualTypeOf<EnvironmentProviders>();
expectTypeOf(EMBEDPDF_VIEWER_DEFAULT_CONFIG).toMatchTypeOf<{ ngMetadataName?: string }>();

// Capability signal helpers accept Signal / value / getter for both arguments.
type MockZoomScope = { documentId: string; zoomIn(): void };
type MockZoomCapability = { forDocument(id: string): MockZoomScope };
type MockZoomPlugin = { id: string; provides(): MockZoomCapability };

declare const registrySignal: Signal<PluginRegistry | null>;
declare const documentIdSignal: Signal<string>;

const capability = createPluginCapabilitySignal<MockZoomPlugin>(registrySignal, 'zoom');
expectTypeOf(capability).toEqualTypeOf<Signal<MockZoomCapability | null>>();

const scope = createDocumentScopeSignal(capability, documentIdSignal);
expectTypeOf(scope).toEqualTypeOf<Signal<MockZoomScope | null>>();

// Literal-string documentId and value-or-getter polymorphism.
const scopeFromLiteral = createDocumentScopeSignal<MockZoomCapability>(
  { forDocument: (id) => ({ documentId: id, zoomIn: () => {} }) },
  'doc-1',
);
expectTypeOf(scopeFromLiteral).toEqualTypeOf<Signal<MockZoomScope | null>>();

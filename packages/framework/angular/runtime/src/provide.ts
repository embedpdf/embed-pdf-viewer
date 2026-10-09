/**
 * `provideEmbedPdf(config, ...features)`: the viewer as Angular providers, in Angular's own
 * style (`provideRouter(routes, withViewTransitions())`).
 *
 *   providers: [provideEmbedPdf({ engine }, withStage(), withRender(), withSearch())]
 *
 * It works in a component's `providers` (that component and everything in its template share
 * one viewer, and the component can inject its services itself), in a route's `providers`, and
 * in the app config. Each injector that provides it gets its own viewer, created in the browser
 * and destroyed with the injector.
 */
import type { Provider, Type } from '@angular/core';
import type { EmbedPdfConfig, EmbedPdfFeature } from './config';
import { EpdfKernelHost } from './kernel-host';
import { EpdfDocument, EpdfDocuments, EpdfViewer } from './services';
import { EPDF_SETUP, type EmbedPdfSetup } from './tokens';

const scopedServices: Type<unknown>[] = [EpdfDocuments, EpdfDocument];

/**
 * Every service that acts on one document: the viewer's own, and each feature's, added when a
 * `provideEmbedPdf()` call names the feature. `[epdfDocumentScope]` and a Stage list this array
 * in their `providers`, so a service injected under them acts on their document.
 *
 * It is one array that grows, not a copy: Angular reads a directive's providers when its
 * template is first created, which is after the `provideEmbedPdf()` calls in decorators and the
 * app config ran. A service whose feature is first named later (a lazily loaded route's
 * providers) is still provided by its viewer, and acts on the active document there.
 */
export const EPDF_SCOPED_SERVICES: Provider[] = scopedServices;

/** The viewer, with the plugins its features register. */
export function provideEmbedPdf(
  config: EmbedPdfConfig,
  ...features: EmbedPdfFeature[]
): Provider[] {
  for (const feature of features) {
    for (const service of feature.services ?? []) {
      if (!scopedServices.includes(service)) scopedServices.push(service);
    }
  }
  const setup: EmbedPdfSetup = { config, features };
  return [
    { provide: EPDF_SETUP, useValue: setup },
    EpdfKernelHost,
    EpdfViewer,
    EpdfDocuments,
    EpdfDocument,
    ...features.flatMap((feature) => [...(feature.services ?? []), ...(feature.providers ?? [])]),
  ];
}

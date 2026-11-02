import type { DocsIntegration } from './docs-integrations';

/**
 * The viewer's examples that open on a page of their own: the apps of the docs' Examples section
 * (`viewer/examples/<slug>`), which need the whole window. Each has its page, `/examples/<slug>`,
 * and its docs page shows a screenshot that links there (`<Example name size="page">`; docs/content
 * `pageExamples` checks every one has its screenshot).
 */

/** The example a sample is: `viewer/examples/reader` is `reader`. */
export function exampleSlug(name: string): string | null {
  return name.match(/^viewer\/examples\/([\w-]+)$/)?.[1] ?? null;
}

/** An example's page. */
export function examplePageHref(slug: string): string {
  return `/examples/${slug}`;
}

/** An example's code in one integration, highlighted, as its page fetches it. */
export function exampleCodeHref(slug: string, integration: DocsIntegration): string {
  return `/api/examples/${slug}/${integration}`;
}

/** An example's docs page: for one integration, or for the reader's own (middleware picks it). */
export function exampleDocsHref(slug: string, integration?: DocsIntegration): string {
  return integration
    ? `/docs/viewer/${integration}/examples/${slug}`
    : `/docs/viewer/examples/${slug}`;
}

/**
 * An example's screenshot, as `docs/content/screenshots/build.mjs` takes it: the example at 1440
 * by 900, 1600 pixels wide.
 */
export function exampleScreenshot(name: string) {
  return { src: `/screenshots/${name}.webp`, width: 1600, height: 1000 };
}

import type { ExampleFile } from '@embedpdf/docs-kit';
import { getDocsHighlighter, highlightCodeFile } from '@embedpdf/docs-kit/mdx/highlight';
import { importPage } from 'nextra/pages';

import examplesSection from '@/content/docs/viewer/examples/_meta';

import {
  DEFAULT_PRODUCT_INTEGRATION,
  DOCS_INTEGRATIONS,
  type DocsIntegration,
} from './docs-integrations';
import { docsRelease } from './docs-release';
import { collectSampleFiles } from './docs-samples';
import { readDemoManifest } from './remark-code-example';

/** An example on a page of its own (`lib/examples.ts`), as the Examples section has it. */
export type ExamplePage = {
  slug: string;
  /** The sample's name, `viewer/examples/<slug>`. */
  name: string;
  /** Its docs page's title and description. */
  title: string;
  description: string;
  /**
   * What the page runs: the build of the viewer docs' default integration. Every integration's
   * looks the same. None while that one's docs page isn't live, and then there's no page.
   */
  demo: string | null;
  /** The integrations whose code the page shows: each one built, with its docs page live. */
  integrations: DocsIntegration[];
};

/** The Examples section's examples, in its order, each with what its page needs. */
export async function examplePages(): Promise<ExamplePage[]> {
  const manifest = readDemoManifest();
  return Promise.all(
    Object.keys(examplesSection).map(async (slug) => {
      const name = `viewer/examples/${slug}`;
      const contentPath = ['docs', 'viewer', 'examples', slug];
      const { metadata } = await importPage(contentPath);
      const built = manifest[name] ?? {};
      const integrations = DOCS_INTEGRATIONS.filter(
        (integration) => built[integration] && docsRelease(contentPath, integration).live,
      );
      const runs = DEFAULT_PRODUCT_INTEGRATION.viewer;
      return {
        slug,
        name,
        title: String(metadata?.title ?? slug),
        description: String(metadata?.description ?? ''),
        demo: integrations.includes(runs) ? built[runs] : null,
        integrations,
      };
    }),
  );
}

/** One example, when it has its page. */
export async function examplePage(slug: string): Promise<ExamplePage | null> {
  const page = (await examplePages()).find((candidate) => candidate.slug === slug);
  return page?.demo ? page : null;
}

/** An example's code in one integration, highlighted as the docs show it. */
export async function exampleCode(
  slug: string,
  integration: DocsIntegration,
): Promise<ExampleFile[] | null> {
  const page = await examplePage(slug);
  if (!page?.integrations.includes(integration)) return null;
  const highlighter = await getDocsHighlighter();
  return (collectSampleFiles(page.name)[integration] ?? []).map((file) => {
    const { filename, code, language, highlightedCode } = highlightCodeFile(highlighter, file);
    return { filename, code, language, highlightedCode };
  });
}

import {
  createDocsOgResponse,
  selectOgSnippet,
  snippetFromFrontmatter,
  type OgSnippet,
} from '@embedpdf/docs-kit/og';
import { importPage } from 'nextra/pages';

import { DOCS_INTEGRATION_LABELS } from './docs-integrations';
import { resolveDocsTree } from './docs-markdown';
import { getDocsPagePresentation, type DocsPagePresentation } from './docs-page';
import { resolveDocsPath } from './docs-route';
import { ogBrand } from './og-brand';

/**
 * This site's binding of the kit's social card.
 *
 * The card decides nothing it draws: every field below is the same resolved
 * value the page's own `<meta>` tags use (./docs-page.ts), and the snippet
 * comes from the SAME markdown pass that renders the `.md` export and feeds
 * the search index. A card therefore cannot advertise code the page does not
 * show, for the same structural reason an indexed section cannot claim
 * something the page does not say.
 */
function toOgPage(page: DocsPagePresentation, snippet: OgSnippet | null) {
  return {
    canonicalPath: page.canonicalPath,
    description: page.socialDescription,
    integration: page.integration,
    integrationLabel: page.integration ? DOCS_INTEGRATION_LABELS[page.integration] : undefined,
    section: page.section,
    snippet,
    title: page.imageTitle,
  };
}

/** Renders the social card for an already-resolved presentation. */
export function createSocialImageResponse(
  page: DocsPagePresentation,
  snippet: OgSnippet | null = null,
) {
  return createDocsOgResponse(ogBrand, toOgPage(page, snippet));
}

/**
 * Resolves the code panel: an author's `ogSnippet` front matter wins,
 * otherwise the first code block on the page small enough to sit on a card
 * whole. Neither found leaves the panel off entirely.
 */
async function resolveSnippet(
  mdxPath: string[],
  page: DocsPagePresentation,
): Promise<OgSnippet | null> {
  const resolved = resolveDocsPath(mdxPath);
  if (!resolved) return null;

  const basename = mdxPath.at(-1) ?? 'example';
  const { metadata, sourceCode } = await importPage(resolved.contentPath);

  const authored = snippetFromFrontmatter(
    (metadata as Record<string, unknown> | undefined)?.ogSnippet,
    basename,
  );
  if (authored) return authored;

  const { tree } = resolveDocsTree({
    canonicalPath: page.canonicalPath,
    integration: resolved.integration,
    sourceCode,
  });
  return selectOgSnippet(tree, basename);
}

/** Renders the social card for an MDX-backed documentation URL. */
export async function createDocsSocialImage(mdxPath: string[]) {
  const page = await getDocsPagePresentation(mdxPath);
  if (!page) throw new Error(`Cannot create a social image for /${mdxPath.join('/')}.`);

  return createSocialImageResponse(page, await resolveSnippet(mdxPath, page));
}

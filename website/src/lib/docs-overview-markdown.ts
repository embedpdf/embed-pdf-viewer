import { mdast, type AstNode } from '@embedpdf/docs-kit';

import { DOCS_INTEGRATION_LABELS } from './docs-integrations';
import {
  DOCS_ENGINE_FOUNDATION,
  DOCS_OVERVIEW_INTEGRATIONS_LEAD,
  DOCS_OVERVIEW_INTRO,
  DOCS_OVERVIEW_PATHS,
} from './docs-overview';

const { heading, link, list, listItem, paragraph, strong, text } = mdast;

/**
 * `/docs.md` — the landing as an entry map. Every string comes from
 * `docs-overview.ts`, the same module the page component renders, never
 * from this file: the page and its Markdown are two renderings of one
 * content source and cannot drift.
 */
export function projectDocsOverview(absoluteContentUrl: (url: string) => string): AstNode[] {
  const nodes: AstNode[] = [paragraph([text(DOCS_OVERVIEW_INTRO)])];

  for (const path of DOCS_OVERVIEW_PATHS) {
    nodes.push(
      heading(2, path.title),
      paragraph([text(path.description)]),
      list(path.features.map((feature) => listItem([paragraph([text(feature)])]))),
      paragraph([strong(DOCS_OVERVIEW_INTEGRATIONS_LEAD)]),
      list(
        path.integrations.map((integration) =>
          listItem([
            paragraph([
              link(
                absoluteContentUrl(`/docs/${path.id}/${integration}/getting-started`),
                DOCS_INTEGRATION_LABELS[integration],
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  nodes.push(
    heading(2, DOCS_ENGINE_FOUNDATION.title),
    paragraph([text(DOCS_ENGINE_FOUNDATION.description)]),
    list(DOCS_ENGINE_FOUNDATION.features.map((feature) => listItem([paragraph([text(feature)])]))),
    list([
      listItem([
        paragraph([
          link(absoluteContentUrl(DOCS_ENGINE_FOUNDATION.href), DOCS_ENGINE_FOUNDATION.cta),
        ]),
      ]),
      listItem([
        paragraph([
          link(absoluteContentUrl(DOCS_ENGINE_FOUNDATION.apiHref), DOCS_ENGINE_FOUNDATION.apiCta),
        ]),
      ]),
    ]),
  );

  return nodes;
}

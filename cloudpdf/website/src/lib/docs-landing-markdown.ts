import { mdast, type AstNode } from '@embedpdf/docs-kit';

import { getOperationCount, getSdkLanguages } from './api-reference';
import {
  BACKEND_BAND,
  DOCS_LANDING,
  LANDING_DEPLOYMENTS,
  LANDING_PRODUCT_PATHS,
} from './docs-landing';
import {
  docsGettingStartedHref,
  DOCS_INTEGRATION_LABELS,
  PRODUCT_INTEGRATIONS,
} from './docs-integrations';

const { heading, link, list, listItem, paragraph, strong, text } = mdast;

/**
 * `/docs.md` — the landing as an entry map. Every string comes from the
 * modules the page components render (`docs-landing.ts`, the API manifest),
 * never from this file: the page and its Markdown are two renderings of one
 * content source and cannot drift.
 */
export function projectDocsLanding(absoluteContentUrl: (url: string) => string): AstNode[] {
  const nodes: AstNode[] = [paragraph([text(DOCS_LANDING.intro)])];

  for (const path of LANDING_PRODUCT_PATHS) {
    nodes.push(
      heading(2, path.title),
      paragraph([text(path.landing.desc)]),
      list(path.landing.feats.map((feat) => listItem([paragraph([text(feat)])]))),
      paragraph([strong(DOCS_LANDING.frameworksLabel)]),
      list(
        PRODUCT_INTEGRATIONS[path.id].map((integration) =>
          listItem([
            paragraph([
              link(
                absoluteContentUrl(docsGettingStartedHref(path.id, integration)),
                DOCS_INTEGRATION_LABELS[integration],
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  nodes.push(
    heading(2, DOCS_LANDING.deploymentLabel),
    list(
      LANDING_DEPLOYMENTS.map((deployment) =>
        listItem([
          paragraph([
            link(absoluteContentUrl(deployment.href), deployment.title),
            text(` — ${deployment.landing.lead} ${deployment.landing.sub}`),
          ]),
        ]),
      ),
    ),
    heading(2, BACKEND_BAND.title),
    list(
      BACKEND_BAND.steps.map((step) =>
        listItem([
          paragraph([
            link(absoluteContentUrl(step.href), step.title),
            text(` — ${step.description}`),
          ]),
        ]),
      ),
    ),
    paragraph([
      link(
        absoluteContentUrl(BACKEND_BAND.apiReferenceHref),
        BACKEND_BAND.allOperationsLabel(getOperationCount()),
      ),
      text(` — ${BACKEND_BAND.sdksLabel}: `),
      text(
        getSdkLanguages()
          .map((entry) => entry.label)
          .join(', '),
      ),
    ]),
  );

  return nodes;
}

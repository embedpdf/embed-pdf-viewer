import {
  renderDocsMarkdownWith,
  type DocsMarkdownSite,
  type RenderDocsMarkdownOptions,
} from '@embedpdf/docs-kit';

import { DOCS_SITE } from '@/docs-site';

import { collectReactSampleFiles, readCodeFile } from './remark-code-example';

const FRAMEWORKS = ['vanilla', 'react', 'vue', 'svelte', 'angular'];

/**
 * CloudPDF's binding of the kit Markdown projection. React-first: shared
 * pages export with the framework axis pinned to React, matching what the
 * rendered site shows, until the fan-out port.
 */
const site: DocsMarkdownSite = {
  siteOrigin: 'https://www.cloudpdf.com',
  engine: DOCS_SITE.engine,
  resolveExampleFiles: (name) => collectReactSampleFiles(name),
  readCodeFile: (codePath) => readCodeFile(codePath),
  isFramework: (value) => FRAMEWORKS.includes(value),
  variantLabel: () => 'React',
};

export function renderDocsMarkdown(
  options: Omit<RenderDocsMarkdownOptions, 'integration' | 'variantKey'>,
) {
  return renderDocsMarkdownWith(site, {
    ...options,
    integration: 'react',
    variantKey: 'framework',
  });
}

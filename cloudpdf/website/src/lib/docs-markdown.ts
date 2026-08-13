import {
  renderDocsMarkdownWith,
  type DocsMarkdownSite,
  type RenderDocsMarkdownOptions,
} from '@embedpdf/docs-kit';

import { DOCS_SITE } from '@/docs-site';

import { projectCloudPdfComponent } from './api-reference-markdown';
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
  projectComponent: projectCloudPdfComponent,
};

export function renderDocsMarkdown(
  options: Omit<RenderDocsMarkdownOptions, 'integration' | 'variantKey'>,
) {
  // Only the framework-varied corpora carry the axis (and its frontmatter
  // line); the API reference, engine, and server docs are framework-less.
  const frameworkVaried = /^\/docs\/(headless|viewer)(\/|$)/.test(options.canonicalPath);
  return renderDocsMarkdownWith(site, {
    ...options,
    ...(frameworkVaried ? { integration: 'react', variantKey: 'framework' } : {}),
  });
}

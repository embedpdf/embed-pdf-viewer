import { FRAMEWORK_LABELS, type Framework } from './frameworks';

export type DocsOverviewPath = {
  id: 'viewer' | 'headless';
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  cta: string;
  illustration: string;
  features: readonly string[];
  frameworks?: readonly Framework[];
};

export const DOCS_OVERVIEW_PATHS: readonly DocsOverviewPath[] = [
  {
    id: 'viewer',
    title: 'Ready-made Viewer',
    eyebrow: 'Recommended for speed',
    description: 'Embed a polished, production-ready PDF viewer in minutes.',
    href: '/docs/viewer/getting-started',
    cta: 'Start with the Viewer',
    illustration: '/illustration-readymade.svg',
    features: ['Drop-in integration', 'Prebuilt toolbar and layout', 'Framework-neutral API'],
  },
  {
    id: 'headless',
    title: 'Headless Components',
    eyebrow: 'Recommended for customization',
    description: 'Compose your own viewer UI from plugins, components, and reactive bindings.',
    href: '/docs/headless/react/getting-started',
    cta: 'Start with Headless',
    illustration: '/illustration-headless.svg',
    features: ['Own every pixel', 'Composable feature plugins', 'One API across frameworks'],
    frameworks: ['react', 'vue', 'svelte', 'angular'],
  },
];

export const DOCS_ENGINE_FOUNDATION = {
  title: 'EmbedPDF Engine',
  eyebrow: 'The foundation underneath both paths',
  description:
    'Open, inspect, render, edit, and save PDF documents without adopting a UI layer. The local engine runs PDFium through WebAssembly in a Web Worker.',
  href: '/docs/engine/getting-started',
  cta: 'Use the Engine directly',
  features: ['Document I/O', 'Page rendering', 'Text and search', 'Forms and annotations'],
} as const;

export function renderDocsOverviewMarkdown() {
  const paths = DOCS_OVERVIEW_PATHS.map((path) => {
    const frameworks = path.frameworks
      ? `\n\nFrameworks: ${path.frameworks
          .map(
            (framework) =>
              `[${FRAMEWORK_LABELS[framework]}](/docs/headless/${framework}/getting-started)`,
          )
          .join(', ')}.`
      : '';

    return `### ${path.title}\n\n${path.description}\n\n${path.features
      .map((feature) => `- ${feature}`)
      .join('\n')}${frameworks}\n\n[${path.cta}](${path.href})`;
  }).join('\n\n');

  return `# EmbedPDF Documentation

Choose the UI approach that fits your product. Both paths are powered by the same EmbedPDF Engine.

## Choose your UI approach

${paths}

## ${DOCS_ENGINE_FOUNDATION.title}

**${DOCS_ENGINE_FOUNDATION.eyebrow}.** ${DOCS_ENGINE_FOUNDATION.description}

${DOCS_ENGINE_FOUNDATION.features.map((feature) => `- ${feature}`).join('\n')}

[${DOCS_ENGINE_FOUNDATION.cta}](${DOCS_ENGINE_FOUNDATION.href})
`;
}

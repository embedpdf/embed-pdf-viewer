import {
  DOCS_INTEGRATIONS,
  HEADLESS_INTEGRATIONS,
  isDocsIntegration,
  isHeadlessIntegration,
  type DocsIntegration,
} from './docs-integrations';

export type ResolvedDocsPath = {
  contentPath: string[];
  integration?: DocsIntegration;
};

type StaticParam = Record<string, string | string[]>;

/**
 * Maps a public documentation URL back to its canonical content source.
 *
 * `/docs/headless/react/getting-started` and its Vue/Svelte/Angular siblings
 * all resolve to the single `docs/headless/getting-started.mdx` source.
 */
export function resolveDocsPath(mdxPath: string[]): ResolvedDocsPath | null {
  if (mdxPath[0] === 'docs' && mdxPath[1] === 'headless' && mdxPath.length > 2) {
    const integration = mdxPath[2];
    if (!isHeadlessIntegration(integration)) return null;

    return {
      contentPath: [mdxPath[0], mdxPath[1], ...mdxPath.slice(3)],
      integration,
    };
  }

  if (mdxPath[0] === 'docs' && mdxPath[1] === 'viewer' && mdxPath.length > 2) {
    const integration = mdxPath[2];
    if (!isDocsIntegration(integration)) return null;

    return {
      contentPath: [mdxPath[0], mdxPath[1], ...mdxPath.slice(3)],
      integration,
    };
  }

  return { contentPath: mdxPath };
}

/** Fans variant-neutral content entries out into concrete public routes. */
export function expandDocsStaticParams(entries: StaticParam[]) {
  return entries.flatMap((entry) => {
    const value = entry.mdxPath;
    if (!value) return [];
    const mdxPath = Array.isArray(value) ? value : [value];

    if (mdxPath[0] === 'docs' && mdxPath[1] === 'headless' && mdxPath.length > 2) {
      return HEADLESS_INTEGRATIONS.map((integration) => ({
        mdxPath: [mdxPath[0], mdxPath[1], integration, ...mdxPath.slice(2)],
      }));
    }

    if (mdxPath[0] === 'docs' && mdxPath[1] === 'viewer' && mdxPath.length > 2) {
      return DOCS_INTEGRATIONS.map((integration) => ({
        mdxPath: [mdxPath[0], mdxPath[1], integration, ...mdxPath.slice(2)],
      }));
    }

    return [{ mdxPath }];
  });
}

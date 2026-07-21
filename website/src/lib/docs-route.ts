import { FRAMEWORKS, isFramework, type Framework } from './frameworks';

export type ResolvedDocsPath = {
  contentPath: string[];
  framework?: Framework;
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
    const framework = mdxPath[2];
    if (!isFramework(framework)) return null;

    return {
      contentPath: [mdxPath[0], mdxPath[1], ...mdxPath.slice(3)],
      framework,
    };
  }

  return { contentPath: mdxPath };
}

/** Fans one headless content entry out into a concrete route per framework. */
export function expandDocsStaticParams(entries: StaticParam[]) {
  return entries.flatMap((entry) => {
    const value = entry.mdxPath;
    if (!value) return [];
    const mdxPath = Array.isArray(value) ? value : [value];

    if (mdxPath[0] === 'docs' && mdxPath[1] === 'headless' && mdxPath.length > 2) {
      return FRAMEWORKS.map((framework) => ({
        mdxPath: [mdxPath[0], mdxPath[1], framework, ...mdxPath.slice(2)],
      }));
    }

    return [{ mdxPath }];
  });
}

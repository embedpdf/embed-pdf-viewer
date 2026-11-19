/**
 * The frontmatter a docs sidebar reads: titles, Nextra's `display` and `theme`
 * (`normalizePages`), `engines` ({@link pageSupportsEngine}), and the API
 * reference's `method` badge and `audience`.
 */
const SIDEBAR_FRONT_MATTER = [
  'title',
  'sidebarTitle',
  'display',
  'theme',
  'engines',
  'method',
  'audience',
] as const;

type PageMapNode = { frontMatter?: Record<string, unknown>; children?: unknown[] };

/**
 * A site's page map with only the frontmatter its sidebar reads. The docs layout
 * hands the map to a client component, so every docs page carries all of it;
 * every page's `description` and `filePath` alone would add about 50 KB to each.
 * Each page keeps its `frontMatter` key: `normalizePages` tells pages from
 * folders by it.
 */
export function sidebarPageMap<T extends object>(pageMap: T[]): T[] {
  return pageMap.map(trimNode);
}

function trimNode<T extends object>(item: T): T {
  const { frontMatter, children } = item as PageMapNode;
  const trimmed: PageMapNode = { ...item };
  if (frontMatter) {
    trimmed.frontMatter = Object.fromEntries(
      SIDEBAR_FRONT_MATTER.filter((key) => key in frontMatter).map((key) => [
        key,
        frontMatter[key],
      ]),
    );
  }
  if (Array.isArray(children))
    trimmed.children = children.map((child) => trimNode(child as object));
  return trimmed as T;
}

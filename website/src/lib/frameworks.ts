/**
 * The framework axis of the headless docs (DOCS-ARCHITECTURE.md, pillar 1).
 * URLs are /docs/headless/<framework>/<topic>, generated from ONE content
 * file per topic; the framework segment never exists in src/content.
 */
export const FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const DEFAULT_FRAMEWORK: Framework = 'react';
export const FRAMEWORK_COOKIE = 'epdf-fw';

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
};

export function isFramework(value: string | undefined): value is Framework {
  return FRAMEWORKS.includes(value as Framework);
}

/** '/docs/headless/vue/zoom' → 'vue'; anything else → null. */
export function frameworkFromPath(pathname: string): Framework | null {
  const segments = pathname.split('/');
  if (segments[1] === 'docs' && segments[2] === 'headless' && isFramework(segments[3])) {
    return segments[3];
  }
  return null;
}

/** Rewrite a content route to its framework URL: only headless routes change. */
export function frameworkHref(route: string, fw: Framework): string {
  if (!route.startsWith('/docs/headless/') && route !== '/docs/headless') return route;
  const rest = route.slice('/docs/headless'.length);
  return `/docs/headless/${fw}${rest}`;
}

export type Framework = 'react' | 'vue' | 'svelte' | 'angular';
export type NameContext = 'name' | 'prop' | 'state' | 'event';

export const FRAMEWORKS: readonly Framework[];
export const FRAMEWORK_LABELS: Record<Framework, string>;
export const FRAMEWORK_WORDS: Record<
  'hook' | 'hooks' | 'rerenders' | 'props' | 'renderFunction',
  Record<Framework, string>
>;

export function frameworkName(text: string, framework: Framework, context?: NameContext): string;
export function frameworkFromPath(pathname: string): Framework;
export function frameworkHref(href: string, framework: Framework): string;
export function inlineCodeContexts(tree: unknown): Map<unknown, NameContext>;
export function remarkFrameworkNames(): (tree: unknown, file?: unknown) => void;
export function stateIntroParts(
  hook: string,
  framework: Framework,
): Array<{ text: string; code?: boolean }>;
export function frameworkCode(code: string, framework: Framework): string;

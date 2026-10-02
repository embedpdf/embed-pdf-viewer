/** One highlighted file of an example, as the compile stores it and the code card shows it. */
export type CodePanelFile = {
  filename: string;
  code: string;
  language?: string;
  fullPath?: string;
  githubUrl?: string;
  highlightedCode?: string;
};

/** Where a compiled `<Example>` or `<Snippet>` finds its files. */
export type CodePanelRef = { key: string; frameworks: string[] };

/** The props a compiled page gives `<Example>` / `<Snippet>` (besides `name`, `mode`, `kind`). */
export type CodePanelProps = {
  codeKey?: string;
  codeFrameworks?: string;
  demosByFramework?: string;
};

export const CODE_PANELS_DIR: string;

export function codePanelsDir(siteRoot?: string): string;

export function openCodePanels(options: { siteRoot: string; inputs: readonly string[] }): {
  dir: string;
  cacheVersion: string;
};

export function withCodePanelsCache<T extends { cache?: unknown }>(
  webpackConfig: T,
  panels: { cacheVersion: string },
): T;

export function writeCodePanels(
  dir: string,
  name: string,
  byFramework: Record<string, readonly CodePanelFile[] | undefined>,
): CodePanelRef;

export function codePanelAttributes(ref: CodePanelRef): Array<{
  type: 'mdxJsxAttribute';
  name: string;
  value: string;
}>;

export function readCodePanel(dir: string, key: string, framework: string): CodePanelFile[];

export function routeCodePanels(
  options: CodePanelProps & { dir: string; framework: string | null },
): {
  filesByFramework: Record<string, CodePanelFile[]>;
  demosByFramework: Record<string, string>;
  available: string[];
};

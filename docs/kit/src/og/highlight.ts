/**
 * Snippet highlighting for the OG card.
 *
 * Separate from ../../mdx/highlight-code.mjs — which stays THE pipeline for
 * code shown on a page — for three reasons that all point the same way:
 * the card needs a different theme (brand navy, not palenight), a different
 * output form (Satori parses no HTML, so tokens not markup), and it runs in
 * the static-generation pass rather than the webpack pass, so the two would
 * not share an instance even if they shared a theme. Both live in the kit, so
 * a highlighting fix still lands once per concern.
 *
 * The theme is built FROM the palette rather than pinned, so a site that
 * overrides `palette.code` recolours real grammar rather than losing it.
 */
import type { OgCodePalette } from './brand';

/** Languages this corpus actually fences: docs samples plus the seven
 *  generated API-reference SDKs. Anything else falls back to plain text. */
const LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'vue',
  'svelte',
  'html',
  'css',
  'json',
  'markdown',
  'shellscript',
  'bash',
  'python',
  'go',
  'java',
  'csharp',
  'php',
  'ruby',
  'groovy',
] as const;

/** Fence spellings the corpus uses, mapped to the grammar names. Exported
 *  because ./snippet.ts names files from the same vocabulary. */
export const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  console: 'shellscript',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
};

export interface OgToken {
  content: string;
  color: string;
}

export type OgLine = OgToken[];

function ogTheme(code: OgCodePalette) {
  return {
    name: 'docs-og',
    type: 'dark' as const,
    colors: { 'editor.foreground': code.plain, 'editor.background': code.surface },
    settings: [
      { settings: { foreground: code.plain, background: code.surface } },
      {
        scope: [
          'keyword',
          'keyword.control',
          'keyword.operator.new',
          'keyword.operator.expression',
          'storage',
          'storage.type',
          'storage.modifier',
          'constant.language',
          'variable.language',
        ],
        settings: { foreground: code.keyword },
      },
      {
        scope: [
          'entity.name.function',
          'entity.name.type',
          'entity.name.class',
          'entity.name.tag',
          'support.function',
          'support.class',
          'support.type',
          'meta.function-call',
        ],
        settings: { foreground: code.entity },
      },
      {
        scope: ['comment', 'string', 'string.quoted', 'punctuation.definition.string'],
        settings: { foreground: code.muted },
      },
      {
        scope: [
          'punctuation.definition.tag',
          'punctuation.definition.generic',
          'meta.tag punctuation',
        ],
        settings: { foreground: code.punctuation },
      },
    ],
  };
}

let highlighterPromise: Promise<any> | null = null;

function getOgHighlighter(code: OgCodePalette) {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import('shiki');
      return createHighlighter({ themes: [ogTheme(code)], langs: [...LANGS] });
    })();
  }
  return highlighterPromise;
}

/** Tabs would measure as one glyph; the card lays code out in spaces. */
function expandTabs(content: string) {
  return content.replace(/\t/g, '  ');
}

/** Tokenises one snippet into per-line coloured runs. */
export async function highlightOgSnippet(
  codeText: string,
  lang: string | null | undefined,
  palette: OgCodePalette,
): Promise<OgLine[]> {
  const highlighter = await getOgHighlighter(palette);
  const requested = (lang ?? '').toLowerCase();
  const resolved = LANG_ALIASES[requested] ?? requested;
  const usable = (LANGS as readonly string[]).includes(resolved) ? resolved : 'text';

  try {
    const { tokens } = highlighter.codeToTokens(codeText, {
      lang: usable,
      theme: 'docs-og',
    });
    return tokens.map((line: any[]) =>
      line.map((token) => ({
        content: expandTabs(token.content),
        color: token.color ?? palette.plain,
      })),
    );
  } catch {
    // An unhighlightable snippet is still a fine card; it is only ink.
    return codeText
      .split('\n')
      .map((line) => [{ content: expandTabs(line), color: palette.plain }]);
  }
}

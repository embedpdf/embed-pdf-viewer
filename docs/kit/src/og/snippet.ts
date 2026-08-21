/**
 * Choosing the code that goes on a page's social card.
 *
 * The card is a PROJECTION of the page, in the same sense the `.md` export
 * and the search index are (see ../docs-markdown.ts): it reads the tree that
 * one concrete route actually renders, so a card can never advertise an API
 * the page does not show, and never drifts when the page changes. That is
 * also why the snippet is taken VERBATIM and whole — never a sliced window
 * of a longer file, which would put code on a marketing image in an order
 * nobody wrote.
 *
 * The ladder, cheapest first:
 *
 *   1. `ogSnippet` front matter          — the author chose
 *   2. a site's own rung, if it has one  — e.g. cloudpdf's API operations
 *   3. first code block that fits whole  — derived, deterministic
 *   4. the page's first block, faded     — more code than the panel holds
 *   5. nothing                           — the page has no code at all
 *
 * Rung 3 covers most of the corpus on its own: reference pages open on a
 * short interface or call, and where the first block is a whole sample file
 * it keeps walking to a later, smaller one. "Fits" is measured in PANEL ROWS
 * (./panel.ts), not source lines, so a short-but-very-wide block is not
 * selected and then cut off.
 *
 * Rung 4 is what the panel's bottom fade buys. A block longer than the panel
 * is shown FROM ITS START and fades out, which reads as code continuing past
 * the edge — an honest thing to say, and the reason this stays a prefix. A
 * middle slice would not be: it would put code on a marketing image in an
 * order nobody wrote.
 *
 * Sites compose rung 2 themselves — the kit has no opinion about a corpus it
 * cannot see.
 */
import type { AstNode } from '../docs-markdown';
import { canRenderText } from './fonts';
import { LANG_ALIASES } from './highlight';
import { fitsPanel } from './panel';

export interface OgSnippet {
  code: string;
  lang: string | null;
  /** Shown in the card's title bar. */
  filename: string;
}

const EXTENSION_BY_LANG: Record<string, string> = {
  typescript: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  html: 'html',
  css: 'css',
  json: 'json',
  python: 'py',
  go: 'go',
  java: 'java',
  csharp: 'cs',
  php: 'php',
  ruby: 'rb',
  groovy: 'groovy',
};

function normalise(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * `fileNodes` in ../docs-markdown.ts emits `**\`App.tsx\`**` immediately
 * before each projected file, so a sample's real name is recoverable from
 * the code block's previous sibling.
 */
function filenameFromSibling(previous: AstNode | undefined): string | undefined {
  if (previous?.type !== 'paragraph') return undefined;
  const strong = previous.children?.[0];
  if (strong?.type !== 'strong') return undefined;
  const inline = strong.children?.[0];
  if (inline?.type !== 'inlineCode') return undefined;
  return normalise(inline.value);
}

/**
 * Names the file shown in the panel's title bar from the page and the fence
 * spelling. Exported because a site composing its own rung of the ladder
 * (see the header) needs to label its snippet the same way this one does.
 */
export function ogSnippetFilename(lang: string | null, basename: string) {
  if (!lang) return basename;
  // Fences are written `ts`/`sh`; the extension table is keyed by grammar.
  const resolved = LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  if (resolved === 'shellscript' || resolved === 'bash') return 'install.sh';
  const extension = EXTENSION_BY_LANG[resolved];
  return extension ? `${basename}.${extension}` : basename;
}

/** Reads an explicit `ogSnippet` front-matter value in either shape. */
export function snippetFromFrontmatter(value: unknown, basename: string): OgSnippet | null {
  const asString = normalise(value);
  if (asString) {
    return { code: asString, lang: null, filename: ogSnippetFilename(null, basename) };
  }

  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const code = normalise(record.code);
  if (!code) return null;

  const lang = normalise(record.lang) ?? null;
  return {
    code,
    lang,
    filename: normalise(record.filename) ?? ogSnippetFilename(lang, basename),
  };
}

/** Every code block on the page, in document order, already named. */
function collectSnippets(tree: AstNode, basename: string): OgSnippet[] {
  const snippets: OgSnippet[] = [];

  const visit = (node: AstNode) => {
    const children = node.children;
    if (!Array.isArray(children)) return;

    for (let index = 0; index < children.length; index++) {
      const child = children[index];

      if (child.type === 'code') {
        const code = typeof child.value === 'string' ? child.value.replace(/\s+$/, '') : '';
        if (code) {
          const lang = normalise(child.lang) ?? null;
          snippets.push({
            code,
            lang,
            filename: filenameFromSibling(children[index - 1]) ?? ogSnippetFilename(lang, basename),
          });
        }
        continue;
      }

      visit(child);
    }
  };

  visit(tree);
  return snippets;
}

/**
 * Walks the resolved route tree and picks what the panel should show: the
 * first block that sits there whole, else the first block at all, which the
 * card fades out. `basename` names the fallback file label — pass the page's
 * last URL segment.
 */
export function selectOgSnippet(tree: AstNode, basename: string): OgSnippet | null {
  const snippets = collectSnippets(tree, basename);
  // A block needing glyphs the card's faces do not carry is not a candidate
  // at all — see canRenderText.
  const usable = snippets.filter((snippet) => canRenderText(snippet.code));
  return usable.find((snippet) => fitsPanel(snippet.code)) ?? usable[0] ?? null;
}

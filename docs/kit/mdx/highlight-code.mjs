/**
 * The ONE code-highlighting pipeline for both docs sites
 * (DOCS-PLATFORM-ARCHITECTURE.md: code display is kit machinery — a
 * rendering fix lands exactly once, or it will be rediscovered as a bug
 * report on the other site).
 *
 * Sites' rehype passes find their nodes and attach props; everything
 * between — the shiki instance, the theme, and the whitespace rules —
 * lives here. Plain ESM so next.config-graph modules can load it.
 */
import { applyInstallChannel } from './install-channel.mjs';

export const CODE_THEME = 'material-theme-palenight';

let highlighterPromise = null;

/** Lazy shared shiki instance: one theme, every bundled language. */
export function getDocsHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter, bundledLanguages } = await import('shiki');
      return createHighlighter({
        themes: [CODE_THEME],
        langs: Object.keys(bundledLanguages).filter((l) => l !== 'mermaid'),
      });
    })();
  }
  return highlighterPromise;
}

/**
 * Highlight one file's code, returning the file with `highlightedCode` set
 * to the INNER html of shiki's `<code>` (the docs' own `<pre>` shells
 * provide the container).
 *
 * Keep shiki's markup verbatim. Its lines are inline `<span class="line">`
 * joined by real newlines, which the `<pre>` renderer turns into line
 * breaks directly — so an empty line is one `\n` and needs no help. Do
 * NOT inject a `\n` into empty line spans: that only made sense for v2's
 * `display:grid` code where inter-line whitespace was dropped; under a
 * plain `<pre>` it double-spaces every blank line (this exact regression
 * shipped once on cloudpdf.com — see the docs platform architecture doc).
 */
export function highlightCodeFile(highlighter, file) {
  try {
    // Disk-read code files (install.sh samples, codePath sources) flow
    // through here on their way to a panel; stamp the release channel the
    // same way the remark plugin stamps authored fences.
    const code = applyInstallChannel(file.code).trim();
    const highlighted = highlighter.codeToHtml(code, {
      lang: file.language,
      theme: CODE_THEME,
    });
    const innerMatch = highlighted.match(/<code[^>]*>([\s\S]*)<\/code>/);
    const innerHtml = innerMatch ? innerMatch[1] : highlighted;
    return { ...file, code, highlightedCode: innerHtml };
  } catch (err) {
    console.warn(`[docs-kit highlight] Failed to highlight ${file.filename}:`, err);
    return file;
  }
}

/**
 * Build the MDX JSX `files` attribute carrying highlighted file data, so a
 * client `<CodeExample>` receives it as a real array prop.
 */
export function createFilesAttribute(files) {
  const prop = (name, value) => ({
    type: 'Property',
    method: false,
    shorthand: false,
    computed: false,
    key: { type: 'Identifier', name },
    value: { type: 'Literal', value, raw: JSON.stringify(value) },
    kind: 'init',
  });

  const elements = files.map((file) => ({
    type: 'ObjectExpression',
    properties: [
      prop('filename', file.filename),
      prop('code', file.code),
      prop('language', file.language),
      prop('githubUrl', file.githubUrl || ''),
      prop('highlightedCode', file.highlightedCode || ''),
    ],
  }));

  return {
    type: 'mdxJsxAttribute',
    name: 'files',
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: JSON.stringify(files),
      data: {
        estree: {
          type: 'Program',
          body: [
            {
              type: 'ExpressionStatement',
              expression: { type: 'ArrayExpression', elements },
            },
          ],
          sourceType: 'module',
          comments: [],
        },
      },
    },
  };
}

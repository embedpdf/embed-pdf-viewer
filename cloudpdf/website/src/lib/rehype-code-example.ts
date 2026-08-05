import { visit } from 'unist-util-visit';

interface FileInfo {
  filename: string;
  code: string;
  language: string;
  fullPath: string;
  githubUrl?: string;
  highlightedCode?: string;
}

const CODE_THEME = 'material-theme-palenight';

let highlighterPromise: Promise<any> | null = null;

async function getHighlighter() {
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
 * Build an MDX JSX `files` attribute carrying the highlighted file data so the
 * client <CodeExample> component can render it.
 */
function createFilesAttribute(files: FileInfo[]) {
  const prop = (name: string, value: string) => ({
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

/**
 * Rehype plugin that highlights the code collected by `remarkCodeExample` using
 * shiki with a single dark theme (so tokens get direct inline colors).
 */
export const rehypeCodeExample = () => {
  return async (tree: any) => {
    const highlighter = await getHighlighter();
    const nodesToProcess: Array<{ node: any; files: FileInfo[] }> = [];

    visit(tree, (node: any) => {
      if (node.type !== 'mdxJsxFlowElement' || node.name !== 'CodeExample') return;

      const needsHighlighting = node.attributes?.find(
        (attr: any) => attr.name === '__needsHighlighting',
      );
      if (!needsHighlighting) return;

      const filesAttr = node.attributes?.find((attr: any) => attr.name === '__codeFiles');
      if (!filesAttr?.value) return;

      try {
        const files: FileInfo[] = JSON.parse(filesAttr.value);
        nodesToProcess.push({ node, files });
      } catch {
        console.warn('[rehype-code-example] Could not parse __codeFiles');
      }
    });

    for (const { node, files } of nodesToProcess) {
      const highlightedFiles: FileInfo[] = [];

      for (const file of files) {
        try {
          const highlighted = highlighter.codeToHtml(file.code.trim(), {
            lang: file.language,
            theme: CODE_THEME,
          });

          const innerMatch = highlighted.match(/<code[^>]*>([\s\S]*)<\/code>/);
          const innerHtml = (innerMatch ? innerMatch[1] : highlighted).replace(
            /<span class="line"><\/span>/g,
            '<span class="line">\n</span>',
          );

          highlightedFiles.push({ ...file, highlightedCode: innerHtml });
        } catch (err) {
          console.warn(`[rehype-code-example] Failed to highlight ${file.filename}:`, err);
          highlightedFiles.push(file);
        }
      }

      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== '__needsHighlighting' && attr.name !== '__codeFiles',
      );

      node.attributes.push(createFilesAttribute(highlightedFiles));
    }
  };
};

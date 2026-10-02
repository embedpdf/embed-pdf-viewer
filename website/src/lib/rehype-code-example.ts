import {
  codePanelAttributes,
  codePanelsDir,
  writeCodePanels,
} from '@embedpdf/docs-kit/mdx/code-panels';
import {
  createFilesAttribute,
  getDocsHighlighter,
  highlightCodeFile,
} from '@embedpdf/docs-kit/mdx/highlight';
import { visit } from 'unist-util-visit';

interface FileInfo {
  filename: string;
  code: string;
  language: string;
  fullPath: string;
  githubUrl?: string;
  highlightedCode?: string;
}

interface RehypeCodeExampleOptions {
  /**
   * The code panel store `<Example>` and `<Snippet>` files are written to: next.config passes the
   * one `openCodePanels` opened. Defaults to the site's (`.next/cache/docs-code`).
   */
  panelsDir?: string;
}

/**
 * Rehype pass over the code collected by `remarkCodeExample`. This file only
 * finds nodes and attaches props — the highlighter, theme, and whitespace
 * rules are the kit's (`@embedpdf/docs-kit/mdx/highlight`), shared with
 * cloudpdf.com so a rendering fix lands exactly once.
 */
export const rehypeCodeExample = (options: RehypeCodeExampleOptions = {}) => {
  const panelsDir = options.panelsDir ?? codePanelsDir();
  return async (tree: any) => {
    const highlighter = await getDocsHighlighter();
    const nodesToProcess: Array<{ node: any; files: FileInfo[] }> = [];
    const exampleNodes: Array<{
      node: any;
      sample: string;
      byFramework: Record<string, FileInfo[]>;
    }> = [];

    visit(tree, (node: any) => {
      if (node.type !== 'mdxJsxFlowElement') return;

      // Framework-resolved samples (<Example name="…">, <Snippet name="…">): highlight every
      // framework's files and store them; the page keeps a reference and its route reads its
      // framework's files at render (RouteExample).
      if (node.name === 'Example' || node.name === 'Snippet') {
        const attr = node.attributes?.find((a: any) => a.name === '__fwFiles');
        const sample = node.attributes?.find((a: any) => a.name === '__sample')?.value;
        if (!attr?.value || typeof sample !== 'string') return;
        try {
          exampleNodes.push({ node, sample, byFramework: JSON.parse(attr.value) });
        } catch {
          console.warn('[rehype-code-example] Could not parse __fwFiles');
        }
        return;
      }

      if (node.name !== 'CodeExample') return;

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
      const highlightedFiles: FileInfo[] = files.map((file) =>
        highlightCodeFile(highlighter, file),
      );

      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== '__needsHighlighting' && attr.name !== '__codeFiles',
      );

      node.attributes.push(createFilesAttribute(highlightedFiles));
    }

    // Every framework's highlighted files go to the code panel store, not into the page: with
    // four frameworks a page module grew to megabytes, and the docs route compiles every page.
    for (const { node, sample, byFramework } of exampleNodes) {
      const highlighted: Record<string, FileInfo[]> = {};
      for (const [fw, files] of Object.entries(byFramework)) {
        highlighted[fw] = files.map((file) => highlightCodeFile(highlighter, file));
      }
      node.attributes = node.attributes.filter(
        (attr: any) => !['__needsHighlighting', '__fwFiles', '__sample'].includes(attr.name),
      );
      node.attributes.push(...codePanelAttributes(writeCodePanels(panelsDir, sample, highlighted)));
    }
  };
};

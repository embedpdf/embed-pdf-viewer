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

/**
 * Rehype pass over the code collected by `remarkCodeExample`. This file only
 * finds nodes and attaches props — the highlighter, theme, and whitespace
 * rules are the kit's (`@embedpdf/docs-kit/mdx/highlight`), shared with
 * cloudpdf.com so a rendering fix lands exactly once.
 */
export const rehypeCodeExample = () => {
  return async (tree: any) => {
    const highlighter = await getDocsHighlighter();
    const nodesToProcess: Array<{ node: any; files: FileInfo[] }> = [];
    const exampleNodes: Array<{ node: any; byFramework: Record<string, FileInfo[]> }> = [];

    visit(tree, (node: any) => {
      if (node.type !== 'mdxJsxFlowElement') return;

      // Framework-resolved samples (<Example name="…">): highlight every
      // framework's files; the client picks by pathname.
      if (node.name === 'Example') {
        const attr = node.attributes?.find((a: any) => a.name === '__fwFiles');
        if (!attr?.value) return;
        try {
          exampleNodes.push({ node, byFramework: JSON.parse(attr.value) });
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

    for (const { node, byFramework } of exampleNodes) {
      const highlighted: Record<string, FileInfo[]> = {};
      for (const [fw, files] of Object.entries(byFramework)) {
        highlighted[fw] = files.map((file) => highlightCodeFile(highlighter, file));
      }
      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== '__needsHighlighting' && attr.name !== '__fwFiles',
      );
      node.attributes.push({
        type: 'mdxJsxAttribute',
        name: 'filesByFramework',
        value: JSON.stringify(highlighted),
      });
    }
  };
};

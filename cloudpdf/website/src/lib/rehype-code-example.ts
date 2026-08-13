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
 * embedpdf.com so a rendering fix lands exactly once. (The doubled blank
 * lines this site once shipped came from a local copy of this pipeline
 * patching empty line spans — that rule now lives in the kit, fixed.)
 */
export const rehypeCodeExample = () => {
  return async (tree: any) => {
    const highlighter = await getDocsHighlighter();
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
      const highlightedFiles: FileInfo[] = files.map((file) =>
        highlightCodeFile(highlighter, file),
      );

      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== '__needsHighlighting' && attr.name !== '__codeFiles',
      );

      node.attributes.push(createFilesAttribute(highlightedFiles));
    }
  };
};

import type { PdfActionNode, PdfActionTree } from '@embedpdf/engine-core/runtime';

/**
 * Return executable JavaScript in PDF action order (root, then `/Next`
 * depth-first). A poisoned native snapshot is never partially executed.
 */
export function javaScriptSourcesFromActionTree(tree: PdfActionTree): string[] {
  if (tree.incomplete) {
    throw new Error('Refusing to execute an incomplete PDF action tree');
  }

  const sources: string[] = [];
  const visit = (node: PdfActionNode): void => {
    if (node.type === 'javascript' && node.script !== undefined) sources.push(node.script);
    for (const child of node.next) visit(child);
  };
  if (tree.root) visit(tree.root);
  return sources;
}

/** One event source that preserves the tree's shared field overlay. */
export function javaScriptProgramFromActionTree(tree: PdfActionTree): string {
  return javaScriptSourcesFromActionTree(tree).join('\n;\n');
}

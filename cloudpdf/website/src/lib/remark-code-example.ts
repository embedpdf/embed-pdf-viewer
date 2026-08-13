import fs from 'node:fs';
import path from 'node:path';

import { visit } from 'unist-util-visit';

import { collectSampleFiles, readDocsCodeFile, type DocsCodeFile } from './docs-samples';

interface RemarkCodeExampleOptions {
  /**
   * Base GitHub URL for the repository. When omitted, no "View on GitHub"
   * links are generated.
   * Example: 'https://github.com/cloudpdf/cloudpdf/blob/main/cloudpdf/website/'
   */
  githubBaseUrl?: string;
}

/**
 * Remark plugin that processes <CodeExample> components, reading the referenced
 * source files from disk so they can be highlighted and displayed — and the
 * shared-corpus `<Example name="topic/base">`, resolving EVERY framework's
 * files so the client picks by pathname (the fan-out routes).
 *
 * Usage:
 *   <Example name="stage/basic" />
 *   <CodeExample codePath="content/docs/.../example.tsx"><Demo /></CodeExample>
 *   <CodeExample codePaths={["a.tsx", "b.css"]}><Demo /></CodeExample>
 */
let demoManifestCache: Record<string, Record<string, string>> | null = null;
function readDemoManifest(): Record<string, Record<string, string>> {
  if (demoManifestCache) return demoManifestCache;
  try {
    demoManifestCache = JSON.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'public', 'demos', 'demos-manifest.json'),
        'utf-8',
      ),
    );
  } catch {
    demoManifestCache = {};
  }
  return demoManifestCache!;
}

export const remarkCodeExample = (options: RemarkCodeExampleOptions = {}) => {
  const { githubBaseUrl } = options;

  return (tree: any) => {
    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name === 'Example') {
        const nameAttr = node.attributes?.find(
          (attr: any) => attr.type === 'mdxJsxAttribute' && attr.name === 'name',
        );
        if (typeof nameAttr?.value !== 'string') return;
        const byFramework = collectSampleFiles(nameAttr.value, githubBaseUrl);
        node.attributes.push({
          type: 'mdxJsxAttribute',
          name: '__fwFiles',
          value: JSON.stringify(byFramework),
        });
        // Live demos: built by the demo Vite pass before the docs build;
        // presence in the manifest = a mounted preview exists.
        const demos = readDemoManifest()[nameAttr.value];
        if (demos) {
          node.attributes.push({
            type: 'mdxJsxAttribute',
            name: 'demosByFramework',
            value: JSON.stringify(demos),
          });
        }
        node.attributes.push({
          type: 'mdxJsxAttribute',
          name: '__needsHighlighting',
          value: 'true',
        });
        return;
      }

      if (node.name !== 'CodeExample') return;

      const codePathAttr = node.attributes?.find(
        (attr: any) => attr.type === 'mdxJsxAttribute' && attr.name === 'codePath',
      );
      const codePathsAttr = node.attributes?.find(
        (attr: any) => attr.type === 'mdxJsxAttribute' && attr.name === 'codePaths',
      );

      let paths: string[] = [];

      if (codePathAttr?.value && typeof codePathAttr.value === 'string') {
        paths = [codePathAttr.value];
      }

      if (codePathsAttr?.value) {
        const exprValue = codePathsAttr.value;
        if (exprValue?.type === 'mdxJsxAttributeValueExpression') {
          try {
            const estree = exprValue.data?.estree;
            const expr = estree?.body?.[0]?.expression;
            if (expr?.type === 'ArrayExpression') {
              paths = expr.elements
                .filter((el: any) => el?.type === 'Literal' && typeof el.value === 'string')
                .map((el: any) => el.value);
            }
          } catch {
            console.warn('[remark-code-example] Could not parse codePaths expression');
          }
        }
      }

      if (paths.length === 0) return;

      const files: DocsCodeFile[] = paths
        .map((p) => readDocsCodeFile(p, githubBaseUrl))
        .filter((f): f is DocsCodeFile => f !== null);

      if (files.length === 0) return;

      node.attributes = node.attributes.filter(
        (attr: any) => attr.name !== 'codePath' && attr.name !== 'codePaths',
      );
      node.attributes = node.attributes.filter((attr: any) => attr.name !== 'githubUrl');

      node.attributes.push({
        type: 'mdxJsxAttribute',
        name: '__codeFiles',
        value: JSON.stringify(files),
      });

      node.attributes.push({
        type: 'mdxJsxAttribute',
        name: '__needsHighlighting',
        value: 'true',
      });
    });
  };
};

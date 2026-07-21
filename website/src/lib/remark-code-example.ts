import fs from 'node:fs';
import path from 'node:path';

import { visit } from 'unist-util-visit';

interface FileInfo {
  filename: string;
  code: string;
  language: string;
  fullPath: string;
  githubUrl?: string;
}

interface RemarkCodeExampleOptions {
  /**
   * Base GitHub URL for the repository. When omitted, no "View on GitHub"
   * links are generated.
   * Example: 'https://github.com/cloudpdf/cloudpdf/blob/main/ee/website/'
   */
  githubBaseUrl?: string;
}

const languageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  mdx: 'mdx',
};

function readCodeFile(codePath: string, githubBaseUrl?: string): FileInfo | null {
  const absolutePath = path.resolve(process.cwd(), 'src', codePath);

  try {
    const code = fs.readFileSync(absolutePath, 'utf-8');
    const ext = path.extname(codePath).slice(1);
    const filename = path.basename(codePath);

    const repoRelativePath = path.relative(process.cwd(), absolutePath);
    const normalizedPath = repoRelativePath.split(path.sep).join('/');

    return {
      filename,
      code,
      language: languageMap[ext] || ext,
      fullPath: codePath,
      githubUrl: githubBaseUrl ? `${githubBaseUrl}${normalizedPath}` : undefined,
    };
  } catch {
    console.warn(`[remark-code-example] Could not read file: ${absolutePath}`);
    return null;
  }
}

/**
 * Remark plugin that processes <CodeExample> components, reading the referenced
 * source files from disk so they can be highlighted and displayed.
 *
 * Usage:
 *   <CodeExample codePath="content/docs/.../example.tsx"><Demo /></CodeExample>
 *   <CodeExample codePaths={["a.tsx", "b.css"]}><Demo /></CodeExample>
 */
const SAMPLE_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'] as const;

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

/**
 * `<Example name="topic/base" />` — the framework-resolved sample display
 * (DOCS-ARCHITECTURE.md pillar 3). Collects `src/samples/<topic>/<base>.<fw>.*`
 * for EVERY framework at build time (one compiled MDX serves all framework
 * routes); the client component picks the active framework from the pathname.
 * A missing file is an honest gap the component surfaces, not an error.
 */
function collectSampleFiles(name: string, githubBaseUrl?: string) {
  const byFramework: Record<string, FileInfo[]> = {};
  const sampleDir = path.resolve(process.cwd(), 'src', 'samples', path.dirname(name));
  const base = path.basename(name);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(sampleDir);
  } catch {
    console.warn(`[remark-code-example] No sample directory for: ${name}`);
    return byFramework;
  }
  for (const fw of SAMPLE_FRAMEWORKS) {
    const files = entries
      .filter((f) => f.startsWith(`${base}.${fw}.`))
      .map((f) =>
        readCodeFile(
          `samples/${path.dirname(name)}/${f}`.replace(/^samples/, 'samples'),
          githubBaseUrl,
        ),
      )
      .filter((f): f is FileInfo => f !== null)
      // Display names hide the framework infix: basic.react.tsx → basic.tsx
      .map((f) => ({ ...f, filename: f.filename.replace(`.${fw}.`, '.') }));
    if (files.length > 0) byFramework[fw] = files;
  }
  return byFramework;
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
        // Live demos: built by vite.demos.config.ts before the docs build;
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

      const files: FileInfo[] = paths
        .map((p) => readCodeFile(p, githubBaseUrl))
        .filter((f): f is FileInfo => f !== null);

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

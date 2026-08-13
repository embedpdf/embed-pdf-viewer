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
   * Example: 'https://github.com/cloudpdf/cloudpdf/blob/main/cloudpdf/website/'
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
 * Resolve `<Example name="topic/base">` to the React variant's files, both
 * shapes of the shared-corpus convention (docs/content/samples):
 *
 *   <topic>/<base>.react.tsx     single file — the file IS the app
 *   <topic>/<base>.react/        multi-file — entry App.tsx first
 *
 * Display names hide the variant infix (basic.react.tsx → basic.tsx), same
 * as the EmbedPDF site, so readers see the file tree they would write.
 */
function collectReactSampleFiles(name: string, githubBaseUrl?: string): FileInfo[] {
  const sampleDirectory = path.resolve(process.cwd(), 'src', 'samples', path.dirname(name));
  const base = path.basename(name);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(sampleDirectory);
  } catch {
    return [];
  }

  const relativeDir = `samples/${path.dirname(name)}`;

  const variantDir = path.join(sampleDirectory, `${base}.react`);
  if (entries.includes(`${base}.react`) && fs.statSync(variantDir).isDirectory()) {
    return fs
      .readdirSync(variantDir)
      .sort((a, b) => (a === 'App.tsx' ? -1 : b === 'App.tsx' ? 1 : a.localeCompare(b)))
      .map((file) => readCodeFile(`${relativeDir}/${base}.react/${file}`, githubBaseUrl))
      .filter((file): file is FileInfo => file !== null);
  }

  return entries
    .filter((file) => file.startsWith(`${base}.react.`))
    .sort()
    .map((file) => readCodeFile(`${relativeDir}/${file}`, githubBaseUrl))
    .filter((file): file is FileInfo => file !== null)
    .map((file) => ({ ...file, filename: file.filename.replace('.react.', '.') }));
}

/**
 * Remark plugin that processes <CodeExample> components, reading the referenced
 * source files from disk so they can be highlighted and displayed.
 *
 * Usage:
 *   <CodeExample codePath="content/docs/.../example.tsx"><Demo /></CodeExample>
 *   <CodeExample codePaths={["a.tsx", "b.css"]}><Demo /></CodeExample>
 */
export const remarkCodeExample = (options: RemarkCodeExampleOptions = {}) => {
  const { githubBaseUrl } = options;

  return (tree: any) => {
    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      // Shared-corpus `<Example name="topic/base">` (docs/content samples):
      // resolve the React variant's real files and rewrite into an ordinary
      // CodeExample node so the existing highlight + render path owns it.
      // React-first: framework fan-out arrives with the switcher port.
      if (node.name === 'Example') {
        const nameAttr = node.attributes?.find(
          (attr: any) => attr.type === 'mdxJsxAttribute' && attr.name === 'name',
        );
        if (typeof nameAttr?.value !== 'string') return;
        const files = collectReactSampleFiles(nameAttr.value, githubBaseUrl);
        if (files.length === 0) {
          console.warn(`[remark-code-example] No react sample for <Example name="${nameAttr.value}">`);
          return;
        }
        node.name = 'CodeExample';
        node.children = [];
        node.attributes = [
          { type: 'mdxJsxAttribute', name: '__codeFiles', value: JSON.stringify(files) },
          { type: 'mdxJsxAttribute', name: '__needsHighlighting', value: 'true' },
        ];
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

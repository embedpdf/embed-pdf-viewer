import fs from 'node:fs';
import path from 'node:path';

import { DOCS_INTEGRATIONS, type DocsIntegration } from './docs-integrations';

export type DocsExampleVariant = DocsIntegration;
const DOCS_EXAMPLE_VARIANTS = DOCS_INTEGRATIONS;

export type DocsCodeFile = {
  filename: string;
  code: string;
  language: string;
  fullPath: string;
  githubUrl?: string;
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
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
  sh: 'shellscript',
};

function isWithinDirectory(filePath: string, directory: string) {
  const relative = path.relative(directory, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function readDocsCodeFile(codePath: string, githubBaseUrl?: string): DocsCodeFile | null {
  const sourceRoot = path.resolve(process.cwd(), 'src');
  const absolutePath = path.resolve(sourceRoot, codePath);

  if (!isWithinDirectory(absolutePath, sourceRoot)) {
    console.warn(`[docs-samples] Refusing source path outside website/src: ${codePath}`);
    return null;
  }

  try {
    const code = fs.readFileSync(absolutePath, 'utf-8');
    const extension = path.extname(codePath).slice(1);
    const normalizedPath = path.relative(process.cwd(), absolutePath).split(path.sep).join('/');

    return {
      filename: path.basename(codePath),
      code,
      language: LANGUAGE_BY_EXTENSION[extension] || extension,
      fullPath: codePath,
      githubUrl: githubBaseUrl ? `${githubBaseUrl}${normalizedPath}` : undefined,
    };
  } catch {
    console.warn(`[docs-samples] Could not read file: ${absolutePath}`);
    return null;
  }
}

/** Resolves every framework/integration variant of an `<Example name="topic/base" />`. */
export function collectSampleFiles(name: string, githubBaseUrl?: string) {
  const byVariant: Partial<Record<DocsExampleVariant, DocsCodeFile[]>> = {};
  const sampleDirectory = path.resolve(process.cwd(), 'src', 'samples', path.dirname(name));
  const base = path.basename(name);
  let entries: string[] = [];

  try {
    entries = fs.readdirSync(sampleDirectory);
  } catch {
    console.warn(`[docs-samples] No sample directory for: ${name}`);
    return byVariant;
  }

  for (const variant of DOCS_EXAMPLE_VARIANTS) {
    const files = entries
      .filter((file) => file.startsWith(`${base}.${variant}.`))
      .sort()
      .map((file) => readDocsCodeFile(`samples/${path.dirname(name)}/${file}`, githubBaseUrl))
      .filter((file): file is DocsCodeFile => file !== null)
      // Display names hide the variant infix: basic.react.tsx → basic.tsx.
      .map((file) => ({
        ...file,
        filename: file.filename.replace(`.${variant}.`, '.'),
      }));

    if (files.length > 0) byVariant[variant] = files;
  }

  return byVariant;
}

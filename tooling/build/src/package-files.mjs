/**
 * What the framework package scripts (`fully-specify-imports.mjs`, `check-framework-package.mjs`)
 * read from a built or packed package: its files, and the imports in each one.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** Every file under `directory`, recursively. */
export function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** A Svelte component's script blocks: the only place its imports are. */
const SCRIPT_BLOCK = /(<script\b[^>]*>)([\s\S]*?)<\/script>/g;

/**
 * The imports in `code` (static, dynamic, `require`, and `import("…")` types), each with where its
 * specifier's text is. TypeScript's own scanner finds them, so an import in a comment is not one.
 * In a `.svelte` file, only its script blocks are read.
 */
export function importsIn(code, file) {
  if (!file.endsWith('.svelte')) return importsInScript(code, 0);
  return [...code.matchAll(SCRIPT_BLOCK)].flatMap((block) =>
    importsInScript(block[2], block.index + block[1].length),
  );
}

function importsInScript(code, offset) {
  const { importedFiles } = ts.preProcessFile(code, true, true);
  return importedFiles.map(({ fileName, pos }) => {
    // `pos` is at or just before the string literal; the text itself starts at the first match.
    const start = code.indexOf(fileName, pos);
    return { specifier: fileName, start: offset + start, end: offset + start + fileName.length };
  });
}

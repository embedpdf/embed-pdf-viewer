import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = fileURLToPath(new URL('../', import.meta.url));
export const certificatePath = resolve(fixtureRoot, '../keys/TEST-ONLY-signer.cer');
export const fixturePath = (path: string) => resolve(fixtureRoot, path);

export function reportPath(path: string): string {
  const output = process.env.EPDF_WEAK_ANNOTATION_REPORT_DIR;
  if (!output || !isAbsolute(output)) {
    throw new Error(
      'Set EPDF_WEAK_ANNOTATION_REPORT_DIR to an absolute directory outside the corpus.',
    );
  }
  const corpusRoot = resolve(fixtureRoot, '..');
  const inside = relative(corpusRoot, resolve(output));
  if (!inside || (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))) {
    throw new Error('Diagnostic output must not overwrite frozen corpus evidence.');
  }
  const result = resolve(output, path);
  mkdirSync(dirname(result), { recursive: true });
  return result;
}

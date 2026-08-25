import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** `import sql from './x.sql'` → the file contents as a string (mirrors
 *  tsup's `loader: { '.sql': 'text' }`). */
export async function load(url, context, nextLoad) {
  if (url.split('?')[0].endsWith('.sql')) {
    const source = readFileSync(fileURLToPath(url.split('?')[0]), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(source)};`,
    };
  }
  return nextLoad(url, context);
}

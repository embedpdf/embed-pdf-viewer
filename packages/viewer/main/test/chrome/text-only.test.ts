/**
 * Text from a document, its annotations and comments among it, reaches the page only as text:
 * nothing the viewer is built from (the chrome, the React adapter it compiles to Preact, and
 * `@embedpdf/web`) parses a string as HTML. A new HTML sink here fails this test, before a
 * comment could run a script in someone else's viewer.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packages = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** The sources the viewer's interface is built from. */
const SOURCES = ['viewer/chrome/src', 'framework/react/src', 'framework/web/src'];

/** The DOM's ways of turning a string into elements. */
const HTML_SINKS =
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|parseFromString|DOMParser|document\.write)\b/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('the text people read in the viewer', () => {
  it('is never parsed as HTML', () => {
    const sinks = SOURCES.flatMap((source) =>
      filesUnder(join(packages, source)).flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            HTML_SINKS.test(line)
              ? [`${relative(packages, file)}:${index + 1}: ${line.trim()}`]
              : [],
          ),
      ),
    );
    expect(sinks).toEqual([]);
  });
});

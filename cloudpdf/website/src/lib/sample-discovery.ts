import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared sample discovery for the demo Vite passes and the docs collector.
 *
 * A sample VARIANT (one framework's version of `<Example name="topic/base">`)
 * is either shape:
 *
 *   <topic>/<base>.<fw>.<ext>     single file — the file IS the app
 *   <topic>/<base>.<fw>/          multi-file — a directory of real files
 *     App.<ext>                     the entry the demo wrapper mounts
 *     <Anything>.<ext>              siblings, shown as extra tabs
 *
 * The framework infix always rides on the LAST path segment (file or
 * directory), so manifest keys and `<Example name>` stay `topic/base`.
 * Topics nest freely (`viewer/getting-started/...`) — discovery recurses.
 */

/** Entry filename per framework — what the demo mount wrapper imports and
 *  what sorts first in the docs file tabs. */
export const SAMPLE_ENTRY_FILENAMES: Record<string, string> = {
  react: 'App.tsx',
  vue: 'App.vue',
  svelte: 'App.svelte',
  angular: 'app.ts',
};

/** Topics whose samples must not be demo-built yet (their packages don't
 *  exist in the v3 tree — e.g. the ready-made viewer). Docs still show the
 *  code; only the live-preview build skips them. */
export const DEMO_EXCLUDED_TOPICS = ['viewer'];

export type SampleVariant = {
  /** Manifest/entry key: `<topic path>/<base>.<fw>` */
  name: string;
  fw: string;
  /** Absolute path of the module the mount wrapper imports. */
  entry: string;
};

function isExcluded(relativeTopic: string): boolean {
  return DEMO_EXCLUDED_TOPICS.some((t) => relativeTopic === t || relativeTopic.startsWith(`${t}/`));
}

/** Recursively find every demo-buildable sample variant for the given
 *  frameworks. `samplesRoot` is the absolute path of `src/samples`. */
export function discoverSampleVariants(samplesRoot: string, frameworks: string[]): SampleVariant[] {
  const variants: SampleVariant[] = [];
  if (!fs.existsSync(samplesRoot)) return variants;

  const fwPattern = frameworks.join('|');
  const fileRe = new RegExp(`^(.+)\\.(${fwPattern})\\.[a-z]+$`);
  const dirRe = new RegExp(`^(.+)\\.(${fwPattern})$`);

  const walk = (dir: string, relative: string) => {
    if (isExcluded(relative)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const dirMatch = entry.name.match(dirRe);
        if (dirMatch) {
          const entryFile = path.join(dir, entry.name, SAMPLE_ENTRY_FILENAMES[dirMatch[2]]);
          if (fs.existsSync(entryFile)) {
            variants.push({ name: rel, fw: dirMatch[2], entry: entryFile });
          } else {
            console.warn(
              `[sample-discovery] ${rel}/ has no ${SAMPLE_ENTRY_FILENAMES[dirMatch[2]]} entry — skipped`,
            );
          }
        } else {
          walk(path.join(dir, entry.name), rel);
        }
      } else {
        const fileMatch = entry.name.match(fileRe);
        if (fileMatch) {
          variants.push({
            name: rel.replace(/\.[a-z]+$/, ''),
            fw: fileMatch[2],
            entry: path.join(dir, entry.name),
          });
        }
      }
    }
  };

  walk(samplesRoot, '');
  return variants;
}

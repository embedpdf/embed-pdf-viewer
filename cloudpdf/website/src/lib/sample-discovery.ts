import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared sample discovery for the demo Vite passes and the docs collector.
 *
 * A sample variant (one framework's version of `<Example name="topic/base">`)
 * is either shape:
 *
 *   <topic>/<base>.<fw>.<ext>     single file — the file is the app
 *   <topic>/<base>.<fw>/          multi-file — a directory of real files
 *     App.<ext>                     the entry the demo wrapper mounts
 *     <Anything>.<ext>              siblings, shown as extra tabs
 *
 * The framework infix always rides on the last path segment (file or
 * directory), so manifest keys and `<Example name>` stay `topic/base`.
 * Topics nest freely (`viewer/quick-start/...`) — discovery recurses.
 *
 * The ready-made viewer's examples (`viewer/…`) have a plain-HTML version
 * too, `vanilla`: one page, `<base>.vanilla.html`, whose markup and module
 * scripts the demo build mounts (src/lib/vanilla-demo-samples.ts).
 */

/** Entry filename per framework — what the demo mount wrapper imports and
 *  what sorts first in the docs file tabs. Plain HTML has none: its page is
 *  one file. */
export const SAMPLE_ENTRY_FILENAMES: Record<string, string> = {
  react: 'App.tsx',
  vue: 'App.vue',
  svelte: 'App.svelte',
  angular: 'app.ts',
};

/** What a single-file example is, per framework (`<base>.<fw>.<ext>`). Any
 *  other file with a framework infix (an install command, `.react.sh`) is
 *  code to show, not an app to mount. */
export const SAMPLE_EXTENSIONS: Record<string, string> = {
  react: 'tsx',
  vue: 'vue',
  svelte: 'svelte',
  angular: 'ts',
  vanilla: 'html',
};

/** Topics whose samples are never demo-built: the code-only snippets
 *  (`<Snippet name>`), which the sync puts under `snippets/`. Docs still show
 *  the code; only the live-preview build skips them. */
export const DEMO_EXCLUDED_TOPICS = ['snippets'];

export type SampleVariant = {
  /** Manifest/entry key: `<topic path>/<base>.<fw>` */
  name: string;
  fw: string;
  /** Absolute path of the module the mount wrapper imports. */
  entry: string;
};

/**
 * The class that scopes one example's stylesheet on a docs page. A demo mounts
 * into the page itself, not an iframe, and its `<base>.css` uses plain class
 * names (`.toolbar`, `.button`), as a reader copies it. So the demo build
 * prefixes every rule with this class and the demo's mount element carries it:
 * examples on one page never restyle each other or the site. `key` is the
 * framework-neutral `topic/base`.
 */
export function sampleScopeClass(key: string): string {
  return `epdf-example--${key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

function isExcluded(relativeTopic: string): boolean {
  return DEMO_EXCLUDED_TOPICS.some((t) => relativeTopic === t || relativeTopic.startsWith(`${t}/`));
}

/** Recursively find every demo-buildable sample variant for the given
 *  frameworks. `samplesRoot` is the absolute path of `src/samples`. */
export function discoverSampleVariants(samplesRoot: string, frameworks: string[]): SampleVariant[] {
  const variants: SampleVariant[] = [];
  if (!fs.existsSync(samplesRoot)) return variants;

  const fwPattern = frameworks.join('|');
  const fileRe = new RegExp(`^(.+)\\.(${fwPattern})\\.([a-z]+)$`);
  const dirRe = new RegExp(`^(.+)\\.(${fwPattern})$`);

  const walk = (dir: string, relative: string) => {
    if (isExcluded(relative)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const dirMatch = entry.name.match(dirRe);
        const entryName = dirMatch ? SAMPLE_ENTRY_FILENAMES[dirMatch[2]] : undefined;
        if (dirMatch && !entryName) {
          console.warn(
            `[sample-discovery] ${rel}/ skipped: a ${dirMatch[2]} example is one file, ${dirMatch[1]}.${dirMatch[2]}.${SAMPLE_EXTENSIONS[dirMatch[2]]}`,
          );
        } else if (dirMatch && entryName) {
          const entryFile = path.join(dir, entry.name, entryName);
          if (fs.existsSync(entryFile)) {
            variants.push({ name: rel, fw: dirMatch[2], entry: entryFile });
          } else {
            console.warn(`[sample-discovery] ${rel}/ has no ${entryName} entry — skipped`);
          }
        } else {
          walk(path.join(dir, entry.name), rel);
        }
      } else {
        const fileMatch = entry.name.match(fileRe);
        if (fileMatch && fileMatch[3] === SAMPLE_EXTENSIONS[fileMatch[2]]) {
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

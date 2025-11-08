// SvelteDtsResolver.ts
import ts from 'typescript';
import path from 'node:path';
import { createRequire } from 'node:module';

// Minimal local copy of the Resolver type.
// If you can import it from 'unplugin-dts', do that instead.
export interface Resolver {
  name: string;
  supports: (id: string) => boolean | void;
  transform: (payload: {
    id: string;
    code: string;
    root: string;
    outDir: string;
    host: ts.CompilerHost;
    program: ts.Program;
  }) => Promise<
    | { path: string; content: string }[]
    | {
        outputs: { path: string; content: string }[];
        emitSkipped?: boolean;
        diagnostics?: readonly ts.Diagnostic[];
      }
  >;
}

/* ───────────────── helpers ───────────────── */

const SVELTE_RE = /\.svelte$/;

let _svelte2tsx:
  | undefined
  | ((code: string, opts: { filename: string; isTsFile?: boolean; mode: 'dts' | 'ts'; noSvelteComponentTyped?: boolean; version?: string }) => { code: string });

async function getSvelte2Tsx() {
  if (_svelte2tsx) return _svelte2tsx;
  const { svelte2tsx } = await import('svelte2tsx');
  _svelte2tsx = svelte2tsx;
  return _svelte2tsx;
}

/**
 * Resolve the right shim for your Svelte version.
 * - v4/v5+ => svelte-shims-v4.d.ts (no SvelteComponentTyped)
 * - v3     => svelte-shims.d.ts (with SvelteComponentTyped)
 */
function resolveSvelteShim(): { shimPath: string; noSvelteComponentTyped: boolean } {
  // make a CommonJS-like resolver in ESM
  const req = createRequire(import.meta.url);

  try {
    // Svelte 4/5: no SvelteComponentTyped
    const p = req.resolve('svelte2tsx/svelte-shims-v4.d.ts');
    return { shimPath: p, noSvelteComponentTyped: true };
  } catch {
    // Fall back to Svelte 3 shims
    const p = req.resolve('svelte2tsx/svelte-shims.d.ts');
    return { shimPath: p, noSvelteComponentTyped: false };
  }
}

function normalizeSlash(p: string) {
  return p.replace(/\\/g, '/');
}

function relToRoot(root: string, abs: string) {
  const A = normalizeSlash(abs);
  const R = normalizeSlash(root).replace(/\/$/, '');
  return A.startsWith(R + '/') ? A.slice(R.length + 1) : A;
}

/* ───────── per-file DTS emit via a patched TS host (SvelteKit approach) ───────── */

async function emitSingleSvelteDts(
  absFilename: string,
  svelteSource: string,
  rootDir: string
): Promise<Map<string, string>> {
  const outputs = new Map<string, string>();
  const svelte2tsx = await getSvelte2Tsx();
  const { shimPath, noSvelteComponentTyped } = resolveSvelteShim();

  // Create a tiny TS program that “knows” how to read .svelte through svelte2tsx
  const options: ts.CompilerOptions = {
    // critical flags for declaration emit
    declaration: true,
    emitDeclarationOnly: true,
    noEmit: false,
    allowNonTsExtensions: true,
    rootDir: rootDir,
    outDir: rootDir, // we’ll rewrite paths anyway
    sourceMap: false,
    // sensible default to avoid Classic resolution pitfalls
    moduleResolution:
      (ts.ModuleResolutionKind as any).NodeNext ??
      (ts.version.startsWith('5') ? ts.ModuleResolutionKind.Bundler : ts.ModuleResolutionKind.Node10),
  };

  // Cache the transformed code per file
  const transformed = new Map<string, { code: string; isTs: boolean }>();
  const toKey = (p: string) => normalizeSlash(p);

  // prime the cache for this file
  {
    const isTs = /<script\s+[^>]*lang\s*=\s*['"](ts|typescript)['"][^>]*>/.test(svelteSource);
    const out = svelte2tsx(svelteSource, {
      filename: absFilename,
      isTsFile: isTs,
      mode: 'dts',
      noSvelteComponentTyped,
      // version can be passed if you want to force svelte3 behavior
      // version: noSvelteComponentTyped ? undefined : '3.42.0'
    }).code;
    transformed.set(toKey(absFilename), { code: out, isTs });
  }

  const sys = ts.sys;

  const svelteSys: ts.System = {
    ...sys,
    fileExists(p) {
      if (SVELTE_RE.test(p)) return true;
      return sys.fileExists(p);
    },
    readDirectory(dir, exts, exclude, include, depth) {
      const withSvelte = (exts || []).concat('.svelte');
      return sys.readDirectory(dir, withSvelte, exclude, include, depth);
    },
    readFile(p, enc = 'utf-8') {
      // Svelte files: return transformed code
      if (SVELTE_RE.test(p)) {
        const entry = transformed.get(toKey(p));
        if (entry) return entry.code;
        // If TS asks for another .svelte (dependency), transform it on demand
        const source = sys.readFile(p, 'utf-8');
        if (source != null) {
          const isTs = /<script\s+[^>]*lang\s*=\s*['"](ts|typescript)['"][^>]*>/.test(source);
          const out = svelte2tsx(source, {
            filename: p,
            isTsFile: isTs,
            mode: 'dts',
            noSvelteComponentTyped,
          }).code;
          transformed.set(toKey(p), { code: out, isTs });
          return out;
        }
      }
      return sys.readFile(p, enc);
    },
    writeFile(fileName, data) {
      outputs.set(normalizeSlash(fileName), data);
    },
  };

  // Wrap a host that delegates to svelteSys for module resolution
  const host = ts.createCompilerHost(options);
  host.readDirectory = svelteSys.readDirectory;
  host.readFile = svelteSys.readFile;
  host.writeFile = svelteSys.writeFile;

  const resolveMod = (
    name: string,
    containingFile: string,
    compilerOptions: ts.CompilerOptions
  ) => {
    // try TS default first
    const tsResolved = ts.resolveModuleName(name, containingFile, compilerOptions, sys).resolvedModule;
    if (tsResolved && !SVELTE_RE.test(tsResolved.resolvedFileName)) return tsResolved;
    // then fall back to our svelte-aware system
    return ts.resolveModuleName(name, containingFile, compilerOptions, svelteSys).resolvedModule!;
  };

  host.resolveModuleNames = (moduleNames, containingFile, _reused, _redir, compilerOptions) =>
    moduleNames.map((m) => resolveMod(m, containingFile, compilerOptions));
  host.resolveModuleNameLiterals = (lits, containingFile, _redir, compilerOptions) =>
    lits.map((lit) => ({ resolvedModule: resolveMod(lit.text, containingFile, compilerOptions) }));

  // The “program” contains: shims + this .svelte file
  const rootNames = [shimPath, absFilename];
  const program = ts.createProgram({ rootNames, options, host });
  program.emit(undefined, undefined, undefined, true); // declaration emit only

  return outputs;
}

/* ─────────────── Resolver that uses the TS host trick per file ─────────────── */

export function SvelteDtsResolver(): Resolver {
  return {
    name: 'svelte', // overrides the built-in simple resolver
    supports(id) {
      return SVELTE_RE.test(id);
    },
    async transform({ id, code, root }) {
      // Run a per-file TS emit using the SvelteKit-style host
      const outMap = await emitSingleSvelteDts(path.resolve(id), code, path.resolve(root));

      // Find the .d.ts result for this file and return it
      // TS will emit `<abs>/.../YourFile.svelte.d.ts`
      const wanted = normalizeSlash(path.resolve(id)) + '.d.ts';
      const produced = [...outMap.entries()].find(([file]) => file === wanted);

      if (!produced) {
        // If nothing was produced (e.g. diagnostics), fall back to a simple export
        const rel = relToRoot(root, wanted);
        const { noSvelteComponentTyped } = resolveSvelteShim();
        const base = noSvelteComponentTyped ? 'SvelteComponent' : 'SvelteComponentTyped';
        return [{ path: rel, content: `export { ${base} as default } from 'svelte';\n` }];
      }

      const [absPath, content] = produced;
      return [{ path: relToRoot(root, absPath), content }];
    },
  };
}

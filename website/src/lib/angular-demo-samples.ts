import ts from 'typescript';
import type { Plugin } from 'vite';

/**
 * An Angular example as the Angular demo pass (vite.demos-ng.config.ts) compiles it. The demos
 * compile in the browser (JIT), which reads a component's metadata from its decorators, so two
 * things an example writes need turning into what JIT understands:
 *
 * - `input()`, `output()`, `model()` and `viewChild()` have no decorator. Angular's JIT
 *   transform (the one the Angular CLI applies to JIT builds) adds the metadata they stand for;
 *   without it a signal input isn't an input at all.
 * - `styleUrl: './basic.css'` would be fetched from the page's URL. It becomes
 *   `import './basic.css'`, which `sampleStylesheetsPlugin` scopes like every other framework's.
 *
 * Templates are type-checked by `ngc` in the example check (docs/content/scripts/samples.mjs);
 * this pass only builds.
 */

const JIT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  experimentalDecorators: true,
  useDefineForClassFields: false,
  // The transform reads the file's own imports and decorators; nothing else needs loading.
  noResolve: true,
  noLib: true,
  types: [],
};

/** Angular's JIT transform for one program: decorator metadata for the members that have none. */
export type JitTransform = (program: ts.Program) => ts.TransformerFactory<ts.SourceFile>;

/**
 * The JIT transform from the site's `@angular/compiler-cli` (the entry the Angular CLI uses), or
 * null when the site doesn't have it installed.
 */
export async function loadJitTransform(): Promise<JitTransform | null> {
  // A variable, so a site without the package still type-checks.
  const tooling = '@angular/compiler-cli/private/tooling';
  try {
    const { constructorParametersDownlevelTransform } = await import(tooling);
    return constructorParametersDownlevelTransform;
  } catch {
    return null;
  }
}

/** Compile one Angular example file to JavaScript with Angular's JIT transform. */
export function compileForJit(code: string, fileName: string, transform: JitTransform): string {
  const host = ts.createCompilerHost(JIT_OPTIONS);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === fileName
      ? ts.createSourceFile(name, code, languageVersion, true)
      : getSourceFile(name, languageVersion, ...rest);
  host.fileExists = (name) => name === fileName || ts.sys.fileExists(name);
  host.readFile = (name) => (name === fileName ? code : ts.sys.readFile(name));
  const program = ts.createProgram({ rootNames: [fileName], options: JIT_OPTIONS, host });
  let output = '';
  program.emit(
    program.getSourceFile(fileName),
    (name, text) => {
      if (name.endsWith('.js')) output = text;
    },
    undefined,
    false,
    { before: [transform(program)] },
  );
  return output;
}

/** `styleUrl: './basic.css'` or `styleUrls: ['./a.css', …]`, with the comma after it. */
const STYLE_URLS = /\bstyleUrls?\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")\s*,?/g;

/** Turn a component's `styleUrl` (or `styleUrls`) into imports of the same files. */
export function rewriteStyleUrls(code: string): string {
  const imports: string[] = [];
  const rewritten = code.replace(STYLE_URLS, (_, urls: string) => {
    for (const [, url] of urls.matchAll(/['"]([^'"]+)['"]/g)) imports.push(url);
    return '';
  });
  if (imports.length === 0) return code;
  const statements = [...new Set(imports)].map((url) => `import ${JSON.stringify(url)};`);
  return `${statements.join('\n')}\n${rewritten}`;
}

/** Both, on every TypeScript file under `samplesRoot`; a `templateUrl` fails the build. */
export function angularSamplesPlugin(options: { samplesRoot: string }): Plugin {
  const { samplesRoot } = options;
  let jitTransform: JitTransform | null = null;
  return {
    name: 'epdf-angular-samples',
    enforce: 'pre',
    async buildStart() {
      jitTransform = await loadJitTransform();
      if (!jitTransform) {
        this.warn(
          "@angular/compiler-cli isn't installed in this site: an Angular example's signal inputs, outputs and queries won't work in its demo",
        );
      }
    },
    transform(code, id) {
      if (!id.startsWith(samplesRoot) || !id.endsWith('.ts')) return null;
      if (/\btemplateUrl\s*:/.test(code)) {
        this.error(`${id}: an example's template is inline (\`template:\`), never a templateUrl`);
      }
      const compiled = jitTransform ? compileForJit(code, id, jitTransform) : code;
      return { code: rewriteStyleUrls(compiled), map: null };
    },
  };
}

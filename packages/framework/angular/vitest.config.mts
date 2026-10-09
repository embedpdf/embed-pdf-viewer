/**
 * The adapter's tests: vitest in happy-dom, with Angular's TestBed compiling components just in
 * time, zoneless, as an app would run them.
 *
 * JIT needs one thing esbuild can't give it: signal inputs, outputs, queries and models are
 * plain field initializers, and only a TypeScript transform tells the JIT compiler about them
 * (the one the Angular CLI runs for its own tests). So this package's own files are compiled by
 * TypeScript with that transform; everything else (the plugins' sources) goes through vitest's
 * usual esbuild.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { defineConfig, type Plugin } from 'vitest/config';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

function angularJitTransform(): Plugin {
  let program: ts.Program | null = null;
  let transformer: ts.TransformerFactory<ts.SourceFile> | null = null;

  const createProgram = async () => {
    const config = ts.getParsedCommandLineOfConfigFile(
      path.join(packageRoot, 'tsconfig.spec.json'),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
    );
    if (!config) throw new Error('vitest: tsconfig.spec.json could not be read');
    program = ts.createProgram({
      rootNames: config.fileNames,
      options: {
        ...config.options,
        noEmit: false,
        declaration: false,
        sourceMap: false,
        inlineSourceMap: true,
        inlineSources: true,
        importHelpers: false,
        experimentalDecorators: true,
        useDefineForClassFields: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    });
    // The transform the Angular CLI runs on JIT code: signal-based inputs, outputs, queries
    // and models become what the JIT compiler reads.
    const tooling = (await import('@angular/compiler-cli/private/tooling')) as unknown as {
      constructorParametersDownlevelTransform: (
        program: ts.Program,
      ) => ts.TransformerFactory<ts.SourceFile>;
    };
    transformer = tooling.constructorParametersDownlevelTransform(program);
  };

  return {
    name: 'epdf-angular-jit',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!file.startsWith(packageRoot) || file.includes('node_modules')) return null;
      if (!file.endsWith('.ts') || file.endsWith('.d.ts') || file.endsWith('vitest.config.ts')) {
        return null;
      }
      if (!program) await createProgram();
      const sourceFile = program!.getSourceFile(file);
      if (!sourceFile) throw new Error(`vitest: ${file} is not in tsconfig.spec.json`);
      let output = '';
      program!.emit(
        sourceFile,
        (name, text) => {
          if (name.endsWith('.js')) output = text;
        },
        undefined,
        false,
        { before: [transformer!] },
      );
      return { code: output, map: null };
    },
  };
}

export default defineConfig({
  plugins: [angularJitTransform()],
  resolve: {
    alias: [
      {
        find: /^@embedpdf\/angular\/([\w-]+)$/,
        replacement: path.join(packageRoot, '$1/src/public_api.ts'),
      },
    ],
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});

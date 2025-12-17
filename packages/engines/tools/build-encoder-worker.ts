import { build } from 'vite';

/**
 * Build the image encoder worker
 */
export async function bundleEncoderWorker(): Promise<string> {
  const result = await build({
    logLevel: 'silent',
    configFile: false,
    build: {
      write: false,
      lib: {
        entry: 'src/lib/image-encoder/image-encoder-worker.ts',
        formats: ['es'],
        fileName: () => 'encoder-worker.js',
      },
      minify: 'terser',
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  });

  const results = Array.isArray(result) ? result : [result];

  for (const r of results) {
    if ('output' in r) {
      return r.output[0].code;
    }
  }

  throw new Error('vite.build returned a RollupWatcher – cannot extract code');
}

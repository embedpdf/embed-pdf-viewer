// A build that keeps file names and puts its assets in `workers/`, beside the folder of its
// chunks. The engine's worker then lands exactly where the package's own relative URL points from
// a chunk (`../workers/embedpdf-worker.js`), so nothing in the URL shows that a bundler emitted it.
export default {
  build: {
    target: 'es2022',
    rollupOptions: {
      output: { entryFileNames: 'assets/app.js', assetFileNames: 'workers/[name][extname]' },
    },
  },
};

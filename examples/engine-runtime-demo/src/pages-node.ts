import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEngine } from '@embedpdf/engine';
import { createCloudEngine } from '@cloudpdf/engine';
import { buildApp, signDevToken, defaultWorkerEntryUrl, type AppBundle } from '@cloudpdf/server';
import { runPagesDemo, summarizePages } from './pages-demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
// `sample.pdf` is multi-page; required for the reorder walkthrough.
const pdfPath = process.argv[2] ?? resolve(here, '..', 'public', 'sample.pdf');
const bytes = new Uint8Array(await readFile(pdfPath));

const SECRET = 'pages-demo-secret';

let bundle: AppBundle | undefined;
try {
  bundle = await buildApp({
    verifier: { mode: 'hs256', secret: SECRET },
    poolSize: 1,
    workerEntry: defaultWorkerEntryUrl,
  });
  await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const address = bundle.app.server.address();
  if (!address || typeof address === 'string') throw new Error('server failed to bind');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const local = await createLocalEngine({ runtime: { prefer: 'auto' } });
  const cloud = createCloudEngine({
    baseUrl,
    token: signDevToken(SECRET, { sub: 'pages-demo', tenant_id: 'pages-demo-tenant' }),
  });

  const localResult = await runPagesDemo('local (node, native)', local, bytes, 'pages-demo-local');
  const cloudResult = await runPagesDemo(
    'cloud (node -> @cloudpdf/server)',
    cloud,
    bytes,
    'pages-demo-cloud',
  );

  console.log(
    JSON.stringify(
      {
        local: summarizePages(localResult),
        cloud: summarizePages(cloudResult),
      },
      null,
      2,
    ),
  );

  // Geometry-invariant parity: both engines must preserve the PON set and
  // report dense indices. The reorder permutations must also agree.
  // (Per-page revision survival is annotation liveness, asserted by the
  // annotation/reorder conformance suites, not this geometry demo.)
  const errs: string[] = [];
  diffBool(
    'invariants.ponSetPreserved',
    localResult.invariants.ponSetPreserved,
    cloudResult.invariants.ponSetPreserved,
    errs,
  );
  diffBool(
    'invariants.indicesDense',
    localResult.invariants.indicesDense,
    cloudResult.invariants.indicesDense,
    errs,
  );
  diffArr(
    'after.pageOrder (PON sequence)',
    localResult.after.pages.map((p) => p.pageObjectNumber),
    cloudResult.after.pages.map((p) => p.pageObjectNumber),
    errs,
  );

  if (errs.length > 0) {
    console.error('PARITY MISMATCH (page reorder) between local and cloud:');
    for (const e of errs) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    console.log('parity (page reorder + locked invariants): OK');
  }

  await local.destroy();
  await cloud.destroy();
} finally {
  if (bundle) await bundle.shutdown();
}

function diffBool(label: string, a: boolean, b: boolean, errs: string[]): void {
  if (a !== b) errs.push(`${label}: local=${a}, cloud=${b}`);
}
function diffArr(label: string, a: number[], b: number[], errs: string[]): void {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    errs.push(`${label}: local=[${a.join(',')}], cloud=[${b.join(',')}]`);
  }
}

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEngine } from '@embedpdf/engine';
import { createCloudEngine } from '@cloudpdf/engine';
import { buildApp, signDevToken, defaultWorkerEntryUrl, type AppBundle } from '@cloudpdf/server';
import { runEngineDemo, diffMetadata } from './engine-demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] ?? resolve(here, '..', 'public', 'sample.pdf');
const bytes = new Uint8Array(await readFile(pdfPath));

const SECRET = 'engine-demo-secret';

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
  const cloud = createCloudEngineSync(baseUrl);

  const localResult = await runEngineDemo('local (node, native)', local, bytes, 'sample-pdf-local');
  const cloudResult = await runEngineDemo(
    'cloud (node -> @cloudpdf/server)',
    cloud,
    bytes,
    'sample-pdf-cloud',
  );

  console.log(JSON.stringify({ local: localResult, cloud: cloudResult }, null, 2));

  const diffs = diffMetadata(localResult.metadata, cloudResult.metadata);
  if (diffs.length > 0) {
    console.error('PARITY MISMATCH between local and cloud engine:');
    for (const d of diffs) console.error('  ' + d);
    process.exitCode = 1;
  } else {
    console.log('parity: OK');
  }

  await local.destroy();
  await cloud.destroy();
} finally {
  if (bundle) await bundle.shutdown();
}

function createCloudEngineSync(baseUrl: string) {
  return createCloudEngine({
    baseUrl,
    token: signDevToken(SECRET, { sub: 'demo', tenant_id: 'demo-tenant' }),
  });
}

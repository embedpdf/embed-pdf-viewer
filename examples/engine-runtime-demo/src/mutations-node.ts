import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEngine } from '@embedpdf/engine';
import { createCloudEngine } from '@cloudpdf/engine';
import { buildApp, signDevToken, defaultWorkerEntryUrl, type AppBundle } from '@cloudpdf/server';
import { runMutationsDemo, summarizeMutations } from './mutations-demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] ?? resolve(here, '..', 'public', 'annotations.pdf');
const bytes = new Uint8Array(await readFile(pdfPath));

const TEST_PAGE = 3;
const SECRET = 'mutations-demo-secret';

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
    token: signDevToken(SECRET, { sub: 'mutations-demo', tenant_id: 'mutations-demo-tenant' }),
  });

  const localResult = await runMutationsDemo(
    'local (node, native)',
    local,
    bytes,
    TEST_PAGE,
    'mutations-demo-local',
  );
  const cloudResult = await runMutationsDemo(
    'cloud (node -> @cloudpdf/server)',
    cloud,
    bytes,
    TEST_PAGE,
    'mutations-demo-cloud',
  );

  console.log(
    JSON.stringify(
      {
        local: summarizeMutations(localResult),
        cloud: summarizeMutations(cloudResult),
      },
      null,
      2,
    ),
  );

  // Parity check: both engines should bump the revision the same number
  // of times and report the same impact envelope shape. We don't compare
  // the engine-stamped UUIDs (they're random by design) or session ids.
  const errs: string[] = [];
  diffNum(
    'createA.meta.generation',
    mutationGeneration(localResult.createdA.meta),
    mutationGeneration(cloudResult.createdA.meta),
    errs,
  );
  diffNum(
    'createB.meta.generation',
    mutationGeneration(localResult.createdB.meta),
    mutationGeneration(cloudResult.createdB.meta),
    errs,
  );
  diffNum(
    'moveSingle.meta.generation',
    mutationGeneration(localResult.movedSingle.meta),
    mutationGeneration(cloudResult.movedSingle.meta),
    errs,
  );
  diffNum(
    'moveBatch.meta.generation',
    mutationGeneration(localResult.movedBatch.meta),
    mutationGeneration(cloudResult.movedBatch.meta),
    errs,
  );
  diffNum(
    'deleteA.meta.generation',
    mutationGeneration(localResult.deletedA.meta),
    mutationGeneration(cloudResult.deletedA.meta),
    errs,
  );
  diffNum(
    'deleteB.meta.generation',
    mutationGeneration(localResult.deletedB.meta),
    mutationGeneration(cloudResult.deletedB.meta),
    errs,
  );
  diffStr(
    'createA.meta.shouldRefetch',
    localResult.createdA.meta.shouldRefetch?.reason ?? null,
    cloudResult.createdA.meta.shouldRefetch?.reason ?? null,
    errs,
  );
  diffStr(
    'moveBatch.meta.shouldRefetch',
    localResult.movedBatch.meta.shouldRefetch?.reason ?? null,
    cloudResult.movedBatch.meta.shouldRefetch?.reason ?? null,
    errs,
  );
  diffStr(
    'updated.identityQuality',
    localResult.updated?.updated.identityQuality ?? '<skipped>',
    cloudResult.updated?.updated.identityQuality ?? '<skipped>',
    errs,
  );
  diffStr(
    'updated.ref.kind',
    localResult.updated?.updated.ref.kind ?? '<skipped>',
    cloudResult.updated?.updated.ref.kind ?? '<skipped>',
    errs,
  );
  diffNum(
    'moveBatch.moved.length',
    localResult.movedBatch.moved.length,
    cloudResult.movedBatch.moved.length,
    errs,
  );

  if (errs.length > 0) {
    console.error('PARITY MISMATCH (mutation impact) between local and cloud:');
    for (const e of errs) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    console.log('parity (mutation impact): OK');
  }

  await local.destroy();
  await cloud.destroy();
} finally {
  if (bundle) await bundle.shutdown();
}

function diffNum(label: string, a: number, b: number, errs: string[]): void {
  if (a !== b) errs.push(`${label}: local=${a}, cloud=${b}`);
}
function diffStr(label: string, a: string | null, b: string | null, errs: string[]): void {
  if (a !== b) errs.push(`${label}: local=${a ?? 'null'}, cloud=${b ?? 'null'}`);
}
function mutationGeneration(meta: { affectedPages: Array<{ revision: { generation: number } }> }) {
  return meta.affectedPages[0]?.revision.generation ?? -1;
}

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEngine } from '@embedpdf/engine';
import { cloudEngine } from '@cloudpdf/engine';
import { signDevToken, defaultWorkerEntryUrl, type AppBundle } from '@cloudpdf/server';
import { buildAppForTesting } from '../../../cloudpdf/server/src/app/buildApp.ts';
import { createValidTestLicenseGate } from '../../../cloudpdf/server/src/licensing/testing.ts';
import { runMutationsDemo, summarizeMutations } from './mutations-demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] ?? resolve(here, '..', 'public', 'annotations.pdf');
const bytes = new Uint8Array(await readFile(pdfPath));

const TEST_PAGE = 3;
const SECRET = 'mutations-demo-secret';

let bundle: AppBundle | undefined;
try {
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    poolSize: 1,
    workerEntry: defaultWorkerEntryUrl,
  });
  await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const address = bundle.app.server.address();
  if (!address || typeof address === 'string') throw new Error('server failed to bind');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const local = await createLocalEngine({ runtime: { prefer: 'auto' } });
  const cloud = cloudEngine({
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

  // Parity check: both engines should report the same impact envelope
  // shape: the same kinds of ref changed, on the same pages.
  const errs: string[] = [];
  diffStr(
    'createA.meta',
    impactOf(localResult.createdA.meta),
    impactOf(cloudResult.createdA.meta),
    errs,
  );
  diffStr(
    'createB.meta',
    impactOf(localResult.createdB.meta),
    impactOf(cloudResult.createdB.meta),
    errs,
  );
  diffStr(
    'moveSingle.meta',
    impactOf(localResult.movedSingle.meta),
    impactOf(cloudResult.movedSingle.meta),
    errs,
  );
  diffStr(
    'moveBatch.meta',
    impactOf(localResult.movedBatch.meta),
    impactOf(cloudResult.movedBatch.meta),
    errs,
  );
  diffStr(
    'deleteA.meta',
    impactOf(localResult.deletedA.meta),
    impactOf(cloudResult.deletedA.meta),
    errs,
  );
  diffStr(
    'deleteB.meta',
    impactOf(localResult.deletedB.meta),
    impactOf(cloudResult.deletedB.meta),
    errs,
  );
  diffStr(
    'updated.ref.kind',
    localResult.updated?.annotation.ref.kind ?? '<skipped>',
    cloudResult.updated?.annotation.ref.kind ?? '<skipped>',
    errs,
  );
  diffNum(
    'moveBatch.moved.length',
    localResult.movedBatch.annotations.length,
    cloudResult.movedBatch.annotations.length,
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
/** What a write reports it touched: the pages, and the kinds of ref it changed. */
function impactOf(meta: {
  affectedPages: Array<{ objectNumber: number }>;
  changed: Array<{ kind: string }>;
}): string {
  const pages = meta.affectedPages.map((page) => page.objectNumber).join(',');
  return `pages=${pages} changed=${meta.changed.map((ref) => ref.kind).join(',')}`;
}

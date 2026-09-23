import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEngine } from '@embedpdf/engine';
import { createCloudEngine } from '@cloudpdf/engine';
import { diffAnnotationListSnapshotAll } from '@embedpdf/engine-core/conformance';
import { signDevToken, defaultWorkerEntryUrl, type AppBundle } from '@cloudpdf/server';
import { buildAppForTesting } from '../../../cloudpdf/server/src/app/buildApp.ts';
import { createValidTestLicenseGate } from '../../../cloudpdf/server/src/licensing/testing.ts';
import { runAnnotationsDemo, summarizeRawAll } from './annotations-demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] ?? resolve(here, '..', 'public', 'annotations.pdf');
const bytes = new Uint8Array(await readFile(pdfPath));

const SECRET = 'engine-demo-secret';

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
  const cloud = createCloudEngine({
    baseUrl,
    token: signDevToken(SECRET, { sub: 'annot-demo', tenant_id: 'annot-demo-tenant' }),
  });

  const localResult = await runAnnotationsDemo(
    'local (node, native)',
    local,
    bytes,
    'annotations-pdf-local',
  );
  const cloudResult = await runAnnotationsDemo(
    'cloud (node -> @cloudpdf/server)',
    cloud,
    bytes,
    'annotations-pdf-cloud',
  );

  console.log(
    JSON.stringify(
      {
        local: {
          label: localResult.label,
          elapsedMs: localResult.elapsedMs,
          summary: summarizeRawAll(localResult.rawAll),
        },
        cloud: {
          label: cloudResult.label,
          elapsedMs: cloudResult.elapsedMs,
          summary: summarizeRawAll(cloudResult.rawAll),
        },
      },
      null,
      2,
    ),
  );

  const rawDiffs = diffAnnotationListSnapshotAll(localResult.rawAll, cloudResult.rawAll);
  if (rawDiffs.length > 0) {
    console.error('PARITY MISMATCH (listRawAll) between local and cloud:');
    for (const d of rawDiffs) console.error('  ' + d);
    process.exitCode = 1;
  } else {
    console.log('parity (listRawAll): OK');
  }

  const localPageObjectNumbers = Object.keys(localResult.fullByPage);
  const cloudPageObjectNumbers = Object.keys(cloudResult.fullByPage);
  if (localPageObjectNumbers.join(',') !== cloudPageObjectNumbers.join(',')) {
    console.error(
      `PARITY MISMATCH (page registry): local=${localPageObjectNumbers.join(',')} vs cloud=${cloudPageObjectNumbers.join(',')}`,
    );
    process.exitCode = 1;
  } else {
    for (const pageObjectNumber of localPageObjectNumbers) {
      const fullDiffs = diffAnnotationListSnapshotAll(
        { pages: [localResult.fullByPage[Number(pageObjectNumber)]!] },
        { pages: [cloudResult.fullByPage[Number(pageObjectNumber)]!] },
      );
      if (fullDiffs.length > 0) {
        console.error(`PARITY MISMATCH (page ${pageObjectNumber} list) between local and cloud:`);
        for (const d of fullDiffs) console.error('  ' + d);
        process.exitCode = 1;
      } else {
        console.log(`parity (page ${pageObjectNumber} list): OK`);
      }
    }
  }

  await local.destroy();
  await cloud.destroy();
} finally {
  if (bundle) await bundle.shutdown();
}

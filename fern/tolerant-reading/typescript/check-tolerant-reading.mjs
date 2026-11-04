// Reads the fixture the way the client reads an annotation list response.
import { readFileSync } from 'node:fs';

import { CloudPDFClient } from '../../../cloudpdf/sdk/dist/esm/index.mjs';

const body = readFileSync(process.env.CLOUDPDF_FIXTURE, 'utf8');
const client = new CloudPDFClient({
  baseUrl: 'https://engine.example.test',
  token: 'token',
  fetch: async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
});
const list = await client.doc.annotations.list({
  docId: 'doc',
  layerName: 'default',
  pageKey: 'obj:3',
});
console.log(`annotations: ${list.annotations.length}`);

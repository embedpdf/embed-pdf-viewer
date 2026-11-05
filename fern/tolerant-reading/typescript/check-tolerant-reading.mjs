// Reads the fixtures the way the client reads an annotation list and a form response.
import { readFileSync } from 'node:fs';

import { CloudPDFClient } from '../../../cloudpdf/sdk/dist/esm/index.mjs';

const annotations = readFileSync(process.env.CLOUDPDF_ANNOTATIONS_FIXTURE, 'utf8');
const form = readFileSync(process.env.CLOUDPDF_FORM_FIXTURE, 'utf8');
const client = new CloudPDFClient({
  baseUrl: 'https://engine.example.test',
  token: 'token',
  fetch: async (url) =>
    new Response(String(url).endsWith('/form') ? form : annotations, {
      headers: { 'content-type': 'application/json' },
    }),
});
const list = await client.doc.annotations.list({
  docId: 'doc',
  layerName: 'default',
  pageKey: 'obj:3',
});
console.log(`annotations: ${list.annotations.length}`);
const fields = await client.doc.forms.list({ docId: 'doc', layerName: 'default' });
console.log(`fields: ${fields.fields.length}`);

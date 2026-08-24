import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  assertCanonicalCloudPdfCasing,
  findNoncanonicalCloudPdfCasings,
  maskMarkdownLinkDestinations,
} from './sdk-casing.mjs';

test('allows canonical package and brand casing while ignoring Markdown link destinations', () => {
  const outputDirectory = mkdtempSync(`${tmpdir()}/cloudpdf-casing-`);
  try {
    mkdirSync(`${outputDirectory}/src/CloudPDF`, { recursive: true });
    writeFileSync(
      `${outputDirectory}/README.md`,
      '# CloudPDF SDK\n\n[CloudPDF](https://example.com/Cloudpdf?utm_source=CloudPdf)\n',
    );
    writeFileSync(
      `${outputDirectory}/src/CloudPDF/client.ts`,
      'export class CloudPDFClient {}\nexport const packageName = "cloudpdf";\n',
    );
    writeFileSync(`${outputDirectory}/binary.jar`, Buffer.from([0, 67, 108, 111, 117, 100]));

    assert.deepEqual(findNoncanonicalCloudPdfCasings(outputDirectory), []);
    assert.doesNotThrow(() => assertCanonicalCloudPdfCasing(outputDirectory));
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('rejects mixed casing in generated text and paths', () => {
  const outputDirectory = mkdtempSync(`${tmpdir()}/cloudpdf-casing-`);
  try {
    mkdirSync(`${outputDirectory}/src/CloudpdfHelpers`, { recursive: true });
    writeFileSync(
      `${outputDirectory}/src/client.php`,
      'class CloudPdfPagination {}\nconst CLOUDPDF_API_KEY = "value";\n',
    );

    const violations = findNoncanonicalCloudPdfCasings(outputDirectory);
    assert(violations.some((violation) => violation.includes('CloudpdfHelpers')));
    assert(violations.some((violation) => violation.includes('CloudPdf')));
    assert(violations.some((violation) => violation.includes('CLOUDPDF')));
    assert.throws(
      () => assertCanonicalCloudPdfCasing(outputDirectory),
      /Generated SDK contains noncanonical CloudPDF casing/,
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('masks inline, reference, autolink, and HTML destinations but not visible labels', () => {
  const markdown = `[CloudPdf](https://example.com/Cloudpdf)
[reference]: https://example.com/Cloudpdf
<https://example.com/Cloudpdf>
<a href="https://example.com/Cloudpdf">CloudPdf</a>
`;
  const masked = maskMarkdownLinkDestinations(markdown);

  assert.match(masked, /^\[CloudPdf\]/);
  assert.match(masked, />CloudPdf<\/a>/);
  assert.doesNotMatch(masked, /example\.com\/Cloudpdf/);
});

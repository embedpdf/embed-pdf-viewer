import { createHash } from 'node:crypto';

import { expect, test } from 'vitest';

import {
  deriveConnectedReportingCredential,
  REPORTING_CREDENTIAL_PREFIX,
} from '../src/licensing/reporting-credential';

// Fixed cross-runtime vectors. The control plane pins the same values
// (apps/control-plane/test/reporting-credential.test.ts in cloudpdf-platform);
// a change that breaks one side breaks connected usage reporting.
const VECTORS = [
  {
    cloudpdfLicenseId: '0b19ed08-59a4-4d3e-8f37-6c3a1c2f9d10',
    credential: 'cpr_v1_dorzyB3nrGIMBT84M2ZRg7YlDJvVRtvhA57pegzhoI4',
    licenseKey: 'DEMO-KEY-1234-5678',
    verifierSha256: '45b092d876e835e678b7a4006e63657e8c52e15423c918b1275397c851dff089',
  },
  {
    // Surrounding whitespace is trimmed before derivation.
    cloudpdfLicenseId: '11111111-2222-3333-4444-555555555555',
    credential: 'cpr_v1_t4Fw-LK1JSxofHQhThWEpF7q6bHiXvRXQ43AJi1ndps',
    licenseKey: '  KEY-TRIM-TEST  ',
    verifierSha256: 'ccbc2249e3f9b445fd86b9ff314426277168c078b4f3f8eea7077a480e3dec4b',
  },
  {
    // Non-ASCII input pins the UTF-8 encoding of both HMAC inputs.
    cloudpdfLicenseId: '99999999-8888-7777-6666-555555555555',
    credential: 'cpr_v1_fgyCpNrlsZQpdplnbwcfWi5vGJdYfa-UBeSw3BNqXDY',
    licenseKey: 'clé-δ',
    verifierSha256: '7ecbfce933cc2250119c5b5446de7f4f29357f1ffe1f6428e0207a31a9f57af7',
  },
];

test('derives the pinned reporting credentials', () => {
  for (const vector of VECTORS) {
    const credential = deriveConnectedReportingCredential(vector);
    expect(credential).toBe(vector.credential);
    expect(credential.startsWith(REPORTING_CREDENTIAL_PREFIX)).toBe(true);
    expect(createHash('sha256').update(credential).digest('hex')).toBe(vector.verifierSha256);
  }
});

test('binds the credential to the license record', () => {
  const base = deriveConnectedReportingCredential({
    cloudpdfLicenseId: 'license-a',
    licenseKey: 'KEY-ONE',
  });
  expect(
    deriveConnectedReportingCredential({ cloudpdfLicenseId: 'license-b', licenseKey: 'KEY-ONE' }),
  ).not.toBe(base);
  expect(
    deriveConnectedReportingCredential({ cloudpdfLicenseId: 'license-a', licenseKey: 'KEY-TWO' }),
  ).not.toBe(base);
});

test('rejects empty inputs', () => {
  expect(() =>
    deriveConnectedReportingCredential({ cloudpdfLicenseId: ' ', licenseKey: 'KEY' }),
  ).toThrow(/license ID/);
  expect(() =>
    deriveConnectedReportingCredential({ cloudpdfLicenseId: 'id', licenseKey: '  ' }),
  ).toThrow(/license key/);
});

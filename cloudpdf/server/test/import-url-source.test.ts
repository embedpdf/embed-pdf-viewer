/**
 * UrlImportSource unit tests: the SSRF posture (scheme allowlist,
 * private-network vetting, redirect refusal), the open-then-read
 * length contract, and the sanitized-diagnostics rule (no query
 * strings anywhere — a presigned query string IS the credential).
 *
 * A local node:http server plays the source; those tests run with
 * `allowHttp` + `allowPrivateNetworks` (the dev/MinIO posture).
 * Default-policy tests assert rejection BEFORE any connection.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { isPubliclyRoutableAddress, UrlImportSource } from '../src/import/adapters/UrlImportSource';
import { defaultImportPolicy, ImportPolicySchema } from '../src/import/config/ImportPolicySchema';
import { loadImportPolicyFromEnv } from '../src/import/config/loadImportPolicyFromEnv';
import { ImportSourceError } from '../src/import/ImportSource';

const BODY = Buffer.from('%PDF-1.7 unit-source body');

let srv: Server;
let port = 0;

beforeAll(async () => {
  srv = createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/ok')) {
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': String(BODY.byteLength),
      });
      res.end(BODY);
      return;
    }
    if (url.startsWith('/missing')) {
      res.writeHead(404);
      res.end('nope');
      return;
    }
    if (url.startsWith('/redirect')) {
      res.writeHead(302, { location: '/ok' });
      res.end();
      return;
    }
    if (url.startsWith('/no-length')) {
      // write() before end() forces chunked transfer-encoding.
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.write(BODY);
      res.end();
      return;
    }
    res.writeHead(500);
    res.end('boom');
  });
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  port = (srv.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => srv.close(() => resolve()));
});

const devPolicy = () =>
  ImportPolicySchema.parse({ allowHttp: true, allowPrivateNetworks: true });

function local(path: string): string {
  return `http://127.0.0.1:${port}${path}?X-Sig=TOPSECRETSIG`;
}

async function openErr(source: UrlImportSource): Promise<ImportSourceError> {
  const err = await source.open({ signal: new AbortController().signal }).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImportSourceError);
  return err as ImportSourceError;
}

describe('isPubliclyRoutableAddress', () => {
  test('refuses loopback, RFC1918, CGNAT, link-local/metadata, ULA, mapped forms', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.9.9',
      '192.168.1.1',
      '100.64.0.1',
      '169.254.169.254',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.5',
      'not-an-ip',
    ]) {
      expect(isPubliclyRoutableAddress(ip), ip).toBe(false);
    }
  });
  test('accepts public unicast', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '52.219.1.10', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPubliclyRoutableAddress(ip), ip).toBe(true);
    }
  });
});

describe('UrlImportSource policy gates (no connection attempted)', () => {
  test('http is refused unless allowHttp', () => {
    expect(() => new UrlImportSource({ url: 'http://example.com/a.pdf', policy: defaultImportPolicy() }))
      .toThrowError(/CLOUDPDF_IMPORT_ALLOW_HTTP/);
  });
  test('non-http(s) schemes and invalid URLs are refused', () => {
    expect(() => new UrlImportSource({ url: 'ftp://example.com/a.pdf', policy: devPolicy() }))
      .toThrowError(/unsupported source scheme/);
    expect(() => new UrlImportSource({ url: 'not a url', policy: devPolicy() }))
      .toThrowError(/valid absolute URL/);
  });
  test('embedded credentials are refused', () => {
    expect(() => new UrlImportSource({ url: 'https://user:pw@example.com/a.pdf', policy: devPolicy() }))
      .toThrowError(/must not embed credentials/);
  });
  test('info.location never carries the query string', () => {
    const s = new UrlImportSource({
      url: 'https://bucket.s3.amazonaws.com/inv/2026/a.pdf?X-Amz-Signature=TOPSECRETSIG',
      policy: defaultImportPolicy(),
    });
    expect(s.info.location).toBe('https://bucket.s3.amazonaws.com/inv/2026/a.pdf');
    expect(JSON.stringify(s.info)).not.toContain('TOPSECRETSIG');
  });
  test('private literals and loopback hostnames are refused before connecting', async () => {
    const literal = new UrlImportSource({
      // Port 1 would be an instant connection error — a 'policy' code
      // proves the vet fired BEFORE any connection was attempted.
      url: 'https://127.0.0.1:1/a.pdf',
      policy: defaultImportPolicy(),
    });
    expect((await openErr(literal)).code).toBe('policy');

    const metadata = new UrlImportSource({
      url: 'https://169.254.169.254/latest/meta-data',
      policy: defaultImportPolicy(),
    });
    expect((await openErr(metadata)).code).toBe('policy');

    const byName = new UrlImportSource({
      url: 'https://localhost:1/a.pdf',
      policy: defaultImportPolicy(),
    });
    expect((await openErr(byName)).code).toBe('policy');
  });
});

describe('UrlImportSource open()', () => {
  test('happy path: declared length + streamed bytes', async () => {
    const s = new UrlImportSource({ url: local('/ok'), policy: devPolicy() });
    const opened = await s.open({ signal: new AbortController().signal });
    expect(opened.contentLength).toBe(BODY.byteLength);
    expect(opened.contentType).toContain('application/pdf');
    const chunks: Buffer[] = [];
    for await (const c of opened.body) chunks.push(Buffer.from(c as Uint8Array));
    expect(Buffer.concat(chunks)).toEqual(BODY);
  });
  test('404 maps to terminal not_found with a query-free message', async () => {
    const s = new UrlImportSource({ url: local('/missing'), policy: devPolicy() });
    const err = await openErr(s);
    expect(err.code).toBe('not_found');
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain('TOPSECRETSIG');
  });
  test('redirects are refused', async () => {
    const s = new UrlImportSource({ url: local('/redirect'), policy: devPolicy() });
    const err = await openErr(s);
    expect(err.code).toBe('unsupported');
    expect(err.message).toMatch(/redirect/);
  });
  test('missing Content-Length is refused', async () => {
    const s = new UrlImportSource({ url: local('/no-length'), policy: devPolicy() });
    const err = await openErr(s);
    expect(err.code).toBe('unsupported');
    expect(err.message).toMatch(/Content-Length/);
  });
  test('declared length above the cap is refused as too_large', async () => {
    const tiny = ImportPolicySchema.parse({ allowHttp: true, allowPrivateNetworks: true, maxBytes: 4 });
    const s = new UrlImportSource({ url: local('/ok'), policy: tiny });
    const err = await openErr(s);
    expect(err.code).toBe('too_large');
  });
  test('source 5xx is retryable upstream', async () => {
    const s = new UrlImportSource({ url: local('/boom'), policy: devPolicy() });
    const err = await openErr(s);
    expect(err.code).toBe('upstream');
    expect(err.retryable).toBe(true);
  });
  test('an aborted signal maps to retryable upstream', async () => {
    const s = new UrlImportSource({ url: local('/ok'), policy: devPolicy() });
    const ac = new AbortController();
    ac.abort();
    const err = await s.open({ signal: ac.signal }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ImportSourceError);
    expect((err as ImportSourceError).retryable).toBe(true);
  });
});

describe('loadImportPolicyFromEnv', () => {
  test('defaults are the safe-hosted posture', () => {
    const p = loadImportPolicyFromEnv({});
    expect(p.enabled).toBe(true);
    expect(p.allowHttp).toBe(false);
    expect(p.allowPrivateNetworks).toBe(false);
    expect(p.maxBytes).toBe(128 * 1024 * 1024);
  });
  test('env overrides parse', () => {
    const p = loadImportPolicyFromEnv({
      CLOUDPDF_IMPORT_ENABLED: '0',
      CLOUDPDF_IMPORT_MAX_BYTES: '1024',
      CLOUDPDF_IMPORT_TIMEOUT_MS: '5000',
      CLOUDPDF_IMPORT_MAX_CONCURRENT: '2',
      CLOUDPDF_IMPORT_ALLOW_HTTP: 'true',
      CLOUDPDF_IMPORT_ALLOW_PRIVATE_NETWORKS: '1',
    });
    expect(p).toMatchObject({
      enabled: false,
      maxBytes: 1024,
      timeoutMs: 5000,
      maxConcurrent: 2,
      allowHttp: true,
      allowPrivateNetworks: true,
    });
  });
  test('non-numeric numbers refuse to parse', () => {
    expect(() => loadImportPolicyFromEnv({ CLOUDPDF_IMPORT_MAX_BYTES: 'lots' })).toThrowError(
      /CLOUDPDF_IMPORT_MAX_BYTES/,
    );
  });
});

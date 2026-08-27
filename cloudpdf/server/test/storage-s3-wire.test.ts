import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { S3ObjectStore } from '../src/storage/adapters/S3ObjectStore';

const MIN_AWS_DATA_CHUNK_SIZE = 8 * 1024;
const clients: S3Client[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
});

describe('S3ObjectStore AWS wire compatibility', () => {
  test('reproduces the real S3 rejection when an unbuffered stream emits small chunks', async () => {
    await withStrictS3Endpoint(async ({ endpoint, uploadedChunkSizes }) => {
      const store = new S3ObjectStore({
        bucket: 'strict-wire-test',
        region: 'us-east-1',
        client: newClient(endpoint, false),
      });
      const body = oneKibChunks(24 * 1024);
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      try {
        await expect(
          store.put('tenant/docs/strict/base.pdf', body, { contentLength: 24 * 1024 }),
        ).rejects.toThrow(
          'Only the last chunk is allowed to have a size less than 8192 bytes. ' +
            'Set [requestStreamBufferSize=number e.g. 65_536] in client constructor',
        );
        expect(warning).toHaveBeenCalledWith(
          'An error was encountered in a non-retryable streaming request.',
        );
      } finally {
        warning.mockRestore();
      }

      expect(uploadedChunkSizes).toHaveLength(24);
      expect(uploadedChunkSizes.slice(0, -1).every((size) => size < 8 * 1024)).toBe(true);
    });
  });

  test('64 KiB request buffering produces an S3-valid wire stream', async () => {
    await withStrictS3Endpoint(async ({ endpoint, uploadedChunkSizes }) => {
      await withFakeAwsCredentials(async () => {
        // No injected client: exercise the exact construction path used by
        // production deployments, including its stream-buffer configuration.
        const store = new S3ObjectStore({
          bucket: 'strict-wire-test',
          region: 'us-east-1',
          endpoint,
        });
        const contentLength = 160 * 1024;

        await expect(
          store.put('tenant/docs/strict/base.pdf', oneKibChunks(contentLength), { contentLength }),
        ).resolves.toMatchObject({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
      });

      expect(uploadedChunkSizes.length).toBeGreaterThan(1);
      expect(uploadedChunkSizes.slice(0, -1).every((size) => size >= MIN_AWS_DATA_CHUNK_SIZE)).toBe(
        true,
      );
    });
  });
});

function newClient(endpoint: string, requestStreamBufferSize: number | false): S3Client {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'strict-wire-test-access-key',
      secretAccessKey: 'strict-wire-test-secret-key',
    },
    requestChecksumCalculation: 'WHEN_SUPPORTED',
    requestStreamBufferSize,
  });
  clients.push(client);
  return client;
}

async function withFakeAwsCredentials(run: () => Promise<void>): Promise<void> {
  const previousAccessKey = process.env['AWS_ACCESS_KEY_ID'];
  const previousSecretKey = process.env['AWS_SECRET_ACCESS_KEY'];
  const previousSessionToken = process.env['AWS_SESSION_TOKEN'];
  process.env['AWS_ACCESS_KEY_ID'] = 'strict-wire-test-access-key';
  process.env['AWS_SECRET_ACCESS_KEY'] = 'strict-wire-test-secret-key';
  delete process.env['AWS_SESSION_TOKEN'];
  try {
    await run();
  } finally {
    restoreEnv('AWS_ACCESS_KEY_ID', previousAccessKey);
    restoreEnv('AWS_SECRET_ACCESS_KEY', previousSecretKey);
    restoreEnv('AWS_SESSION_TOKEN', previousSessionToken);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function oneKibChunks(contentLength: number): Readable {
  return Readable.from(
    (async function* () {
      let remaining = contentLength;
      while (remaining > 0) {
        const size = Math.min(1024, remaining);
        yield Buffer.alloc(size, remaining % 251);
        remaining -= size;
        // Preserve the deliberately hostile source boundaries instead of
        // letting a synchronous producer get coalesced before the SDK sees it.
        await yieldToEventLoop();
      }
    })(),
  );
}

interface StrictS3Endpoint {
  endpoint: string;
  uploadedChunkSizes: number[];
}

async function withStrictS3Endpoint(
  run: (fixture: StrictS3Endpoint) => Promise<void>,
): Promise<void> {
  const uploadedChunkSizes: number[] = [];
  const server = createServer((req, res) => {
    handleStrictS3Request(req, res, uploadedChunkSizes).catch((err: unknown) => {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : String(err));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('strict S3 endpoint has no port');

  try {
    await run({ endpoint: `http://127.0.0.1:${address.port}`, uploadedChunkSizes });
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function handleStrictS3Request(
  req: IncomingMessage,
  res: ServerResponse,
  uploadedChunkSizes: number[],
): Promise<void> {
  if (req.method !== 'PUT') {
    res.statusCode = 405;
    res.end();
    return;
  }

  const body = await readRequest(req);
  if (req.headers['content-encoding']?.includes('aws-chunked')) {
    uploadedChunkSizes.push(...parseAwsDataChunkSizes(body));
    const nonFinal = uploadedChunkSizes.slice(0, -1);
    const badChunkSize = nonFinal.find((size) => size < MIN_AWS_DATA_CHUNK_SIZE);
    if (badChunkSize !== undefined) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/xml');
      res.setHeader('x-amz-request-id', 'strict-wire-request');
      res.end(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Error>' +
          '<Code>InvalidChunkSizeError</Code>' +
          '<Message>Only the last chunk is allowed to have a size less than 8192 bytes</Message>' +
          `<BadChunkSize>${badChunkSize}</BadChunkSize>` +
          '<RequestId>strict-wire-request</RequestId>' +
          '</Error>',
      );
      return;
    }
  }

  if (req.headers['x-amz-copy-source']) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/xml');
    res.end(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<CopyObjectResult>' +
        '<ETag>"strict-wire-etag"</ETag>' +
        '<LastModified>2026-08-27T00:00:00.000Z</LastModified>' +
        '</CopyObjectResult>',
    );
    return;
  }

  res.statusCode = 200;
  res.setHeader('etag', '"strict-wire-etag"');
  res.end();
}

async function readRequest(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

function parseAwsDataChunkSizes(body: Buffer): number[] {
  const sizes: number[] = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf('\r\n', offset);
    if (lineEnd < 0) throw new Error('malformed aws-chunked body: missing size terminator');
    const sizeToken = body.subarray(offset, lineEnd).toString('ascii').split(';', 1)[0];
    const size = Number.parseInt(sizeToken ?? '', 16);
    if (!Number.isFinite(size)) throw new Error('malformed aws-chunked body: invalid size');
    offset = lineEnd + 2;
    if (size === 0) return sizes;
    if (offset + size + 2 > body.length) {
      throw new Error('malformed aws-chunked body: truncated data chunk');
    }
    sizes.push(size);
    offset += size;
    if (body.subarray(offset, offset + 2).toString('ascii') !== '\r\n') {
      throw new Error('malformed aws-chunked body: missing data terminator');
    }
    offset += 2;
  }
  throw new Error('malformed aws-chunked body: missing final chunk');
}

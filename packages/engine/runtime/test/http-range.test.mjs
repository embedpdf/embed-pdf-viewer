import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HTTP_RANGE_CHUNK,
  HttpRangeCache,
  RangeUnavailable,
  parseContentRangeTotal,
  rangeValidator,
} from '../src/wasm/http-range.ts';

function contentRange(start, end, total) {
  return `bytes ${start}-${end}/${total}`;
}

function memoryTransport(bytes, { status = 206, rewrite } = {}) {
  const reads = [];
  return {
    reads,
    read(start, end, validator) {
      reads.push({ start, end, validator });
      if (rewrite) return rewrite(start, end, validator);
      const slice = bytes.subarray(start, end + 1);
      return {
        status,
        bytes: slice.slice(),
        contentRange: contentRange(start, end, bytes.byteLength),
      };
    },
  };
}

test('parseContentRangeTotal accepts an exact inclusive range', () => {
  assert.equal(parseContentRangeTotal('bytes 0-0/12', 0, 0), 12);
  assert.equal(parseContentRangeTotal('bytes 8-11/12', 8, 11), 12);
  assert.equal(parseContentRangeTotal('bytes 0-0/*'), null);
  assert.equal(parseContentRangeTotal('bytes 1-0/12', 1, 0), null);
  assert.equal(parseContentRangeTotal('bytes 0-0/12', 1, 0), null);
});

test('rangeValidator keeps a strong ETag and otherwise Last-Modified', () => {
  assert.equal(rangeValidator('"abc"', 'Mon, 1 Jan 2024 00:00:00 GMT'), '"abc"');
  assert.equal(rangeValidator('W/"abc"', 'Mon, 1 Jan 2024 00:00:00 GMT'), 'Mon, 1 Jan 2024 00:00:00 GMT');
  assert.equal(rangeValidator(null, null), null);
});

test('reads are served from aligned chunks and a chunk is fetched once', () => {
  const bytes = new Uint8Array(HTTP_RANGE_CHUNK + 10);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
  const transport = memoryTransport(bytes);
  const cache = new HttpRangeCache(transport, bytes.length, '"v1"', 8);

  const first = cache.read(6, 4);
  assert.deepEqual([...first], [6, 7, 8, 9]);
  assert.deepEqual(transport.reads, [
    { start: 0, end: 7, validator: '"v1"' },
    { start: 8, end: 15, validator: '"v1"' },
  ]);

  cache.read(2, 2);
  assert.equal(transport.reads.length, 2);

  const tail = cache.read(HTTP_RANGE_CHUNK - 1, 3);
  assert.deepEqual([...tail], [
    bytes[HTTP_RANGE_CHUNK - 1],
    bytes[HTTP_RANGE_CHUNK],
    bytes[HTTP_RANGE_CHUNK + 1],
  ]);
  assert.equal(transport.reads.length, 4);
  assert.deepEqual(transport.reads[2], { start: HTTP_RANGE_CHUNK - 8, end: HTTP_RANGE_CHUNK - 1, validator: '"v1"' });
  assert.deepEqual(transport.reads[3], {
    start: HTTP_RANGE_CHUNK,
    end: HTTP_RANGE_CHUNK + 7,
    validator: '"v1"',
  });
});

test('a non-206 range fails instead of mixing in another representation', () => {
  const transport = memoryTransport(new Uint8Array(4), {
    rewrite: () => ({ status: 200, bytes: new Uint8Array([9, 9, 9, 9]), contentRange: null }),
  });
  const cache = new HttpRangeCache(transport, 4, null, 4);
  assert.throws(() => cache.read(0, 1), RangeUnavailable);
});

test('a read past the file is refused before any request', () => {
  const transport = memoryTransport(new Uint8Array(4));
  const cache = new HttpRangeCache(transport, 4, null, 4);
  assert.throws(() => cache.read(3, 2), RangeError);
  assert.equal(transport.reads.length, 0);
});

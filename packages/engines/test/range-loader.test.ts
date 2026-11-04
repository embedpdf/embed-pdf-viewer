import { PdfRangeLoader, PdfRangeRepresentationChangedError } from '../src/lib/pdfium/range-loader';

function range_requester(bytes: Uint8Array, requests: Array<[number, number]>) {
  return (_url: string, start: number, end: number) => {
    requests.push([start, end]);
    const response_end = Math.min(end, bytes.length - 1);
    return {
      status: 206,
      data: bytes.slice(start, response_end + 1),
      content_range: `bytes ${start}-${response_end}/${bytes.length}`,
    };
  };
}

function expect_representation_change(read: () => void, content: Uint8Array) {
  try {
    read();
    throw new Error('Expected the representation change to be detected');
  } catch (error) {
    expect(error).toBeInstanceOf(PdfRangeRepresentationChangedError);
    expect((error as PdfRangeRepresentationChangedError).content).toEqual(content);
  }
}

describe('PdfRangeLoader', () => {
  it('loads aligned chunks on demand and reuses cached chunks', () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, index) => index);
    const requests: Array<[number, number]> = [];
    const loader = new PdfRangeLoader('book.pdf', undefined, 4, range_requester(bytes, requests));

    expect(loader.file_length).toBe(10);
    expect(loader.content).toBeUndefined();
    expect(loader.read(2, 5)).toEqual(Uint8Array.from([2, 3, 4, 5, 6]));
    expect(loader.read(0, 8)).toEqual(bytes.slice(0, 8));
    expect(requests).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });

  it('uses a full response when the server ignores ranges', () => {
    const bytes = Uint8Array.from([0, 1, 2, 3, 4, 0]).subarray(1, 5);
    let request_count = 0;
    const loader = new PdfRangeLoader('book.pdf', undefined, 2, () => {
      request_count += 1;
      return { status: 200, data: bytes, content_range: null };
    });

    expect(new Uint8Array(loader.content!)).toEqual(bytes);
    expect(loader.read(1, 2)).toEqual(Uint8Array.from([2, 3]));
    expect(request_count).toBe(1);
  });

  it('uses a matching full response after partial content', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    let request_count = 0;
    const loader = new PdfRangeLoader('book.pdf', undefined, 2, () => {
      request_count += 1;
      if (request_count === 1) {
        return { status: 206, data: bytes.slice(0, 2), content_range: 'bytes 0-1/6' };
      }
      return { status: 200, data: bytes, content_range: null };
    });

    expect(loader.read(0, 6)).toEqual(bytes);
    expect(new Uint8Array(loader.content!)).toEqual(bytes);
    expect(request_count).toBe(2);
  });

  it('falls back to a full request after a later range fails', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    let request_count = 0;
    const loader = new PdfRangeLoader(
      'book.pdf',
      undefined,
      2,
      () => {
        request_count += 1;
        return request_count === 1
          ? { status: 206, data: bytes.slice(0, 2), content_range: 'bytes 0-1/4' }
          : { status: 416, data: new Uint8Array(), content_range: null };
      },
      () => ({ status: 200, data: bytes, content_range: null }),
    );

    expect(loader.read(0, 4)).toEqual(bytes);
    expect(new Uint8Array(loader.content!)).toEqual(bytes);
    expect(request_count).toBe(2);
  });

  it('rejects an unpinned full response that conflicts with cached bytes', () => {
    const loader = new PdfRangeLoader('book.pdf', undefined, 2, (_url, start) =>
      start === 0
        ? { status: 206, data: Uint8Array.from([1, 2]), content_range: 'bytes 0-1/4' }
        : { status: 200, data: Uint8Array.from([9, 2, 3, 4]), content_range: null },
    );

    expect_representation_change(() => loader.read(2, 2), Uint8Array.from([9, 2, 3, 4]));
  });

  it('rejects a conflicting full fallback after a failed range', () => {
    const replacement = Uint8Array.from([9, 2, 3, 4]);
    let request_count = 0;
    const loader = new PdfRangeLoader(
      'book.pdf',
      undefined,
      2,
      () => {
        request_count += 1;
        return request_count === 1
          ? { status: 206, data: Uint8Array.from([1, 2]), content_range: 'bytes 0-1/4' }
          : { status: 416, data: new Uint8Array(), content_range: null };
      },
      () => ({ status: 200, data: replacement, content_range: null }),
    );

    expect_representation_change(() => loader.read(2, 2), replacement);
  });

  it('pins later requests to the initial HTTP representation', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const if_ranges: Array<string | undefined> = [];
    const loader = new PdfRangeLoader(
      'book.pdf',
      undefined,
      2,
      (_url, start, end, _options, if_range) => {
        if_ranges.push(if_range);
        return {
          status: 206,
          data: bytes.slice(start, end + 1),
          content_range: `bytes ${start}-${end}/4`,
          etag: start === 0 ? '"revision-1"' : null,
          last_modified: 'Mon, 01 Jan 2024 00:00:00 GMT',
        };
      },
    );

    loader.read(2, 2);
    expect(if_ranges).toEqual([undefined, '"revision-1"']);
  });

  it('restarts instead of mixing revisions after If-Range returns a full response', () => {
    const initial = Uint8Array.from([1, 2]);
    const replacement = Uint8Array.from([3, 4, 5, 6]);
    let request_count = 0;
    const loader = new PdfRangeLoader('book.pdf', undefined, 2, () => {
      request_count += 1;
      return request_count === 1
        ? {
            status: 206,
            data: initial,
            content_range: 'bytes 0-1/4',
            etag: '"revision-1"',
          }
        : { status: 200, data: replacement, content_range: null, etag: '"revision-2"' };
    });

    expect_representation_change(() => loader.read(2, 2), replacement);
  });

  it('falls back to full content after a malformed partial response', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const loader = new PdfRangeLoader(
      'book.pdf',
      undefined,
      4,
      () => ({ status: 206, data: bytes.slice(0, 2), content_range: 'bytes 0-1/4' }),
      () => ({ status: 200, data: bytes, content_range: null }),
    );

    expect(new Uint8Array(loader.content!)).toEqual(bytes);
  });

  it('rejects malformed and inconsistent partial responses', () => {
    expect(
      () =>
        new PdfRangeLoader('book.pdf', undefined, 4, () => ({
          status: 206,
          data: Uint8Array.from([1]),
          content_range: null,
        })),
    ).toThrow('valid Content-Range');

    expect(
      () =>
        new PdfRangeLoader('book.pdf', undefined, 4, () => ({
          status: 206,
          data: Uint8Array.from([1]),
          content_range: 'bytes 0-3/10',
        })),
    ).toThrow('does not match');

    expect(
      () =>
        new PdfRangeLoader('book.pdf', undefined, 4, () => ({
          status: 206,
          data: Uint8Array.from([1, 2]),
          content_range: 'bytes 0-1/10',
        })),
    ).toThrow('does not match');
  });

  it('rejects invalid reads before making another request', () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    let request_count = 0;
    const requester = range_requester(bytes, []);
    const loader = new PdfRangeLoader('book.pdf', undefined, 2, (url, start, end) => {
      request_count += 1;
      return requester(url, start, end);
    });

    expect(() => loader.read(-1, 1)).toThrow('Invalid PDF byte range');
    expect(() => loader.read(3, 2)).toThrow('out of bounds');
    expect(request_count).toBe(1);
  });
});

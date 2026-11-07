import { describe, expect, test } from 'vitest';

import { resolvePageExtract, type PageExtractRights } from '../../src/dto/PageExtract';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';

/**
 * `pages.extract()`'s options, checked the same way on both engines: a plain
 * copy needs `doc.download`; a flattened one `doc.download` or
 * `doc.download.flattened`, and paints what the caller may read.
 */

const everything: PageExtractRights = {
  download: true,
  downloadFlattened: true,
  annotations: true,
  formFields: true,
};

describe('resolvePageExtract', () => {
  test('a plain copy is null, and needs doc.download', () => {
    expect(resolvePageExtract(undefined, everything)).toBeNull();
    expect(resolvePageExtract({}, everything)).toBeNull();
    expect(() => resolvePageExtract({}, { ...everything, download: false })).toThrow(
      expect.objectContaining({ code: EngineErrorCode.Forbidden, required: 'doc.download' }),
    );
  });

  test('the include options take flatten', () => {
    for (const options of [{ includeAnnotations: true }, { includeFormFields: false }]) {
      expect(() => resolvePageExtract(options, everything)).toThrow(
        expect.objectContaining({ code: EngineErrorCode.InvalidArg }),
      );
    }
  });

  test('a flattened copy is for display unless it says print, and paints what the caller may read', () => {
    expect(resolvePageExtract({ flatten: {} }, everything)).toEqual({
      usage: 'display',
      includeAnnotations: true,
      includeFormFields: true,
    });
    expect(
      resolvePageExtract({ flatten: { usage: 'print' } }, { ...everything, annotations: false }),
    ).toEqual({ usage: 'print', includeAnnotations: false, includeFormFields: true });
    expect(
      resolvePageExtract({ flatten: { usage: 'print' }, includeAnnotations: false }, everything),
    ).toEqual({ usage: 'print', includeAnnotations: false, includeFormFields: false });
  });

  test('a flattened copy takes doc.download or doc.download.flattened', () => {
    const flattened = { flatten: { usage: 'print' as const } };
    expect(resolvePageExtract(flattened, { ...everything, download: false })).not.toBeNull();
    expect(
      resolvePageExtract(flattened, { ...everything, downloadFlattened: false }),
    ).not.toBeNull();
    expect(() =>
      resolvePageExtract(flattened, { ...everything, download: false, downloadFlattened: false }),
    ).toThrow(
      expect.objectContaining({
        code: EngineErrorCode.Forbidden,
        anyOf: ['doc.download', 'doc.download.flattened'],
      }),
    );
  });

  test('asking to paint what the caller may not read is refused', () => {
    expect(() =>
      resolvePageExtract(
        { flatten: {}, includeAnnotations: true },
        { ...everything, annotations: false },
      ),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.Forbidden }));
  });

  test('an unknown usage is refused', () => {
    expect(() =>
      resolvePageExtract({ flatten: { usage: 'screen' as 'print' } }, everything),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.InvalidArg }));
  });
});

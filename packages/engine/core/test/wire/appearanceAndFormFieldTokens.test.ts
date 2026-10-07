import { describe, expect, test } from 'vitest';

import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { unflatten } from '../../src/wire/flatten';
import {
  annotationAppearancesImageOptionsToToken,
  renderImageOptionsToToken,
} from '../../src/wire/renderOptionsCodec';
import {
  AnnotationAppearancesQuerySchema,
  PageRenderAnnotatedQuerySchema,
  PageRenderQuerySchema,
} from '../../src/wire/schemas';
import { decodeAnnotationAppearancesRenderToken, decodeRenderToken } from '../../src/wire/tokens';

const appearanceQueryOf = (token: string) =>
  AnnotationAppearancesQuerySchema.parse(unflatten(decodeAnnotationAppearancesRenderToken(token)));

describe('the appearance render token', () => {
  test('carries modes only when it asks for fewer than every mode, in one spelling', () => {
    const versions = { annotationVersion: 4 };
    const every = annotationAppearancesImageOptionsToToken({ format: 'webp' }, versions);
    expect(every).not.toContain('modes');
    expect(
      annotationAppearancesImageOptionsToToken(
        { format: 'webp', modes: ['rollover', 'down', 'normal'] },
        versions,
      ),
    ).toBe(every);
    const some = annotationAppearancesImageOptionsToToken(
      { format: 'webp', modes: ['down', 'normal'] },
      versions,
    );
    expect(some).toContain('modes=normal-down');
    expect(appearanceQueryOf(some).options.modes).toEqual(['normal', 'down']);
  });

  test('refuses an empty modes list, and modes in another spelling', () => {
    expect(() =>
      annotationAppearancesImageOptionsToToken(
        { format: 'webp', modes: [] },
        { annotationVersion: 4 },
      ),
    ).toThrow(expect.objectContaining({ code: EngineErrorCode.InvalidArg }));
    expect(() => appearanceQueryOf('annotationVersion=4,format=webp,modes=down-normal')).toThrow();
    expect(() =>
      appearanceQueryOf('annotationVersion=4,format=webp,modes=normal-rollover-down'),
    ).toThrow();
  });
});

describe('the page render token', () => {
  const versions = { contentVersion: 2, annotationVersion: 5 };

  test('carries formFields only when an annotated render leaves them out', () => {
    const shown = renderImageOptionsToToken({ format: 'webp' }, versions);
    expect(shown).not.toContain('formFields');
    const left = renderImageOptionsToToken({ format: 'webp', includeFormFields: false }, versions);
    expect(left).toContain('formFields=false');
    const query = PageRenderAnnotatedQuerySchema.parse(unflatten(decodeRenderToken(left)));
    expect(query.options).toMatchObject({ includeAnnotations: true, includeFormFields: false });
  });

  test('a render without annotations has no form fields to leave out', () => {
    const token = renderImageOptionsToToken(
      { format: 'webp', includeAnnotations: false, includeFormFields: false },
      { contentVersion: 2 },
    );
    expect(token).not.toContain('formFields');
    expect(() =>
      PageRenderQuerySchema.parse(
        unflatten(decodeRenderToken('contentVersion=2,format=webp,formFields=false')),
      ),
    ).toThrow();
  });
});

import { describe, expect, test } from 'vitest';

import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { unflatten } from '../../src/wire/flatten';
import { resolvePageLayers } from '../../src/dto/PageRender';
import {
  annotationAppearancesImageOptionsToToken,
  pageRenderOptionsFromImageOptions,
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

  test('carries no form fields: who may read the form is not in the path', () => {
    for (const includeFormFields of [undefined, true, false]) {
      const token = renderImageOptionsToToken(
        { format: 'webp', ...(includeFormFields === undefined ? {} : { includeFormFields }) },
        versions,
      );
      expect(token).not.toContain('formFields');
    }
    expect(() =>
      PageRenderAnnotatedQuerySchema.parse(
        unflatten(
          decodeRenderToken('annotationVersion=5,contentVersion=2,format=webp,formFields=false'),
        ),
      ),
    ).toThrow();
    expect(() =>
      PageRenderQuerySchema.parse(
        unflatten(decodeRenderToken('contentVersion=2,format=webp,formFields=false')),
      ),
    ).toThrow();
  });

  test('a cloud picture never draws form fields', () => {
    const query = PageRenderAnnotatedQuerySchema.parse(
      unflatten(decodeRenderToken(renderImageOptionsToToken({ format: 'webp' }, versions))),
    );
    expect(pageRenderOptionsFromImageOptions(query.options, true)).toMatchObject({
      includeAnnotations: true,
      includeFormFields: false,
    });
  });
});

describe('what a page picture draws', () => {
  const everything = { annotations: true, formFields: true };
  const fillOnly = { annotations: false, formFields: true };
  const commentOnly = { annotations: true, formFields: false };

  test('an option left out draws what the caller may read', () => {
    expect(resolvePageLayers(undefined, everything)).toEqual({
      includeAnnotations: true,
      includeFormFields: true,
    });
    expect(resolvePageLayers({}, fillOnly)).toEqual({
      includeAnnotations: false,
      includeFormFields: true,
    });
    expect(resolvePageLayers({}, commentOnly)).toEqual({
      includeAnnotations: true,
      includeFormFields: false,
    });
  });

  test('turning annotations off turns form fields off too, unless asked for', () => {
    expect(resolvePageLayers({ includeAnnotations: false }, everything)).toEqual({
      includeAnnotations: false,
      includeFormFields: false,
    });
    expect(
      resolvePageLayers({ includeAnnotations: false, includeFormFields: true }, everything),
    ).toEqual({ includeAnnotations: false, includeFormFields: true });
  });

  test('asking for what the caller may not read is refused, naming the option', () => {
    expect(() => resolvePageLayers({ includeAnnotations: true }, fillOnly)).toThrow(
      expect.objectContaining({
        code: EngineErrorCode.Forbidden,
        details: expect.objectContaining({
          required: 'doc.annotate.read',
          context: 'includeAnnotations',
        }),
      }),
    );
    expect(() => resolvePageLayers({ includeFormFields: true }, commentOnly)).toThrow(
      expect.objectContaining({
        details: expect.objectContaining({
          required: 'doc.forms.read',
          context: 'includeFormFields',
        }),
      }),
    );
  });
});

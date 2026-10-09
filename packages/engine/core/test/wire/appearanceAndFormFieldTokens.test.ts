import { describe, expect, test } from 'vitest';

import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { unflatten } from '../../src/wire/flatten';
import { resolvePageLayers } from '../../src/dto/PageRender';
import {
  annotationAppearancesImageOptionsToToken,
  pageRenderOptionsFromImageOptions,
  renderImageOptionsToToken,
  type RenderVersions,
} from '../../src/wire/renderOptionsCodec';
import { PAGE_RENDER_FAMILIES, pageRenderFamilyOf } from '../../src/wire/renderFamilies';
import { AnnotationAppearancesQuerySchema, PageRenderQuerySchemas } from '../../src/wire/schemas';
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
  const queryOf = (family: keyof typeof PAGE_RENDER_FAMILIES, token: string) =>
    PageRenderQuerySchemas[family].parse(unflatten(decodeRenderToken(token)));

  test('says nothing of what the picture draws: the family is the path', () => {
    for (const includeFormFields of [undefined, true, false]) {
      const token = renderImageOptionsToToken(
        {
          format: 'webp',
          includeAnnotations: true,
          ...(includeFormFields === undefined ? {} : { includeFormFields }),
        },
        { contentVersion: 2 },
      );
      expect(token).toBe('contentVersion=2,format=webp');
    }
    expect(() => queryOf('all', 'contentVersion=2,format=webp,formFields=false')).toThrow();
  });

  test("each family's token carries exactly its own pins", () => {
    const pins = { contentVersion: 2, annotationVersion: 5, widgetVersion: 7 };
    for (const spec of Object.values(PAGE_RENDER_FAMILIES)) {
      const own: RenderVersions = { contentVersion: pins.contentVersion };
      for (const pin of spec.pins) own[pin] = pins[pin];
      const query = queryOf(spec.family, renderImageOptionsToToken({ format: 'webp' }, own));
      expect(query).toMatchObject(own);
      // The family stamps what it draws; the worker options follow.
      expect(pageRenderOptionsFromImageOptions(query.options)).toMatchObject(spec.draws);
      expect(pageRenderFamilyOf(spec.draws)).toBe(spec.family);
      // Without one of its pins a versioned request is refused...
      for (const pin of spec.pins.filter((p) => p !== 'contentVersion')) {
        const missing = { ...own, [pin]: undefined };
        expect(() =>
          queryOf(spec.family, renderImageOptionsToToken({ format: 'webp' }, missing)),
        ).toThrow();
      }
      // ...and so is a pin of a plane it doesn't draw.
      for (const pin of ['annotationVersion', 'widgetVersion'] as const) {
        if (spec.pins.includes(pin)) continue;
        expect(() =>
          queryOf(
            spec.family,
            renderImageOptionsToToken({ format: 'webp' }, { ...own, [pin]: pins[pin] }),
          ),
        ).toThrow();
      }
    }
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

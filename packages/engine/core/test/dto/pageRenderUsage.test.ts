import { describe, expect, it } from 'vitest';

import { checkRenderUsage, type PagePictureRights } from '../../src/dto/PageRender';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';

const NONE: PagePictureRights = { render: false, thumbnail: false, print: false, printHigh: false };
const may = (rights: Partial<PagePictureRights>): PagePictureRights => ({ ...NONE, ...rights });
const refusal = (run: () => void) => {
  try {
    run();
  } catch (error) {
    const { code, details } = error as { code: string; details?: { required?: string } };
    return { code, required: details?.required };
  }
  return null;
};

describe('checkRenderUsage: each picture needs its own right and no other', () => {
  it('a screen picture needs doc.render', () => {
    expect(refusal(() => checkRenderUsage({}, may({ render: true })))).toBeNull();
    expect(refusal(() => checkRenderUsage({}, may({ thumbnail: true, print: true })))).toEqual({
      code: EngineErrorCode.Forbidden,
      required: 'doc.render',
    });
  });

  it('a thumbnail needs doc.render.thumbnail, not doc.render', () => {
    const thumbnail = { viewport: { kind: 'thumbnail' } } as const;
    expect(refusal(() => checkRenderUsage(thumbnail, may({ thumbnail: true })))).toBeNull();
    expect(refusal(() => checkRenderUsage(thumbnail, may({ render: true })))).toEqual({
      code: EngineErrorCode.Forbidden,
      required: 'doc.render.thumbnail',
    });
  });

  it('a print picture needs doc.print, not doc.render, and 300 DPI doc.print.high', () => {
    const print = (dpi: 150 | 300) => ({ usage: 'print', viewport: { kind: 'dpi', dpi } }) as const;
    expect(refusal(() => checkRenderUsage(print(150), may({ print: true })))).toBeNull();
    expect(refusal(() => checkRenderUsage(print(300), may({ print: true })))).toEqual({
      code: EngineErrorCode.Forbidden,
      required: 'doc.print.high',
    });
    expect(refusal(() => checkRenderUsage(print(150), may({ render: true })))).toEqual({
      code: EngineErrorCode.Forbidden,
      required: 'doc.print',
    });
  });

  it("without the caller's rights, only the shape is checked: the server decides", () => {
    expect(refusal(() => checkRenderUsage({ viewport: { kind: 'thumbnail' } }, null))).toBeNull();
    expect(refusal(() => checkRenderUsage({}, null))).toBeNull();
  });

  it('a thumbnail is the whole page, for the screen', () => {
    const rect = { kind: 'rect', rect: { x: 0, y: 0, width: 50, height: 50 } } as const;
    expect(
      refusal(() =>
        checkRenderUsage(
          { viewport: { kind: 'thumbnail' }, target: rect },
          may({ thumbnail: true }),
        ),
      ),
    ).toMatchObject({ code: EngineErrorCode.InvalidArg });
    expect(
      refusal(() =>
        checkRenderUsage(
          { viewport: { kind: 'thumbnail' }, target: { kind: 'page' } },
          may({ thumbnail: true }),
        ),
      ),
    ).toBeNull();
    expect(
      refusal(() =>
        checkRenderUsage({ usage: 'print', viewport: { kind: 'thumbnail' } }, may({ print: true })),
      ),
    ).toMatchObject({ code: EngineErrorCode.InvalidArg });
  });
});

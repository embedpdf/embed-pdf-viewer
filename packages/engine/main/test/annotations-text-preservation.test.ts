import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type {
  CalloutLine,
  DocumentHandle,
  Engine,
  FreeTextAnnotationDTO,
  FreeTextPatch,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const TEXT = 'Keep this text';
const RECT = { left: 80, bottom: 180, right: 380, top: 280 };

/** A legacy FreeText has /Contents and /DA, with no rich-text /RC. */
function fixture(legacy: boolean, callout: boolean): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /Resources << /Font << /Helv 5 0 R >> >> /Contents 4 0 R /Annots [${legacy ? '6 0 R' : ''}] >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /Annot /Subtype /FreeText /Rect [80 180 380 280] /F 4 /Contents (${TEXT}) /DA (/Helv 18 Tf 0 0 0 rg) /Q 0 /IT /${callout ? 'FreeTextCallout /CL [90 190 120 240] /RD [40 20 0 0]' : 'FreeText'} >>`,
  ];
  let text = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = text.length;
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

async function annotation(doc: DocumentHandle): Promise<FreeTextAnnotationDTO> {
  return (await doc.page(3).annotations.list()).annotations[0] as FreeTextAnnotationDTO;
}

function expectText(dto: FreeTextAnnotationDTO): void {
  expect(dto.contents).toBe(TEXT);
  expect(dto.richText.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join('')).toBe(TEXT);
}

describe('FreeText and Callout partial updates preserve text (wasm)', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  for (const callout of [false, true]) {
    test.each(['plain', 'rich', 'legacy'] as const)(
      `contents omitted from updates survives download/reopen: %s, callout=${callout}`,
      async (source) => {
        const open = (bytes: Uint8Array) =>
          engine.open({ kind: 'bytes', id: `text-${source}-${callout}`, bytes });
        let doc = await open(fixture(source === 'legacy', callout));
        try {
          if (source !== 'legacy') {
            await doc.page(3).annotations.create({
              subtype: 'free-text',
              intent: callout ? 'free-text-callout' : 'free-text',
              rect: RECT,
              fontFamily: 'helvetica',
              fontSize: 18,
              textAlign: 'left',
              ...(callout
                ? {
                    calloutLine: [
                      { x: 90, y: 190 },
                      { x: 120, y: 240 },
                    ],
                    rectDifferences: { left: 40, bottom: 20, right: 0, top: 0 },
                  }
                : {}),
              ...(source === 'rich'
                ? {
                    richText: {
                      paragraphs: [
                        {
                          runs: [
                            { text: 'Keep ' },
                            { text: 'this', style: { weight: 700 } },
                            { text: ' text' },
                          ],
                        },
                      ],
                    },
                  }
                : { contents: TEXT }),
            });
          }

          // Exercise edits on both the live annotation and the saved/reopened one.
          for (let cycle = 0; cycle < 2; cycle++) {
            const ref = (await annotation(doc)).ref;
            const patches: FreeTextPatch[] = [
              { subtype: 'free-text', color: { r: 20 + cycle, g: 40, b: 60 } },
              { subtype: 'free-text', fontSize: 20 + cycle, fontColor: { r: 0, g: 40, b: 120 } },
              {
                subtype: 'free-text',
                fontFamily: cycle ? 'helvetica' : 'times-roman',
                textAlign: cycle ? 'left' : 'center',
              },
              { subtype: 'free-text', interiorColor: { r: 240, g: 245, b: 250 }, opacity: 0.9 },
              { subtype: 'free-text', rect: { ...RECT, right: 410 + cycle * 10 } },
              { subtype: 'free-text', subject: `metadata-only-${cycle}` },
              ...(callout
                ? [
                    {
                      subtype: 'free-text' as const,
                      calloutLine: [
                        { x: 85 + cycle, y: 185 },
                        { x: 120, y: 240 },
                      ] as CalloutLine,
                    },
                  ]
                : []),
            ];
            for (const patch of patches) {
              // Deliberately never re-attach contents or richText to these patches.
              const result = await doc.page(3).annotations.update(ref, patch);
              expectText(result.updated as FreeTextAnnotationDTO);
              expectText(await annotation(doc));
            }

            const before = (await doc.page(3).annotations.renderAppearances()).appearances[0]!
              .raster;
            const saved = await doc.download();
            await doc.close();
            doc = await open(saved);
            expectText(await annotation(doc));
            const after = (await doc.page(3).annotations.renderAppearances()).appearances[0]!
              .raster;
            expect([after.width, after.height]).toEqual([before.width, before.height]);
            expect(new Uint8Array(after.data)).toEqual(new Uint8Array(before.data));

            // Read text from the persisted appearance's actual drawing commands,
            // not just /Contents: the downloaded PDF must visibly contain it.
            const bytes = await doc.page(3).annotations.exportAppearance!([
              (await annotation(doc)).ref,
            ]);
            const appearance = await engine.open({ kind: 'bytes', id: 'text-appearance', bytes });
            try {
              const page = (await appearance.pages.list()).pages[0]!;
              const text = await appearance.page(page.pageObjectNumber).text.read();
              expect(text.text).toContain(TEXT);
            } finally {
              await appearance.close();
            }
          }
        } finally {
          await doc.close();
        }
      },
    );

    test(`explicit empty contents still clears text, callout=${callout}`, async () => {
      let doc = await engine.open({
        kind: 'bytes',
        id: 'clear-text',
        bytes: fixture(true, callout),
      });
      try {
        const result = await doc.page(3).annotations.update((await annotation(doc)).ref, {
          subtype: 'free-text',
          contents: '',
        });
        expect(result.updated.contents).toBe('');
        const bytes = await doc.download();
        await doc.close();
        doc = await engine.open({ kind: 'bytes', id: 'cleared-text', bytes });
        expect((await annotation(doc)).contents).toBe('');
      } finally {
        await doc.close();
      }
    });
  }
});

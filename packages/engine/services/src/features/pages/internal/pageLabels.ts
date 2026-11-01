import {
  EngineError,
  EngineErrorCode,
  type PageLabelSection,
  type PageLabelStyle,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withI32Array, withScratchN } from '../../../runtime/memory/scratch';
import { readUtf16String } from '../../../runtime/memory/strings';
import { I32_BYTES, readI32 } from '../../../runtime/memory/structs';
import { withWideStringArray } from '../../../runtime/memory/wideStringArray';

/** `EPDF_PAGE_LABEL_STYLE_*` (public/epdf_doc.h), by value: 0 is no number. */
const STYLES: readonly (PageLabelStyle | null)[] = [
  null,
  'decimal',
  'upperRoman',
  'lowerRoman',
  'upperLetters',
  'lowerLetters',
];

/**
 * The document's page label sections, as the fork reads `/PageLabels`
 * (`EPDFDoc_GetPageLabelSectionAt`): in page order, the first at page 0.
 * Empty when the document has none.
 */
export function readLabelSections(runtime: PdfRuntimeModule, docPtr: Ptr): PageLabelSection[] {
  const { fn, mem } = runtime;
  const count = fn.EPDFDoc_GetPageLabelSectionCount(docPtr);
  const sections: PageLabelSection[] = [];
  withScratchN(mem, [I32_BYTES, I32_BYTES, I32_BYTES], ([firstPagePtr, stylePtr, numberPtr]) => {
    for (let index = 0; index < count; index++) {
      const prefix = readUtf16String(mem, (buf, capacity) =>
        fn.EPDFDoc_GetPageLabelSectionAt(
          docPtr,
          index,
          buf,
          capacity,
          firstPagePtr,
          stylePtr,
          numberPtr,
        ),
      );
      sections.push({
        firstPage: readI32(mem, firstPagePtr),
        style: STYLES[readI32(mem, stylePtr)] ?? null,
        firstNumber: readI32(mem, numberPtr),
        prefix: prefix ?? '',
      });
    }
  });
  return sections;
}

/**
 * Writes `sections` as the document's `/PageLabels`; none removes it. The
 * sections are the caller's to get right: the first at page 0, each after the
 * one before, every one at a page.
 */
export function writeLabelSections(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  sections: readonly PageLabelSection[],
): void {
  const { fn, mem } = runtime;
  const written = withI32Array(
    mem,
    sections.map((section) => section.firstPage),
    (firstPages) =>
      withI32Array(
        mem,
        sections.map((section) => STYLES.indexOf(section.style)),
        (styles) =>
          withI32Array(
            mem,
            sections.map((section) => section.firstNumber),
            (firstNumbers) =>
              withWideStringArray(
                runtime,
                sections.map((section) => section.prefix),
                (prefixes, count) =>
                  fn.EPDFDoc_SetPageLabelSections(
                    docPtr,
                    firstPages,
                    styles,
                    firstNumbers,
                    prefixes,
                    count,
                  ),
              ),
          ),
      ),
  );
  if (!written) {
    throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_SetPageLabelSections refused', {
      details: { sections: sections.length },
    });
  }
}

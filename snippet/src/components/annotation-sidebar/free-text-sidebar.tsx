import { Fragment, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

import {
  PdfFreeTextAnnoObject,
  PdfStandardFont,
  PdfStandardFontFamily,
  standardFontFamily,
  standardFontIsBold,
  standardFontIsItalic,
  makeStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
} from '@embedpdf/models';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';

import { SidebarPropsBase } from './common';
import { useDebounce } from '@/hooks/use-debounce';
import { ColorSwatch, Slider, FontFamilySelect, FontSizeInputSelect } from './ui';
import { Icon } from '../ui/icon';

export const FreeTextSidebar = ({
  selected,
  activeTool,
  colorPresets,
}: SidebarPropsBase<PdfFreeTextAnnoObject>) => {
  /* ────────────────────────  Model / capability  ─────────────────────── */
  const { provides: annotation } = useAnnotationCapability();
  if (!annotation) return null;

  const anno = selected?.object;
  const defaults = activeTool?.defaults;
  const editing = !!anno;

  /* ────────────────────────  Derive initial values  ──────────────────── */
  const baseFont: PdfStandardFont = editing
    ? anno.fontFamily
    : (defaults?.fontFamily ?? PdfStandardFont.Helvetica);
  const baseFamily = standardFontFamily(baseFont);
  const baseBold = standardFontIsBold(baseFont);
  const baseItalic = standardFontIsItalic(baseFont);

  const baseFontColor = editing ? anno.fontColor : (defaults?.fontColor ?? '#000000');
  const baseOpacity = editing ? anno.opacity : (defaults?.opacity ?? 1);
  const baseBackgroundColor = editing
    ? anno.backgroundColor
    : (defaults?.backgroundColor ?? '#000000');
  const baseFontSize = editing ? anno.fontSize : (defaults?.fontSize ?? 12);
  const baseTextAlign = editing ? anno.textAlign : (defaults?.textAlign ?? PdfTextAlignment.Left);
  const baseVerticalAlign = editing
    ? anno.verticalAlign
    : (defaults?.verticalAlign ?? PdfVerticalAlignment.Top);

  /* ────────────────────────  UI state  ───────────────────────────────── */
  const [fontFamily, setFontFamily] = useState(baseFamily);
  const [fontSize, setFontSize] = useState(baseFontSize);
  const [bold, setBold] = useState(baseBold);
  const [italic, setItalic] = useState(baseItalic);
  const [textAlign, setTextAlign] = useState(baseTextAlign);
  const [verticalAlign, setVerticalAlign] = useState(baseVerticalAlign);

  const [fontColor, setFontColor] = useState(baseFontColor);
  const [opacity, setOpacity] = useState(baseOpacity);
  const [backgroundColor, setBackgroundColor] = useState(baseBackgroundColor);

  /* ────────────────────────  Keep state in sync if annotation changes  ─ */
  useEffect(() => {
    setFontFamily(baseFamily);
    setBold(baseBold);
    setItalic(baseItalic);
  }, [baseFamily, baseBold, baseItalic]);

  useEffect(() => setFontColor(baseFontColor), [baseFontColor]);
  useEffect(() => setOpacity(baseOpacity), [baseOpacity]);
  useEffect(() => setBackgroundColor(baseBackgroundColor), [baseBackgroundColor]);
  useEffect(() => setFontSize(baseFontSize), [baseFontSize]);
  useEffect(() => setTextAlign(baseTextAlign), [baseTextAlign]);
  useEffect(() => setVerticalAlign(baseVerticalAlign), [baseVerticalAlign]);

  /* ────────────────────────  Patch helper  ───────────────────────────── */
  function applyPatch(patch: Partial<PdfFreeTextAnnoObject>) {
    if (!annotation) return;
    if (editing) {
      annotation.updateAnnotation(anno.pageIndex, anno.id, patch);
    } else if (activeTool) {
      annotation.setToolDefaults(activeTool.id, patch);
    }
  }

  /* ────────────────────────  Colour / opacity handlers  ──────────────── */
  const debOpacity = useDebounce(opacity, 300);
  const debBackgroundColor = useDebounce(backgroundColor, 300);
  useEffect(() => applyPatch({ opacity: debOpacity }), [debOpacity]);
  useEffect(() => applyPatch({ backgroundColor: debBackgroundColor }), [debBackgroundColor]);

  const changeFontColor = (c: string) => {
    setFontColor(c);
    applyPatch({ fontColor: c });
  };

  const changeBackgroundColor = (c: string) => {
    setBackgroundColor(c);
    applyPatch({ backgroundColor: c });
  };

  /* ────────────────────────  Font-size handler  ──────────────────────── */
  const changeFontSize = (size: number) => {
    if (!Number.isFinite(size) || size <= 0) return;
    setFontSize(size);
    applyPatch({ fontSize: size });
  };

  /* dropdown handled by FontSizeInputSelect */

  /* ────────────────────────  Font handlers  ──────────────────────────── */
  const updateFontEnum = (fam: PdfStandardFontFamily, b: boolean, i: boolean) => {
    const id = makeStandardFont(fam, { bold: b, italic: i });
    applyPatch({ fontFamily: id });
  };

  const onFamilyChange = (fam: PdfStandardFontFamily) => {
    /* when family changes, keep bold/italic only if supported */
    const supportsBold = standardFontIsBold(makeStandardFont(fam, { bold: true, italic: false }));
    const supportsItalic = standardFontIsItalic(
      makeStandardFont(fam, { bold: false, italic: true }),
    );
    const newBold = supportsBold ? bold : false;
    const newItalic = supportsItalic ? italic : false;

    setFontFamily(fam);
    setBold(newBold);
    setItalic(newItalic);
    updateFontEnum(fam, newBold, newItalic);
  };

  const toggleBold = () => {
    const supports = standardFontIsBold(
      makeStandardFont(fontFamily, { bold: true, italic: false }),
    );
    if (!supports) return;
    const newBold = !bold;
    setBold(newBold);
    updateFontEnum(fontFamily, newBold, italic);
  };

  const toggleItalic = () => {
    const supports = standardFontIsItalic(
      makeStandardFont(fontFamily, { bold: false, italic: true }),
    );
    if (!supports) return;
    const newItalic = !italic;
    setItalic(newItalic);
    updateFontEnum(fontFamily, bold, newItalic);
  };

  const changeTextAlign = (align: PdfTextAlignment) => {
    setTextAlign(align);
    applyPatch({ textAlign: align });
  };

  const changeVerticalAlign = (align: PdfVerticalAlignment) => {
    setVerticalAlign(align);
    applyPatch({ verticalAlign: align });
  };

  /* ────────────────────────  Render  ─────────────────────────────────── */
  return (
    <Fragment>
      {/* font family + style */}
      <section class="mb-6">
        <label class="mb-2 block text-sm font-medium text-gray-900">Font</label>

        {/* Family + size */}
        <div class="mb-3 flex gap-2">
          <FontFamilySelect value={fontFamily} onChange={onFamilyChange} />
          <div class="w-36">
            <FontSizeInputSelect value={fontSize} onChange={changeFontSize} />
          </div>
        </div>

        {/* Bold / Italic toggles */}
        <div class="flex gap-2">
          <button
            type="button"
            title="Bold"
            disabled={
              !standardFontIsBold(makeStandardFont(fontFamily, { bold: true, italic: false }))
            }
            onClick={toggleBold}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm font-bold ${
              bold ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="bold" size={18} />
          </button>

          <button
            type="button"
            title="Italic"
            disabled={
              !standardFontIsItalic(makeStandardFont(fontFamily, { bold: false, italic: true }))
            }
            onClick={toggleItalic}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm italic ${
              italic ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="italic" size={18} />
          </button>
        </div>
      </section>

      {/* text alignment */}
      <section class="mb-6">
        <label class="mb-2 block text-sm font-medium text-gray-900">Text alignment</label>
        <div class="flex gap-2">
          <button
            type="button"
            title="Align left"
            onClick={() => changeTextAlign(PdfTextAlignment.Left)}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm ${
              textAlign === PdfTextAlignment.Left
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="alignLeft" size={18} />
          </button>
          <button
            type="button"
            title="Align center"
            onClick={() => changeTextAlign(PdfTextAlignment.Center)}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm ${
              textAlign === PdfTextAlignment.Center
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="alignCenter" size={18} />
          </button>
          <button
            type="button"
            title="Align right"
            onClick={() => changeTextAlign(PdfTextAlignment.Right)}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm ${
              textAlign === PdfTextAlignment.Right
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="alignRight" size={18} />
          </button>
        </div>
      </section>

      {/* vertical alignment */}
      <section class="mb-6">
        <label class="mb-2 block text-sm font-medium text-gray-900">Vertical alignment</label>
        <div class="flex gap-2">
          <button
            type="button"
            title="Align top"
            onClick={() => changeVerticalAlign(PdfVerticalAlignment.Top)}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm ${
              verticalAlign === PdfVerticalAlignment.Top
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="alignTop" size={18} />
          </button>
          <button
            type="button"
            title="Align middle"
            onClick={() => changeVerticalAlign(PdfVerticalAlignment.Middle)}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm ${
              verticalAlign === PdfVerticalAlignment.Middle
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="alignMiddle" size={18} />
          </button>
          <button
            type="button"
            title="Align bottom"
            onClick={() => changeVerticalAlign(PdfVerticalAlignment.Bottom)}
            class={`h-9 w-9 rounded border border-gray-300 px-2 py-1 text-sm ${
              verticalAlign === PdfVerticalAlignment.Bottom
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-900'
            } disabled:opacity-40`}
          >
            <Icon icon="alignBottom" size={18} />
          </button>
        </div>
      </section>

      {/* font colour */}
      <section class="mb-6">
        <label class="mb-3 block text-sm font-medium text-gray-900">Font colour</label>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch key={c} color={c} active={c === fontColor} onSelect={changeFontColor} />
          ))}
        </div>
      </section>

      {/* background colour */}
      <section class="mb-6">
        <label class="mb-3 block text-sm font-medium text-gray-900">Background colour</label>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={c === backgroundColor}
              onSelect={changeBackgroundColor}
            />
          ))}
          {/* “no fill” swatch */}
          <ColorSwatch
            color="transparent"
            active={backgroundColor === 'transparent'}
            onSelect={changeBackgroundColor}
          />
        </div>
      </section>

      {/* opacity */}
      <section class="mb-6">
        <label class="mb-1 block text-sm font-medium text-gray-900">Opacity</label>
        <Slider value={opacity} min={0.1} max={1} step={0.05} onChange={setOpacity} />
        <span class="text-xs text-gray-500">{Math.round(opacity * 100)}%</span>
      </section>
    </Fragment>
  );
};

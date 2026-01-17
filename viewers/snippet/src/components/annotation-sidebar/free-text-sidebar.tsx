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
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

import { SidebarPropsBase } from './common';
import { useDebounce } from '@/hooks/use-debounce';
import {
  ColorSwatch,
  Slider,
  FontFamilySelect,
  FontSizeInputSelect,
  Section,
  SectionLabel,
  ValueDisplay,
} from './ui';
import { Icon } from '../ui/icon';
import { ToggleButton } from '../ui/toggle-button';

export const FreeTextSidebar = ({
  documentId,
  selected,
  activeTool,
  colorPresets,
}: SidebarPropsBase<PdfFreeTextAnnoObject>) => {
  /* ────────────────────────  Model / capability  ─────────────────────── */
  const { provides: annotation } = useAnnotationCapability();
  const { translate } = useTranslations(documentId);
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

  /* ────────────────────────  Font handlers  ──────────────────────────── */
  const updateFontEnum = (fam: PdfStandardFontFamily, b: boolean, i: boolean) => {
    const id = makeStandardFont(fam, { bold: b, italic: i });
    applyPatch({ fontFamily: id });
  };

  const onFamilyChange = (fam: PdfStandardFontFamily) => {
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
      <Section>
        <SectionLabel>{translate('annotation.font')}</SectionLabel>

        {/* Family + size */}
        <div class="mb-3 flex gap-2">
          <FontFamilySelect value={fontFamily} onChange={onFamilyChange} />
          <div class="w-36">
            <FontSizeInputSelect value={fontSize} onChange={changeFontSize} />
          </div>
        </div>

        {/* Bold / Italic toggles */}
        <div class="flex gap-2">
          <ToggleButton
            title={translate('annotation.fontBold')}
            active={bold}
            disabled={
              !standardFontIsBold(makeStandardFont(fontFamily, { bold: true, italic: false }))
            }
            onClick={toggleBold}
            className="font-bold"
          >
            <Icon icon="bold" size={18} />
          </ToggleButton>

          <ToggleButton
            title={translate('annotation.fontItalic')}
            active={italic}
            disabled={
              !standardFontIsItalic(makeStandardFont(fontFamily, { bold: false, italic: true }))
            }
            onClick={toggleItalic}
            className="italic"
          >
            <Icon icon="italic" size={18} />
          </ToggleButton>
        </div>
      </Section>

      {/* text alignment */}
      <Section>
        <SectionLabel>{translate('annotation.textAlign')}</SectionLabel>
        <div class="flex gap-2">
          <ToggleButton
            title={translate('annotation.textAlignLeft')}
            active={textAlign === PdfTextAlignment.Left}
            onClick={() => changeTextAlign(PdfTextAlignment.Left)}
          >
            <Icon icon="alignLeft" size={18} />
          </ToggleButton>
          <ToggleButton
            title={translate('annotation.textAlignCenter')}
            active={textAlign === PdfTextAlignment.Center}
            onClick={() => changeTextAlign(PdfTextAlignment.Center)}
          >
            <Icon icon="alignCenter" size={18} />
          </ToggleButton>
          <ToggleButton
            title={translate('annotation.textAlignRight')}
            active={textAlign === PdfTextAlignment.Right}
            onClick={() => changeTextAlign(PdfTextAlignment.Right)}
          >
            <Icon icon="alignRight" size={18} />
          </ToggleButton>
        </div>
      </Section>

      {/* vertical alignment */}
      <Section>
        <SectionLabel>{translate('annotation.verticalAlign')}</SectionLabel>
        <div class="flex gap-2">
          <ToggleButton
            title={translate('annotation.verticalAlignTop')}
            active={verticalAlign === PdfVerticalAlignment.Top}
            onClick={() => changeVerticalAlign(PdfVerticalAlignment.Top)}
          >
            <Icon icon="alignTop" size={18} />
          </ToggleButton>
          <ToggleButton
            title={translate('annotation.verticalAlignMiddle')}
            active={verticalAlign === PdfVerticalAlignment.Middle}
            onClick={() => changeVerticalAlign(PdfVerticalAlignment.Middle)}
          >
            <Icon icon="alignMiddle" size={18} />
          </ToggleButton>
          <ToggleButton
            title={translate('annotation.verticalAlignBottom')}
            active={verticalAlign === PdfVerticalAlignment.Bottom}
            onClick={() => changeVerticalAlign(PdfVerticalAlignment.Bottom)}
          >
            <Icon icon="alignBottom" size={18} />
          </ToggleButton>
        </div>
      </Section>

      {/* font colour */}
      <Section>
        <SectionLabel className="mb-3">{translate('annotation.fontColor')}</SectionLabel>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch key={c} color={c} active={c === fontColor} onSelect={changeFontColor} />
          ))}
        </div>
      </Section>

      {/* background colour */}
      <Section>
        <SectionLabel className="mb-3">{translate('annotation.backgroundColor')}</SectionLabel>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={c === backgroundColor}
              onSelect={changeBackgroundColor}
            />
          ))}
          {/* "no fill" swatch */}
          <ColorSwatch
            color="transparent"
            active={backgroundColor === 'transparent'}
            onSelect={changeBackgroundColor}
          />
        </div>
      </Section>

      {/* opacity */}
      <Section>
        <SectionLabel>{translate('annotation.opacity')}</SectionLabel>
        <Slider value={opacity} min={0.1} max={1} step={0.05} onChange={setOpacity} />
        <ValueDisplay>{Math.round(opacity * 100)}%</ValueDisplay>
      </Section>
    </Fragment>
  );
};

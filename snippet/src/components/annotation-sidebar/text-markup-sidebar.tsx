import { Fragment, h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import {
  PdfBlendMode,
  PdfHighlightAnnoObject,
  PdfSquigglyAnnoObject,
  PdfStrikeOutAnnoObject,
  PdfUnderlineAnnoObject,
  blendModeValues,
} from '@embedpdf/models';
import { SidebarPropsBase } from './common';
import { Slider, ColorSwatch, Section, SectionLabel, ValueDisplay } from './ui';
import { useDebounce } from '../../hooks/use-debounce';

/** Map blend mode enum to translation key */
const BLEND_MODE_KEYS: Record<PdfBlendMode, string> = {
  [PdfBlendMode.Normal]: 'blendMode.normal',
  [PdfBlendMode.Multiply]: 'blendMode.multiply',
  [PdfBlendMode.Screen]: 'blendMode.screen',
  [PdfBlendMode.Overlay]: 'blendMode.overlay',
  [PdfBlendMode.Darken]: 'blendMode.darken',
  [PdfBlendMode.Lighten]: 'blendMode.lighten',
  [PdfBlendMode.ColorDodge]: 'blendMode.colorDodge',
  [PdfBlendMode.ColorBurn]: 'blendMode.colorBurn',
  [PdfBlendMode.HardLight]: 'blendMode.hardLight',
  [PdfBlendMode.SoftLight]: 'blendMode.softLight',
  [PdfBlendMode.Difference]: 'blendMode.difference',
  [PdfBlendMode.Exclusion]: 'blendMode.exclusion',
  [PdfBlendMode.Hue]: 'blendMode.hue',
  [PdfBlendMode.Saturation]: 'blendMode.saturation',
  [PdfBlendMode.Color]: 'blendMode.color',
  [PdfBlendMode.Luminosity]: 'blendMode.luminosity',
};

export const TextMarkupSidebar = ({
  documentId,
  selected,
  activeTool,
  colorPresets,
}: SidebarPropsBase<
  PdfHighlightAnnoObject | PdfUnderlineAnnoObject | PdfStrikeOutAnnoObject | PdfSquigglyAnnoObject
>) => {
  const { provides: annotation } = useAnnotationCapability();
  const { translate } = useTranslations(documentId);
  if (!annotation) return null;

  const anno = selected?.object;
  const defaults = activeTool?.defaults;
  const editing = !!anno;

  const baseColor = editing ? anno.color : (defaults?.color ?? '#FFFF00');
  const baseOpacity = editing ? anno.opacity : (defaults?.opacity ?? 1);
  const baseBlend = editing
    ? (anno.blendMode ?? PdfBlendMode.Normal)
    : (defaults?.blendMode ?? PdfBlendMode.Normal);

  const [color, setColor] = useState(baseColor);
  const [opacity, setOpacity] = useState(baseOpacity);
  const [blend, setBlend] = useState(baseBlend);

  useEffect(() => setColor(baseColor), [baseColor]);
  useEffect(() => setOpacity(baseOpacity), [baseOpacity]);
  useEffect(() => setBlend(baseBlend), [baseBlend]);

  const debOpacity = useDebounce(opacity, 300);
  useEffect(() => applyPatch({ opacity: debOpacity }), [debOpacity]);

  // Build translated blend mode options
  const blendOptions = useMemo(
    () =>
      blendModeValues.map((mode) => ({
        value: mode,
        label: translate(BLEND_MODE_KEYS[mode]),
      })),
    [translate],
  );

  const changeColor = (c: string) => {
    setColor(c);
    applyPatch({ color: c });
  };

  const changeBlend = (val: number) => {
    const bm = val as PdfBlendMode;
    setBlend(bm);
    applyPatch({ blendMode: bm });
  };

  function applyPatch(patch: Partial<any>) {
    if (!annotation) return;
    if (editing) {
      annotation.updateAnnotation(anno.pageIndex, anno.id, patch);
    } else if (activeTool) {
      annotation.setToolDefaults(activeTool.id, patch);
    }
  }

  return (
    <Fragment>
      {/* color */}
      <Section>
        <SectionLabel className="mb-3">{translate('annotation.color')}</SectionLabel>
        <div class="grid grid-cols-6 gap-x-1 gap-y-4">
          {colorPresets.map((c) => (
            <ColorSwatch key={c} color={c} active={c === color} onSelect={changeColor} />
          ))}
        </div>
      </Section>

      {/* opacity */}
      <Section>
        <SectionLabel>{translate('annotation.opacity')}</SectionLabel>
        <Slider value={opacity} min={0.1} max={1} step={0.05} onChange={setOpacity} />
        <ValueDisplay>{Math.round(opacity * 100)}%</ValueDisplay>
      </Section>

      {/* blend mode */}
      <Section>
        <SectionLabel>{translate('annotation.blendMode')}</SectionLabel>
        <select
          class="border-border-default bg-bg-input text-fg-primary w-full rounded border px-2 py-1 text-sm"
          value={blend}
          onChange={(e) => changeBlend(parseInt((e.target as HTMLSelectElement).value, 10))}
        >
          {blendOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>
    </Fragment>
  );
};
